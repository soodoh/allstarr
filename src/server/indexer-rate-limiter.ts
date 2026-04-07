import { eq } from "drizzle-orm";
import { db } from "src/db";
import { indexers, syncedIndexers } from "src/db/schema";

// ─── Types ───────────────────────────────────────────────────────────────────

type IndexerType = "manual" | "synced";

type IndexerRateState = {
	queriesInWindow: number;
	grabsInWindow: number;
	windowStart: number;
	lastQueryAt: number;
};

type RateConfig = {
	requestInterval: number;
	dailyQueryLimit: number;
	dailyGrabLimit: number;
};

type GateResult =
	| { allowed: true }
	| {
			allowed: false;
			reason: "backoff" | "pacing" | "daily_query_limit" | "daily_grab_limit";
			waitMs?: number;
	  };

export type IndexerStatus = {
	indexerId: number;
	indexerType: IndexerType;
	available: boolean;
	reason?: "backoff" | "pacing" | "daily_query_limit" | "daily_grab_limit";
	waitMs?: number;
	queriesUsed: number;
	grabsUsed: number;
	dailyQueryLimit: number;
	dailyGrabLimit: number;
	backoffUntil: number;
};

// ─── Constants ───────────────────────────────────────────────────────────────

const WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours
const MAX_BACKOFF_MS = 24 * 60 * 60 * 1000; // 24 hours
const BASE_ESCALATION_MS = 30 * 60 * 1000; // 30 minutes

// ─── In-memory state ─────────────────────────────────────────────────────────

const rateState = new Map<string, IndexerRateState>();

function stateKey(indexerType: IndexerType, indexerId: number): string {
	return `${indexerType}:${indexerId}`;
}

function getOrCreateState(key: string): IndexerRateState {
	let state = rateState.get(key);
	if (!state) {
		state = {
			queriesInWindow: 0,
			grabsInWindow: 0,
			windowStart: Date.now(),
			lastQueryAt: 0,
		};
		rateState.set(key, state);
	}
	// Reset window if expired
	if (Date.now() - state.windowStart > WINDOW_MS) {
		state.queriesInWindow = 0;
		state.grabsInWindow = 0;
		state.windowStart = Date.now();
	}
	return state;
}

// ─── DB helpers ──────────────────────────────────────────────────────────────

function getBackoff(
	indexerType: IndexerType,
	indexerId: number,
): { backoffUntil: number; escalationLevel: number } {
	const table = indexerType === "manual" ? indexers : syncedIndexers;
	const row = db
		.select({
			backoffUntil: table.backoffUntil,
			escalationLevel: table.escalationLevel,
		})
		.from(table)
		.where(eq(table.id, indexerId))
		.get();
	return row ?? { backoffUntil: 0, escalationLevel: 0 };
}

function getRateConfig(
	indexerType: IndexerType,
	indexerId: number,
): RateConfig {
	const table = indexerType === "manual" ? indexers : syncedIndexers;
	const row = db
		.select({
			requestInterval: table.requestInterval,
			dailyQueryLimit: table.dailyQueryLimit,
			dailyGrabLimit: table.dailyGrabLimit,
		})
		.from(table)
		.where(eq(table.id, indexerId))
		.get();
	return (
		row ?? { requestInterval: 5000, dailyQueryLimit: 0, dailyGrabLimit: 0 }
	);
}

function persistBackoff(
	indexerType: IndexerType,
	indexerId: number,
	backoffUntil: number,
	escalationLevel: number,
): void {
	const table = indexerType === "manual" ? indexers : syncedIndexers;
	db.update(table)
		.set({ backoffUntil, escalationLevel })
		.where(eq(table.id, indexerId))
		.run();
}

// ─── Gate functions ──────────────────────────────────────────────────────────

export function canQueryIndexer(
	indexerType: IndexerType,
	indexerId: number,
): GateResult {
	const now = Date.now();

	// 1. Check persisted backoff
	const { backoffUntil } = getBackoff(indexerType, indexerId);
	if (backoffUntil > 0 && now < backoffUntil) {
		return { allowed: false, reason: "backoff", waitMs: backoffUntil - now };
	}

	const config = getRateConfig(indexerType, indexerId);
	const key = stateKey(indexerType, indexerId);
	const state = getOrCreateState(key);

	// 2. Check pacing
	const elapsed = now - state.lastQueryAt;
	if (state.lastQueryAt > 0 && elapsed < config.requestInterval) {
		return {
			allowed: false,
			reason: "pacing",
			waitMs: config.requestInterval - elapsed,
		};
	}

	// 3. Check daily query cap
	if (
		config.dailyQueryLimit > 0 &&
		state.queriesInWindow >= config.dailyQueryLimit
	) {
		return { allowed: false, reason: "daily_query_limit" };
	}

	// Allowed — update pacing timestamp only (counter is incremented per HTTP call via recordQuery)
	state.lastQueryAt = now;
	return { allowed: true };
}

