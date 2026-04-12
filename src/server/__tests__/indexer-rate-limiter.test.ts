import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ─── Hoisted mocks ─────────────────────────────────────────────────────────

const mocks = vi.hoisted(() => ({
	selectGet: vi.fn(),
	updateRun: vi.fn(),
	logInfo: vi.fn(),
}));

vi.mock("drizzle-orm", () => ({
	eq: vi.fn((l: unknown, r: unknown) => ({ l, r })),
}));

vi.mock("src/db", () => ({
	db: {
		select: vi.fn(() => ({
			from: vi.fn(() => ({
				where: vi.fn(() => ({
					get: mocks.selectGet,
				})),
			})),
		})),
		update: vi.fn(() => ({
			set: vi.fn(() => ({
				where: vi.fn(() => ({
					run: mocks.updateRun,
				})),
			})),
		})),
	},
}));

vi.mock("src/db/schema", () => ({
	indexers: {
		id: "indexers.id",
		backoffUntil: "indexers.backoffUntil",
		escalationLevel: "indexers.escalationLevel",
		requestInterval: "indexers.requestInterval",
		dailyQueryLimit: "indexers.dailyQueryLimit",
		dailyGrabLimit: "indexers.dailyGrabLimit",
	},
	syncedIndexers: {
		id: "syncedIndexers.id",
		backoffUntil: "syncedIndexers.backoffUntil",
		escalationLevel: "syncedIndexers.escalationLevel",
		requestInterval: "syncedIndexers.requestInterval",
		dailyQueryLimit: "syncedIndexers.dailyQueryLimit",
		dailyGrabLimit: "syncedIndexers.dailyGrabLimit",
	},
}));

vi.mock("../logger", () => ({ logInfo: mocks.logInfo }));

// ─── Imports (after mocks) ──────────────────────────────────────────────────

import {
	anyIndexerAvailable,
	canGrabIndexer,
	canQueryIndexer,
	getAllIndexerStatuses,
	recordQuery,
	reportRateLimited,
	reportSuccess,
} from "../indexer-rate-limiter";

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Default DB responses: no backoff, generous limits, 5s pacing.
 * Returns a merged object with all fields so it works regardless of which
 * select shape (getBackoff vs getRateConfig) reads from it.
 */
