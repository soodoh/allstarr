import { eq } from "drizzle-orm";
import { jobRuns } from "src/db/schema";
import { createSqliteFixture } from "src/test/sqlite-fixture";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { JobRunOutcome } from "./job-runs";

let fixture: ReturnType<typeof createSqliteFixture>;
let jobs: typeof import("./job-runs");
beforeEach(async () => {
	vi.useFakeTimers();
	vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
	vi.resetModules();
	fixture = createSqliteFixture();
	vi.doMock("src/db", () => ({ db: fixture.db }));
	jobs = await import("./job-runs");
});
afterEach(() => {
	fixture.close();
	vi.doUnmock("src/db");
	vi.useRealTimers();
	vi.restoreAllMocks();
});
function acquire() {
	return jobs.acquireJobRun({
		sourceType: "command",
		jobType: "test",
		displayName: "Test",
	});
}
function row(id: number) {
	return fixture.db.select().from(jobRuns).where(eq(jobRuns.id, id)).get();
}

describe("persisted job execution", () => {
	it("owns no-progress heartbeat lifetime and stops it after success", async () => {
		const run = acquire();
		const work = Promise.withResolvers<JobRunOutcome>();
		const execution = jobs.executeJobRun(run.id, () => work.promise);
		await vi.advanceTimersByTimeAsync(jobs.JOB_HEARTBEAT_INTERVAL_MS - 1);
		expect(row(run.id)?.lastHeartbeatAt).toEqual(run.lastHeartbeatAt);
		await vi.advanceTimersByTimeAsync(1);
		expect(row(run.id)?.lastHeartbeatAt).toEqual(new Date());
		work.resolve({ status: "succeeded", result: { count: 3 } });
		expect(await execution).toEqual({
			status: "succeeded",
			result: { count: 3 },
		});
		const terminal = row(run.id);
		expect(terminal).toMatchObject({
			status: "succeeded",
			result: { count: 3 },
			error: null,
			finishedAt: new Date(),
		});
		expect(jobs.listActiveJobRuns()).toEqual([]);
		await vi.advanceTimersByTimeAsync(60_000);
		expect(row(run.id)).toEqual(terminal);
		expect(vi.getTimerCount()).toBe(0);
	});

	it("persists progress and refreshes heartbeat before returning control to work", async () => {
		const run = acquire();
		await vi.advanceTimersByTimeAsync(3_000);
		await jobs.executeJobRun(run.id, async (progress) => {
			progress("Halfway");
			expect(row(run.id)).toMatchObject({
				status: "running",
				progress: "Halfway",
				lastHeartbeatAt: new Date(),
			});
			return { status: "succeeded", result: {} };
		});
		expect(row(run.id)?.progress).toBe("Halfway");
		expect(vi.getTimerCount()).toBe(0);
	});

	it("records unsuccessful work without treating it as a thrown error", async () => {
		const run = acquire();
		const outcome = { status: "failed", message: "No match" } as const;
		expect(await jobs.executeJobRun(run.id, async () => outcome)).toEqual(
			outcome,
		);
		expect(row(run.id)).toMatchObject({
			status: "failed",
			error: "No match",
			result: null,
			finishedAt: new Date(),
		});
		expect(vi.getTimerCount()).toBe(0);
	});

	it.each([new Error("work failed"), "bad", undefined])(
		"records thrown work and stops heartbeat (%s)",
		async (error) => {
			const run = acquire();
			const work = Promise.withResolvers<JobRunOutcome>();
			const execution = jobs.executeJobRun(run.id, () => work.promise);
			await vi.advanceTimersByTimeAsync(10_000);
			work.reject(error);
			const message = error instanceof Error ? error.message : "Unknown error";
			expect(await execution).toEqual({ status: "failed", message, error });
			const terminal = row(run.id);
			expect(terminal).toMatchObject({ status: "failed", error: message });
			await vi.advanceTimersByTimeAsync(30_000);
			expect(row(run.id)).toEqual(terminal);
			expect(vi.getTimerCount()).toBe(0);
		},
	);

	it("records terminal-write failures as failed runs", async () => {
		const run = acquire();
		fixture.sqlite.exec(
			"CREATE TRIGGER reject_success BEFORE UPDATE OF status ON job_runs WHEN NEW.status = 'succeeded' BEGIN SELECT RAISE(ABORT, 'terminal unavailable'); END",
		);
		expect(
			await jobs.executeJobRun(run.id, async () => ({
				status: "succeeded",
				result: {},
			})),
		).toMatchObject({
			status: "failed",
			message: expect.stringContaining("terminal unavailable"),
		});
		expect(row(run.id)).toMatchObject({
			status: "failed",
			error: expect.stringContaining("terminal unavailable"),
		});
		expect(vi.getTimerCount()).toBe(0);
	});

	it("cleans up its timer even when failure persistence throws", async () => {
		const run = acquire();
		fixture.sqlite.exec(
			"CREATE TRIGGER reject_failure BEFORE UPDATE OF status ON job_runs WHEN NEW.status = 'failed' BEGIN SELECT RAISE(ABORT, 'storage unavailable'); END",
		);
		await expect(
			jobs.executeJobRun(run.id, async () => {
				throw new Error("work failed");
			}),
		).rejects.toThrow("storage unavailable");
		expect(vi.getTimerCount()).toBe(0);
	});

	it("preserves terminal guards when work finishes after stale recovery", async () => {
		const run = acquire();
		const work = Promise.withResolvers<JobRunOutcome>();
		const execution = jobs.executeJobRun(run.id, () => work.promise);
		jobs.markStaleJobRuns(
			new Date(Date.now() + jobs.JOB_STALE_AFTER_MS + 1_000),
		);
		expect(row(run.id)?.status).toBe("stale");
		work.resolve({ status: "succeeded", result: {} });
		await execution;
		expect(row(run.id)?.status).toBe("stale");
		expect(vi.getTimerCount()).toBe(0);
	});
});
