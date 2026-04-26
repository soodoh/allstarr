import { and, eq, inArray, lt } from "drizzle-orm";
import { jobRuns } from "src/db/schema";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
	const selectResults: unknown[][] = [];
	const insertValues: Array<Record<string, unknown>> = [];
	const updateSets: Array<Record<string, unknown>> = [];
	const updateReturningResults: unknown[][] = [];

	return {
		insertValues,
		selectResults,
		updateSets,
		updateReturningResults,
		clear() {
			selectResults.length = 0;
			insertValues.length = 0;
			updateSets.length = 0;
			updateReturningResults.length = 0;
		},
	};
});

vi.mock("drizzle-orm", () => ({
	and: vi.fn((...conditions: unknown[]) => ({ type: "and", conditions })),
	eq: vi.fn((left: unknown, right: unknown) => ({ type: "eq", left, right })),
	inArray: vi.fn((left: unknown, values: unknown[]) => ({
		type: "inArray",
		left,
		values,
	})),
	lt: vi.fn((left: unknown, right: unknown) => ({ type: "lt", left, right })),
}));

vi.mock("src/db", () => ({
	db: {
		insert: vi.fn(() => ({
			values: vi.fn((values: Record<string, unknown>) => {
				mocks.insertValues.push(values);

				return {
					returning: vi.fn(() => ({
						get: vi.fn(() => ({
							id: 10,
							createdAt: new Date("2026-04-26T12:00:00.000Z"),
							...values,
						})),
					})),
				};
			}),
		})),
		select: vi.fn(() => ({
			from: vi.fn(() => ({
				where: vi.fn(() => ({
					all: vi.fn(() => mocks.selectResults.shift() ?? []),
				})),
			})),
		})),
		update: vi.fn(() => ({
			set: vi.fn((values: Record<string, unknown>) => {
				mocks.updateSets.push(values);

				return {
					where: vi.fn(() => ({
						run: vi.fn(),
						returning: vi.fn(() => ({
							all: vi.fn(() => mocks.updateReturningResults.shift() ?? []),
						})),
					})),
				};
			}),
		})),
	},
}));

import {
	acquireJobRun,
	completeJobRun,
	failJobRun,
	heartbeatJobRun,
	JOB_HEARTBEAT_INTERVAL_MS,
	JOB_STALE_AFTER_MS,
	listActiveJobRuns,
	listVisibleScheduledJobRuns,
	markStaleJobRuns,
	NON_TERMINAL_JOB_STATUSES,
	updateJobRunProgress,
} from "./job-runs";