/** Record an actual HTTP query against the daily counter. Called per-request in fetchNewznabFeed. */
export function recordQuery(indexerType: IndexerType, indexerId: number): void {
	const key = stateKey(indexerType, indexerId);
	const state = getOrCreateState(key);
	state.queriesInWindow += 1;
	state.lastQueryAt = Date.now();
}

export function canGrabIndexer(
	indexerType: IndexerType,
	indexerId: number,
): GateResult {
	const config = getRateConfig(indexerType, indexerId);
	if (config.dailyGrabLimit <= 0) {
		return { allowed: true };
	}
	const key = stateKey(indexerType, indexerId);
	const state = getOrCreateState(key);
	if (state.grabsInWindow >= config.dailyGrabLimit) {
		return { allowed: false, reason: "daily_grab_limit" };
	}
	state.grabsInWindow += 1;
	return { allowed: true };
}

// ─── 429 handling ────────────────────────────────────────────────────────────

export function reportRateLimited(
	indexerType: IndexerType,
	indexerId: number,
	retryAfterMs?: number,
): void {
	const { escalationLevel } = getBackoff(indexerType, indexerId);
	const newLevel = escalationLevel + 1;
	const escalatedMs = Math.min(
		BASE_ESCALATION_MS * 2 ** escalationLevel,
		MAX_BACKOFF_MS,
	);
	const backoffMs =
		retryAfterMs && retryAfterMs > 0 ? retryAfterMs : escalatedMs;
	const backoffUntil = Date.now() + backoffMs;

	persistBackoff(indexerType, indexerId, backoffUntil, newLevel);
	console.log(
		`[rate-limiter] ${indexerType}:${indexerId} rate-limited, backoff until ${new Date(backoffUntil).toISOString()} (level ${newLevel})`,
	);
}

export function reportSuccess(
	indexerType: IndexerType,
	indexerId: number,
): void {
	const { escalationLevel, backoffUntil } = getBackoff(indexerType, indexerId);
	if (escalationLevel > 0 || backoffUntil > 0) {
		persistBackoff(indexerType, indexerId, 0, 0);
	}
}

// ─── Non-mutating status queries ─────────────────────────────────────────────

/** Check indexer availability without incrementing counters. */
function peekStatus(indexerType: IndexerType, indexerId: number): GateResult {
	const now = Date.now();

	const { backoffUntil } = getBackoff(indexerType, indexerId);
	if (backoffUntil > 0 && now < backoffUntil) {
		return { allowed: false, reason: "backoff", waitMs: backoffUntil - now };
	}

	const config = getRateConfig(indexerType, indexerId);
	const key = stateKey(indexerType, indexerId);
	const state = getOrCreateState(key);

	if (
		state.lastQueryAt > 0 &&
		now - state.lastQueryAt < config.requestInterval
	) {
		return {
			allowed: false,
			reason: "pacing",
			waitMs: config.requestInterval - (now - state.lastQueryAt),
		};
	}

	if (
		config.dailyQueryLimit > 0 &&
		state.queriesInWindow >= config.dailyQueryLimit
	) {
		return { allowed: false, reason: "daily_query_limit" };
	}

	return { allowed: true };
}

function getIndexerStatus(
	indexerType: IndexerType,
	indexerId: number,
): IndexerStatus {
	const config = getRateConfig(indexerType, indexerId);
	const { backoffUntil } = getBackoff(indexerType, indexerId);
	const key = stateKey(indexerType, indexerId);
	const state = getOrCreateState(key);

	const gate = peekStatus(indexerType, indexerId);

	return {
		indexerId,
		indexerType,
		available: gate.allowed,
		reason: gate.allowed ? undefined : gate.reason,
		waitMs: gate.allowed ? undefined : gate.waitMs,
		queriesUsed: state.queriesInWindow,
		grabsUsed: state.grabsInWindow,
		dailyQueryLimit: config.dailyQueryLimit,
		dailyGrabLimit: config.dailyGrabLimit,
		backoffUntil,
	};
}

export function anyIndexerAvailable(
	manualIds: number[],
	syncedIds: number[],
): boolean {
	for (const id of manualIds) {
		const gate = peekStatus("manual", id);
		if (gate.allowed || gate.reason === "pacing") {
			return true;
		}
	}
	for (const id of syncedIds) {
		const gate = peekStatus("synced", id);
		if (gate.allowed || gate.reason === "pacing") {
			return true;
		}
	}
	return false;
}

export function getAllIndexerStatuses(
	manualIds: number[],
	syncedIds: number[],
): IndexerStatus[] {
	return [
		...manualIds.map((id) => getIndexerStatus("manual", id)),
		...syncedIds.map((id) => getIndexerStatus("synced", id)),
	];
}