function stubDefaults(overrides?: {
	backoffUntil?: number;
	escalationLevel?: number;
	requestInterval?: number;
	dailyQueryLimit?: number;
	dailyGrabLimit?: number;
}) {
	const row = {
		backoffUntil: overrides?.backoffUntil ?? 0,
		escalationLevel: overrides?.escalationLevel ?? 0,
		requestInterval: overrides?.requestInterval ?? 5000,
		dailyQueryLimit: overrides?.dailyQueryLimit ?? 100,
		dailyGrabLimit: overrides?.dailyGrabLimit ?? 50,
	};
	mocks.selectGet.mockReturnValue(row);
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("indexer-rate-limiter", () => {
	// Use a unique indexerId per test (auto-incrementing) so in-memory state
	// from one test doesn't bleed into the next.
	let nextId = 1;
	function freshId() {
		return nextId++;
	}

	beforeEach(() => {
		vi.useFakeTimers();
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	// ── canQueryIndexer ───────────────────────────────────────────────────

	describe("canQueryIndexer", () => {
		it("returns allowed when no backoff, pacing, or limits apply", () => {
			const id = freshId();
			stubDefaults();

			const result = canQueryIndexer("manual", id);

			expect(result).toStrictEqual({ allowed: true });
		});

		it("blocks when in backoff period", () => {
			const id = freshId();
			const now = Date.now();
			stubDefaults({ backoffUntil: now + 60_000 });

			const result = canQueryIndexer("manual", id);

			expect(result.allowed).toBe(false);
			if (!result.allowed) {
				expect(result.reason).toBe("backoff");
				expect(result.waitMs).toBeGreaterThan(0);
				expect(result.waitMs).toBeLessThanOrEqual(60_000);
			}
		});

		it("blocks when pacing interval has not elapsed", () => {
			const id = freshId();
			stubDefaults({ requestInterval: 10_000 });

			// First call succeeds and records lastQueryAt
			const first = canQueryIndexer("manual", id);
			expect(first.allowed).toBe(true);

			// Advance only 2s — still within 10s pacing
			vi.advanceTimersByTime(2_000);

			const second = canQueryIndexer("manual", id);

			expect(second.allowed).toBe(false);
			if (!second.allowed) {
				expect(second.reason).toBe("pacing");
				expect(second.waitMs).toBeGreaterThan(0);
			}
		});

		it("allows query after pacing interval has elapsed", () => {
			const id = freshId();
			stubDefaults({ requestInterval: 5_000 });

			canQueryIndexer("manual", id);
			vi.advanceTimersByTime(5_001);

			const result = canQueryIndexer("manual", id);

			expect(result.allowed).toBe(true);
		});

		it("blocks when daily query limit is reached", () => {
			const id = freshId();
			stubDefaults({ dailyQueryLimit: 3, requestInterval: 0 });

			// Record 3 queries to reach the limit
			for (let i = 0; i < 3; i++) {
				recordQuery("manual", id);
			}

			// Advance past pacing so that's not the blocker
			vi.advanceTimersByTime(1);

			const result = canQueryIndexer("manual", id);

			expect(result.allowed).toBe(false);
			if (!result.allowed) {
				expect(result.reason).toBe("daily_query_limit");
			}
		});

		it("works with synced indexer type", () => {
			const id = freshId();
			stubDefaults();

			const result = canQueryIndexer("synced", id);

			expect(result.allowed).toBe(true);
		});
	});

	// ── recordQuery ─────────────────────────────────────────────────────

	describe("recordQuery", () => {
		it("increments query counter", () => {
			const id = freshId();
			stubDefaults({ dailyQueryLimit: 5, requestInterval: 0 });

			// Record several queries
			recordQuery("manual", id);
			recordQuery("manual", id);
			recordQuery("manual", id);

			vi.advanceTimersByTime(1);

			// Should still be allowed (3 < 5)
			const result = canQueryIndexer("manual", id);
			expect(result.allowed).toBe(true);

			// Record 2 more to hit the limit
			recordQuery("manual", id);
			recordQuery("manual", id);
			vi.advanceTimersByTime(1);

			const blocked = canQueryIndexer("manual", id);
			expect(blocked.allowed).toBe(false);
			if (!blocked.allowed) {
				expect(blocked.reason).toBe("daily_query_limit");
			}
		});
	});

	// ── canGrabIndexer ──────────────────────────────────────────────────

	describe("canGrabIndexer", () => {
		it("allows grabs when no limit is set (dailyGrabLimit <= 0)", () => {
			const id = freshId();
			stubDefaults({ dailyGrabLimit: 0 });

			const result = canGrabIndexer("manual", id);
			expect(result).toStrictEqual({ allowed: true });
		});

		it("allows grabs when under limit", () => {
			const id = freshId();
			stubDefaults({ dailyGrabLimit: 3 });

			const result = canGrabIndexer("manual", id);
			expect(result.allowed).toBe(true);
		});

		it("blocks when daily grab limit is reached", () => {
			const id = freshId();
			stubDefaults({ dailyGrabLimit: 2 });

			// canGrabIndexer increments the counter on success
			canGrabIndexer("manual", id);
			canGrabIndexer("manual", id);

			const result = canGrabIndexer("manual", id);

			expect(result.allowed).toBe(false);
			if (!result.allowed) {
				expect(result.reason).toBe("daily_grab_limit");
			}
		});

		it("increments grab counter on each successful grab", () => {
			const id = freshId();
			stubDefaults({ dailyGrabLimit: 3 });

			expect(canGrabIndexer("manual", id).allowed).toBe(true); // 1
			expect(canGrabIndexer("manual", id).allowed).toBe(true); // 2
			expect(canGrabIndexer("manual", id).allowed).toBe(true); // 3
			expect(canGrabIndexer("manual", id).allowed).toBe(false); // blocked
		});
	});

	// ── reportRateLimited ───────────────────────────────────────────────

	describe("reportRateLimited", () => {
		it("persists escalated backoff to the database", () => {
			const id = freshId();
			// Start at escalation level 0
			mocks.selectGet.mockReturnValue({
				backoffUntil: 0,
				escalationLevel: 0,
			});

			reportRateLimited("manual", id);

			expect(mocks.updateRun).toHaveBeenCalled();
			expect(mocks.logInfo).toHaveBeenCalledWith(
				"rate-limiter",
				expect.stringContaining(`manual:${id}`),
			);
		});

		it("uses retryAfterMs when provided", () => {
			const id = freshId();
			mocks.selectGet.mockReturnValue({
				backoffUntil: 0,
				escalationLevel: 0,
			});

			reportRateLimited("manual", id, 120_000);

			expect(mocks.updateRun).toHaveBeenCalled();
			expect(mocks.logInfo).toHaveBeenCalledWith(
				"rate-limiter",
				expect.stringContaining("level 1"),
			);
		});

		it("escalates backoff level on repeated rate limits", () => {
			const id = freshId();

			// First rate limit: level 0 → 1
			mocks.selectGet.mockReturnValue({
				backoffUntil: 0,
				escalationLevel: 0,
			});
			reportRateLimited("manual", id);
			expect(mocks.logInfo).toHaveBeenCalledWith(
				"rate-limiter",
				expect.stringContaining("level 1"),
			);

			// Second rate limit: level 1 → 2
			mocks.selectGet.mockReturnValue({
				backoffUntil: Date.now() + 1_800_000,
				escalationLevel: 1,
			});
			reportRateLimited("manual", id);
			expect(mocks.logInfo).toHaveBeenCalledWith(
				"rate-limiter",
				expect.stringContaining("level 2"),
			);
		});
	});

	// ── reportSuccess ───────────────────────────────────────────────────

	describe("reportSuccess", () => {
		it("clears backoff when escalation level is > 0", () => {
			const id = freshId();
			mocks.selectGet.mockReturnValue({
				backoffUntil: Date.now() + 60_000,
				escalationLevel: 2,
			});

			reportSuccess("manual", id);

			expect(mocks.updateRun).toHaveBeenCalled();
		});

		it("does not write to DB when there is no backoff to clear", () => {
			const id = freshId();
			mocks.selectGet.mockReturnValue({
				backoffUntil: 0,
				escalationLevel: 0,
			});

			reportSuccess("manual", id);

			expect(mocks.updateRun).not.toHaveBeenCalled();
		});
	});

	// ── anyIndexerAvailable ─────────────────────────────────────────────

	describe("anyIndexerAvailable", () => {
		it("returns true if at least one manual indexer is available", () => {
			const id = freshId();
			stubDefaults();

			const result = anyIndexerAvailable([id], []);

			expect(result).toBe(true);
		});

		it("returns true if at least one synced indexer is available", () => {
			const id = freshId();
			stubDefaults();

			const result = anyIndexerAvailable([], [id]);

			expect(result).toBe(true);
		});

		it("returns false when no indexers are provided", () => {
			const result = anyIndexerAvailable([], []);

			expect(result).toBe(false);
		});

		it("returns true when indexer is only pacing-blocked (still considered available)", () => {
			const id = freshId();
			stubDefaults({ requestInterval: 60_000 });

			// First call to canQueryIndexer records lastQueryAt
			canQueryIndexer("manual", id);

			// Should still be considered available (pacing is temporary)
			const result = anyIndexerAvailable([id], []);

			expect(result).toBe(true);
		});

		it("returns false when all indexers are in backoff", () => {
			const manualId = freshId();
			const syncedId = freshId();
			stubDefaults({ backoffUntil: Date.now() + 600_000 });

			const result = anyIndexerAvailable([manualId], [syncedId]);

			expect(result).toBe(false);
		});

		it("returns false when all indexers are at daily query limit", () => {
			const id = freshId();
			stubDefaults({ dailyQueryLimit: 1, requestInterval: 0 });

			recordQuery("manual", id);
			vi.advanceTimersByTime(1);

			const result = anyIndexerAvailable([id], []);

			expect(result).toBe(false);
		});
	});

	// ── getAllIndexerStatuses ────────────────────────────────────────────

	describe("getAllIndexerStatuses", () => {
		it("returns status for all provided indexers", () => {
			const manualId = freshId();
			const syncedId = freshId();
			stubDefaults();

			const statuses = getAllIndexerStatuses([manualId], [syncedId]);

			expect(statuses).toHaveLength(2);
			expect(statuses[0].indexerType).toBe("manual");
			expect(statuses[0].indexerId).toBe(manualId);
			expect(statuses[0].available).toBe(true);
			expect(statuses[1].indexerType).toBe("synced");
			expect(statuses[1].indexerId).toBe(syncedId);
			expect(statuses[1].available).toBe(true);
		});

		it("includes usage counters and limits in status", () => {
			const id = freshId();
			stubDefaults({ dailyQueryLimit: 50, dailyGrabLimit: 20 });

			// Record some activity
			recordQuery("manual", id);
			recordQuery("manual", id);
			vi.advanceTimersByTime(5_001);

			const statuses = getAllIndexerStatuses([id], []);

			expect(statuses).toHaveLength(1);
			expect(statuses[0].queriesUsed).toBe(2);
			expect(statuses[0].dailyQueryLimit).toBe(50);
			expect(statuses[0].dailyGrabLimit).toBe(20);
		});

		it("returns empty array when no indexer IDs provided", () => {
			const statuses = getAllIndexerStatuses([], []);

			expect(statuses).toStrictEqual([]);
		});
	});

	// ── Window reset ────────────────────────────────────────────────────

	describe("24-hour window reset", () => {
		it("resets query counter after 24-hour window expires", () => {
			const id = freshId();
			stubDefaults({ dailyQueryLimit: 2, requestInterval: 0 });

			recordQuery("manual", id);
			recordQuery("manual", id);
			vi.advanceTimersByTime(1);

			// Should be blocked
			expect(canQueryIndexer("manual", id).allowed).toBe(false);

			// Advance past 24 hours
			vi.advanceTimersByTime(24 * 60 * 60 * 1000 + 1);

			// Should be allowed again — window reset
			const result = canQueryIndexer("manual", id);
			expect(result.allowed).toBe(true);
		});

		it("resets grab counter after 24-hour window expires", () => {
			const id = freshId();
			stubDefaults({ dailyGrabLimit: 1 });

			canGrabIndexer("manual", id); // uses the 1 grab
			expect(canGrabIndexer("manual", id).allowed).toBe(false);

			// Advance past 24 hours
			vi.advanceTimersByTime(24 * 60 * 60 * 1000 + 1);

			const result = canGrabIndexer("manual", id);
			expect(result.allowed).toBe(true);
		});
	});
});