describe("job-runs service", () => {
	const now = new Date("2026-04-26T12:00:00.000Z");

	beforeEach(() => {
		mocks.clear();
		vi.clearAllMocks();
		vi.useFakeTimers();
		vi.setSystemTime(now);
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("exports job run constants and schema", () => {
		expect(jobRuns).toBeDefined();
		expect(jobRuns.id).toBeDefined();
		expect(jobRuns.status).toBeDefined();
		expect(jobRuns.lastHeartbeatAt).toBeDefined();
		expect(NON_TERMINAL_JOB_STATUSES).toEqual(["queued", "running"]);
		expect(JOB_HEARTBEAT_INTERVAL_MS).toBe(10_000);
		expect(JOB_STALE_AFTER_MS).toBe(5 * 60_000);
	});

	it("throws when a non-terminal duplicate exists for the same dedupe identity", () => {
		mocks.selectResults.push([{ id: 3, status: "running" }]);

		expect(() =>
			acquireJobRun({
				sourceType: "command",
				jobType: "refresh-book",
				displayName: "Refresh book",
				dedupeKey: "bookId",
				dedupeValue: "7",
			}),
		).toThrow("This task is already running.");

		expect(inArray).toHaveBeenCalledWith(jobRuns.status, ["queued", "running"]);
		expect(mocks.insertValues).toEqual([]);
	});

	it("inserts and returns a running job with default dedupe values", () => {
		mocks.selectResults.push([]);

		const jobRun = acquireJobRun({
			sourceType: "scheduled",
			jobType: "refresh-downloads",
			displayName: "Refresh Downloads",
		});

		expect(mocks.insertValues).toEqual([
			{
				sourceType: "scheduled",
				jobType: "refresh-downloads",
				displayName: "Refresh Downloads",
				dedupeKey: "refresh-downloads",
				dedupeValue: "refresh-downloads",
				status: "running",
				metadata: null,
				startedAt: now,
				lastHeartbeatAt: now,
				updatedAt: now,
			},
		]);
		expect(jobRun).toMatchObject({
			id: 10,
			sourceType: "scheduled",
			status: "running",
			metadata: null,
		});
	});

	it("persists metadata when acquiring a job run", () => {
		mocks.selectResults.push([]);

		acquireJobRun({
			sourceType: "command",
			jobType: "import",
			displayName: "Import",
			dedupeKey: "sourceId",
			dedupeValue: "hardcover",
			metadata: { source: "hardcover" },
		});

		expect(mocks.insertValues[0]).toMatchObject({
			dedupeKey: "sourceId",
			dedupeValue: "hardcover",
			metadata: { source: "hardcover" },
		});
	});

	it("updates heartbeat and progress timestamps", () => {
		heartbeatJobRun(10);
		updateJobRunProgress(10, "50%");

		expect(eq).toHaveBeenCalledWith(jobRuns.id, 10);
		expect(mocks.updateSets).toEqual([
			{ lastHeartbeatAt: now, updatedAt: now },
			{ progress: "50%", lastHeartbeatAt: now, updatedAt: now },
		]);
	});

	it("marks a job run succeeded with a result", () => {
		completeJobRun(10, { imported: 4 });

		expect(mocks.updateSets).toEqual([
			{
				status: "succeeded",
				result: { imported: 4 },
				error: null,
				finishedAt: now,
				lastHeartbeatAt: now,
				updatedAt: now,
			},
		]);
		expect(and).toHaveBeenCalledWith(
			{ type: "eq", left: jobRuns.id, right: 10 },
			{ type: "eq", left: jobRuns.status, right: "running" },
		);
	});

	it("marks a job run failed with an error", () => {
		failJobRun(10, "boom");

		expect(mocks.updateSets).toEqual([
			{
				status: "failed",
				error: "boom",
				finishedAt: now,
				lastHeartbeatAt: now,
				updatedAt: now,
			},
		]);
		expect(and).toHaveBeenCalledWith(
			{ type: "eq", left: jobRuns.id, right: 10 },
			{ type: "eq", left: jobRuns.status, right: "running" },
		);
	});

	it("marks running jobs stale after the heartbeat window expires", () => {
		mocks.updateReturningResults.push([
			{
				id: 7,
				sourceType: "scheduled",
				jobType: "refresh-downloads",
				status: "stale",
			},
		]);

		const staleRuns = markStaleJobRuns(now);

		expect(mocks.updateSets).toEqual([
			{
				status: "stale",
				error: "Job heartbeat expired before completion.",
				finishedAt: now,
				updatedAt: now,
			},
		]);
		expect(and).toHaveBeenCalledWith(
			{ type: "eq", left: jobRuns.status, right: "running" },
			{
				type: "lt",
				left: jobRuns.lastHeartbeatAt,
				right: new Date("2026-04-26T11:55:00.000Z"),
			},
		);
		expect(lt).toHaveBeenCalledWith(
			jobRuns.lastHeartbeatAt,
			new Date("2026-04-26T11:55:00.000Z"),
		);
		expect(staleRuns).toEqual([
			{
				id: 7,
				sourceType: "scheduled",
				jobType: "refresh-downloads",
				status: "stale",
			},
		]);
	});

	it("lists queued and running job runs", () => {
		const activeRuns = [
			{ id: 1, status: "queued" },
			{ id: 2, status: "running" },
		];
		mocks.selectResults.push(activeRuns);

		expect(listActiveJobRuns()).toEqual(activeRuns);
		expect(inArray).toHaveBeenCalledWith(jobRuns.status, ["queued", "running"]);
	});

	it("lists visible scheduled job runs including stale runs", () => {
		const visibleRuns = [
			{ id: 1, sourceType: "scheduled", status: "queued" },
			{ id: 2, sourceType: "scheduled", status: "running" },
			{ id: 3, sourceType: "scheduled", status: "stale" },
		];
		mocks.selectResults.push(visibleRuns);

		expect(listVisibleScheduledJobRuns()).toEqual(visibleRuns);
		expect(and).toHaveBeenCalledWith(
			{ type: "eq", left: jobRuns.sourceType, right: "scheduled" },
			{
				type: "inArray",
				left: jobRuns.status,
				values: ["queued", "running", "stale"],
			},
		);
		expect(inArray).toHaveBeenCalledWith(jobRuns.status, [
			"queued",
			"running",
			"stale",
		]);
	});
});

describe("job-runs service with real sqlite constraints", () => {
	afterEach(() => {
		vi.doUnmock("drizzle-orm");
		vi.doUnmock("src/db");
		vi.doUnmock("src/db/schema");
		vi.resetModules();
	});

	it("maps active job run unique constraint conflicts to the duplicate task error", async () => {
		vi.resetModules();
		vi.doUnmock("drizzle-orm");
		vi.doUnmock("src/db/schema");

		const [{ default: Database }, { drizzle }, schema] = await Promise.all([
			import("better-sqlite3"),
			import("drizzle-orm/better-sqlite3"),
			import("src/db/schema"),
		]);
		const sqlite = new Database(":memory:");
		sqlite.exec(`
			CREATE TABLE job_runs (
				id integer PRIMARY KEY AUTOINCREMENT,
				source_type text NOT NULL,
				job_type text NOT NULL,
				display_name text NOT NULL,
				dedupe_key text,
				dedupe_value text,
				status text DEFAULT 'queued' NOT NULL,
				progress text,
				attempt integer DEFAULT 1 NOT NULL,
				result text,
				error text,
				metadata text,
				started_at integer,
				last_heartbeat_at integer,
				finished_at integer,
				created_at integer NOT NULL,
				updated_at integer NOT NULL
			)
		`);
		sqlite.exec(`
			CREATE UNIQUE INDEX job_runs_active_dedupe_unique_idx
			ON job_runs (source_type, job_type, dedupe_key, dedupe_value)
			WHERE status IN ('queued', 'running')
		`);
		const db = drizzle({ client: sqlite, schema });
		const constrainedDb = Object.assign(db, {
			select: () => ({
				from: () => ({
					where: () => ({
						all: () => [],
					}),
				}),
			}),
		});

		vi.doMock("src/db", () => ({ db: constrainedDb, sqlite }));
		const { acquireJobRun } = await import("./job-runs");

		acquireJobRun({
			sourceType: "scheduled",
			jobType: "refresh-downloads",
			displayName: "Refresh Downloads",
		});

		expect(() =>
			acquireJobRun({
				sourceType: "scheduled",
				jobType: "refresh-downloads",
				displayName: "Refresh Downloads",
			}),
		).toThrow("This task is already running.");

		sqlite.close();
	});
});
