import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	emit: vi.fn(),
	logInfo: vi.fn(),
	logError: vi.fn(),
	getAllTasks: vi.fn(),
	getTask: vi.fn(),
	acquireJobRun: vi.fn(),
	completeJobRun: vi.fn(),
	failJobRun: vi.fn(),
	heartbeatJobRun: vi.fn(),
	listActiveJobRuns: vi.fn(),
	markStaleJobRuns: vi.fn(),
	updateJobRunProgress: vi.fn(),
	getTimers: vi.fn(),
	setTaskExecutor: vi.fn(),
	selectAll: vi.fn(),
	insertRun: vi.fn(),
	updateSet: vi.fn(),
	updateRun: vi.fn(),
}));

vi.mock("drizzle-orm", () => ({
	eq: vi.fn((l: unknown, r: unknown) => ({ l, r })),
}));
vi.mock("src/db", () => ({
	db: {
		select: vi.fn(() => ({
			from: vi.fn(() => ({
				all: mocks.selectAll,
			})),
		})),
		insert: vi.fn(() => ({
			values: vi.fn(() => ({
				run: mocks.insertRun,
			})),
		})),
		update: vi.fn(() => ({
			set: mocks.updateSet.mockImplementation(() => ({
				where: vi.fn(() => ({
					run: mocks.updateRun,
				})),
			})),
		})),
	},
}));
vi.mock("src/db/schema", () => ({
	scheduledTasks: { id: "scheduledTasks.id" },
}));
vi.mock("../event-bus", () => ({ eventBus: { emit: mocks.emit } }));
vi.mock("../logger", () => ({
	logInfo: mocks.logInfo,
	logError: mocks.logError,
}));
vi.mock("./registry", () => ({
	getAllTasks: mocks.getAllTasks,
	getTask: mocks.getTask,
}));
vi.mock("../job-runs", () => ({
	acquireJobRun: mocks.acquireJobRun,
	completeJobRun: mocks.completeJobRun,
	failJobRun: mocks.failJobRun,
	heartbeatJobRun: mocks.heartbeatJobRun,
	JOB_HEARTBEAT_INTERVAL_MS: 10_000,
	listActiveJobRuns: mocks.listActiveJobRuns,
	markStaleJobRuns: mocks.markStaleJobRuns,
	updateJobRunProgress: mocks.updateJobRunProgress,
}));
vi.mock("./timers", () => ({
	getTimers: mocks.getTimers,
	setTaskExecutor: mocks.setTaskExecutor,
}));

// Mock all side-effecting task registration imports
vi.mock("./tasks/check-health", () => ({}));
vi.mock("./tasks/housekeeping", () => ({}));
vi.mock("./tasks/backup", () => ({}));
vi.mock("./tasks/refresh-metadata", () => ({}));
vi.mock("./tasks/rss-sync", () => ({}));
vi.mock("./tasks/rescan-folders", () => ({}));
vi.mock("./tasks/refresh-downloads", () => ({}));
vi.mock("./tasks/refresh-tmdb-metadata", () => ({}));
vi.mock("./tasks/search-missing", () => ({}));
vi.mock("./tasks/refresh-series-metadata", () => ({}));

// Shared fake timer map used by getTimers mock
const fakeTimers = new Map<string, ReturnType<typeof setInterval>>();

beforeEach(() => {
	vi.clearAllMocks();
	fakeTimers.clear();
	mocks.getTimers.mockReturnValue(fakeTimers);
	// Defaults
	mocks.getAllTasks.mockReturnValue([]);
	mocks.selectAll.mockReturnValue([]);
	mocks.acquireJobRun.mockReturnValue({ id: 55 });
	mocks.listActiveJobRuns.mockReturnValue([]);
	mocks.markStaleJobRuns.mockReturnValue([]);
});

/**
 * The module caches `started` as a module-level `let`. To test ensureSchedulerStarted
 * idempotency across calls we need a fresh module for each describe block that tests it.
 * We use `vi.resetModules()` + dynamic import to get a clean `started = false`.
 */
async function freshModule() {
	vi.resetModules();
	return (await import("./index")) as typeof import("./index");
}

describe("scheduler/index", () => {
	describe("ensureSchedulerStarted", () => {
		it("should seed tasks, start timers, and log on first call", async () => {
			const mod = await freshModule();

			mocks.getAllTasks.mockReturnValue([]);
			mocks.selectAll.mockReturnValue([]);

			mod.ensureSchedulerStarted();

			expect(mocks.markStaleJobRuns).toHaveBeenCalledOnce();
			expect(mocks.markStaleJobRuns.mock.invocationCallOrder[0]).toBeLessThan(
				mocks.setTaskExecutor.mock.invocationCallOrder[0],
			);
			expect(mocks.setTaskExecutor).toHaveBeenCalledOnce();
			expect(mocks.logInfo).toHaveBeenCalledWith(
				"scheduler",
				expect.stringContaining("Started with"),
			);
		});

		it("should clear progress for stale scheduled runs during startup recovery", async () => {
			const mod = await freshModule();
			mocks.markStaleJobRuns.mockReturnValue([
				{
					sourceType: "scheduled",
					jobType: "stale-task",
				},
				{
					sourceType: "command",
					jobType: "refresh-book",
				},
			]);

			mod.ensureSchedulerStarted();

			expect(mocks.updateSet).toHaveBeenCalledWith({ progress: null });
			expect(mocks.updateRun).toHaveBeenCalledOnce();
		});

		it("should be idempotent — second call is a no-op", async () => {
			const mod = await freshModule();

			mocks.getAllTasks.mockReturnValue([]);
			mocks.selectAll.mockReturnValue([]);

			mod.ensureSchedulerStarted();
			mod.ensureSchedulerStarted();

			expect(mocks.markStaleJobRuns).toHaveBeenCalledOnce();
			expect(mocks.setTaskExecutor).toHaveBeenCalledOnce();
			expect(mocks.logInfo).toHaveBeenCalledOnce();
		});

		it("should allow retrying startup when stale recovery fails", async () => {
			const mod = await freshModule();
			const error = new Error("database unavailable");
			mocks.markStaleJobRuns.mockImplementationOnce(() => {
				throw error;
			});

			expect(() => mod.ensureSchedulerStarted()).toThrow(error);

			mod.ensureSchedulerStarted();

			expect(mocks.markStaleJobRuns).toHaveBeenCalledTimes(2);
			expect(mocks.setTaskExecutor).toHaveBeenCalledOnce();
			expect(mocks.logInfo).toHaveBeenCalledOnce();
		});

		it("should allow retrying startup when task seeding fails", async () => {
			const mod = await freshModule();
			const error = new Error("seed failed");
			mocks.selectAll.mockImplementationOnce(() => {
				throw error;
			});

			expect(() => mod.ensureSchedulerStarted()).toThrow(error);

			mocks.selectAll.mockReturnValue([]);
			mod.ensureSchedulerStarted();

			expect(mocks.markStaleJobRuns).toHaveBeenCalledTimes(2);
			expect(mocks.setTaskExecutor).toHaveBeenCalledOnce();
			expect(mocks.logInfo).toHaveBeenCalledOnce();
		});
	});

	describe("seedTasksIfNeeded (via ensureSchedulerStarted)", () => {
		it("should insert tasks that are missing from the database", async () => {
			const mod = await freshModule();

			mocks.getAllTasks.mockReturnValue([
				{
					id: "task-a",
					name: "Task A",
					defaultInterval: 60,
					group: "maintenance",
				},
				{
					id: "task-b",
					name: "Task B",
					defaultInterval: 120,
					group: "search",
				},
			]);
			// DB already has task-a
			mocks.selectAll.mockReturnValue([{ id: "task-a" }]);

			mod.ensureSchedulerStarted();

			// Only task-b should be inserted
			expect(mocks.insertRun).toHaveBeenCalledOnce();
		});

		it("should skip inserting when all tasks already exist", async () => {
			const mod = await freshModule();

			mocks.getAllTasks.mockReturnValue([
				{
					id: "task-a",
					name: "Task A",
					defaultInterval: 60,
					group: "maintenance",
				},
			]);
			mocks.selectAll.mockReturnValue([{ id: "task-a" }]);

			mod.ensureSchedulerStarted();

			expect(mocks.insertRun).not.toHaveBeenCalled();
		});
	});

	describe("startTimers (via ensureSchedulerStarted)", () => {
		afterEach(() => {
			vi.useRealTimers();
		});

		it("should schedule enabled tasks and store timer references", async () => {
			vi.useFakeTimers();

			const mod = await freshModule();

			const handler = vi
				.fn()
				.mockResolvedValue({ success: true, message: "ok" });
			mocks.getTask.mockReturnValue({
				id: "task-1",
				name: "Task 1",
				handler,
			});

			// First call: seedTasksIfNeeded reads DB (returns [])
			// Second call: startTimers reads DB (returns enabled task)
			mocks.selectAll
				.mockReturnValueOnce([]) // seed read
				.mockReturnValueOnce([
					{
						id: "task-1",
						enabled: true,
						interval: 10,
						lastExecution: null,
					},
				]);

			mod.ensureSchedulerStarted();

			// Timer should have been stored
			expect(fakeTimers.size).toBe(1);
			expect(fakeTimers.has("task-1")).toBe(true);
		});

		it("should skip disabled tasks", async () => {
			vi.useFakeTimers();

			const mod = await freshModule();

			mocks.getTask.mockReturnValue(undefined);
			mocks.selectAll.mockReturnValueOnce([]).mockReturnValueOnce([
				{
					id: "task-disabled",
					enabled: false,
					interval: 10,
					lastExecution: null,
				},
			]);

			mod.ensureSchedulerStarted();

			expect(fakeTimers.size).toBe(0);
		});

		it("should skip tasks not in the registry", async () => {
			vi.useFakeTimers();

			const mod = await freshModule();

			mocks.getTask.mockReturnValue(undefined);
			mocks.selectAll.mockReturnValueOnce([]).mockReturnValueOnce([
				{
					id: "ghost-task",
					enabled: true,
					interval: 10,
					lastExecution: null,
				},
			]);

			mod.ensureSchedulerStarted();

			expect(fakeTimers.size).toBe(0);
		});

		it("should calculate reduced delay when lastExecution is recent", async () => {
			vi.useFakeTimers({ now: 100_000 });

			const mod = await freshModule();

			const handler = vi
				.fn()
				.mockResolvedValue({ success: true, message: "ok" });
			mocks.getTask.mockReturnValue({
				id: "task-1",
				name: "Task 1",
				handler,
			});

			// lastExecution was 3 seconds ago, interval is 10s => delay should be 7s
			mocks.selectAll.mockReturnValueOnce([]).mockReturnValueOnce([
				{
					id: "task-1",
					enabled: true,
					interval: 10,
					lastExecution: new Date(100_000 - 3_000),
				},
			]);

			mod.ensureSchedulerStarted();

			// After 7 seconds the timeout fires and executes the task
			await vi.advanceTimersByTimeAsync(7_000);

			expect(mocks.acquireJobRun).toHaveBeenCalledWith({
				sourceType: "scheduled",
				jobType: "task-1",
				displayName: "Task 1",
			});
		});

		it("should fire the task after the timeout then set up an interval", async () => {
			vi.useFakeTimers();

			const mod = await freshModule();

			const handler = vi
				.fn()
				.mockResolvedValue({ success: true, message: "done" });
			mocks.getTask.mockReturnValue({
				id: "task-1",
				name: "Task 1",
				handler,
			});

			mocks.selectAll
				.mockReturnValueOnce([])
				.mockReturnValueOnce([
					{ id: "task-1", enabled: true, interval: 5, lastExecution: null },
				]);

			mod.ensureSchedulerStarted();

			// Advance past the initial delay (full interval = 5s)
			await vi.advanceTimersByTimeAsync(5_000);
			expect(handler).toHaveBeenCalledOnce();

			// Advance another interval
			await vi.advanceTimersByTimeAsync(5_000);
			expect(handler).toHaveBeenCalledTimes(2);
		});
	});

	describe("runTaskNow", () => {
		it("should throw for an unknown task", async () => {
			const mod = await freshModule();

			mocks.getTask.mockReturnValue(undefined);

			await expect(mod.runTaskNow("nonexistent")).rejects.toThrow(
				"Unknown task: nonexistent",
			);
		});

		it("should execute the task when it exists", async () => {
			const mod = await freshModule();

			const handler = vi
				.fn()
				.mockResolvedValue({ success: true, message: "ok" });
			mocks.getTask.mockReturnValue({
				id: "my-task",
				name: "My Task",
				handler,
			});

			await mod.runTaskNow("my-task");

			expect(mocks.acquireJobRun).toHaveBeenCalledWith({
				sourceType: "scheduled",
				jobType: "my-task",
				displayName: "My Task",
			});
			expect(handler).toHaveBeenCalledOnce();
		});
	});

	describe("executeTask (via runTaskNow)", () => {
		it("should skip execution when job run acquisition reports an active run", async () => {
			const mod = await freshModule();

			const handler = vi.fn();
			mocks.getTask.mockReturnValue({
				id: "busy-task",
				name: "Busy Task",
				handler,
			});
			mocks.acquireJobRun.mockImplementation(() => {
				throw new Error("This task is already running.");
			});

			await mod.runTaskNow("busy-task");

			expect(handler).not.toHaveBeenCalled();
			expect(mocks.logError).not.toHaveBeenCalled();
		});

		it("should skip a scheduled task when a command declares the same batch task overlap", async () => {
			const mod = await freshModule();

			const handler = vi.fn();
			mocks.getTask.mockReturnValue({
				id: "refresh-metadata",
				name: "Metadata Refresh",
				handler,
			});
			mocks.listActiveJobRuns.mockReturnValue([
				{
					id: 99,
					sourceType: "command",
					jobType: "refreshBook",
					metadata: { batchTaskId: "refresh-metadata" },
				},
			]);

			await mod.runTaskNow("refresh-metadata");

			expect(mocks.listActiveJobRuns).toHaveBeenCalledOnce();
			expect(mocks.acquireJobRun).not.toHaveBeenCalled();
			expect(handler).not.toHaveBeenCalled();
			expect(mocks.updateSet).not.toHaveBeenCalled();
			expect(mocks.updateRun).not.toHaveBeenCalled();
			expect(mocks.failJobRun).not.toHaveBeenCalled();
			expect(mocks.logError).not.toHaveBeenCalled();
		});

		it("should recover stale scheduled runs before checking overlap or acquiring a task run", async () => {
			const mod = await freshModule();

			const handler = vi
				.fn()
				.mockResolvedValue({ success: true, message: "recovered" });
			mocks.getTask.mockReturnValue({
				id: "stale-task",
				name: "Stale Task",
				handler,
			});
			mocks.markStaleJobRuns.mockReturnValue([
				{
					sourceType: "scheduled",
					jobType: "stale-task",
				},
			]);

			await mod.runTaskNow("stale-task");

			expect(mocks.markStaleJobRuns.mock.invocationCallOrder[0]).toBeLessThan(
				mocks.listActiveJobRuns.mock.invocationCallOrder[0],
			);
			expect(mocks.markStaleJobRuns.mock.invocationCallOrder[0]).toBeLessThan(
				mocks.acquireJobRun.mock.invocationCallOrder[0],
			);
			expect(mocks.updateSet).toHaveBeenCalledWith({ progress: null });
			expect(handler).toHaveBeenCalledOnce();
		});

		it("should clear progress for stale scheduled runs but not stale command runs", async () => {
			const mod = await freshModule();

			mocks.getTask.mockReturnValue({
				id: "mixed-stale-task",
				name: "Mixed Stale Task",
				handler: vi.fn().mockResolvedValue({
					success: true,
					message: "stale runs recovered",
				}),
			});
			mocks.markStaleJobRuns.mockReturnValue([
				{
					sourceType: "command",
					jobType: "refresh-book",
				},
				{
					sourceType: "scheduled",
					jobType: "mixed-stale-task",
				},
			]);

			await mod.runTaskNow("mixed-stale-task");

			expect(
				mocks.updateSet.mock.calls.filter(
					([value]) =>
						value &&
						typeof value === "object" &&
						Object.keys(value).length === 1 &&
						"progress" in value &&
						value.progress === null,
				),
			).toHaveLength(1);
		});

		it("should acquire a job run, call handler, update DB, emit event, and complete the run on success", async () => {
			const mod = await freshModule();

			const handler = vi
				.fn()
				.mockResolvedValue({ success: true, message: "All good" });
			mocks.getTask.mockReturnValue({
				id: "task-ok",
				name: "OK Task",
				handler,
			});

			await mod.runTaskNow("task-ok");

			expect(mocks.acquireJobRun).toHaveBeenCalledWith({
				sourceType: "scheduled",
				jobType: "task-ok",
				displayName: "OK Task",
			});
			expect(handler).toHaveBeenCalledOnce();
			expect(mocks.updateRun).toHaveBeenCalled();
			expect(mocks.completeJobRun).toHaveBeenCalledWith(55, {
				success: true,
				message: "All good",
			});
			expect(mocks.emit).toHaveBeenCalledWith({
				type: "taskUpdated",
				taskId: "task-ok",
			});
			expect(mocks.logInfo).toHaveBeenCalledWith(
				"scheduler",
				expect.stringContaining("OK Task"),
			);
		});

		it("should heartbeat active no-progress task runs and clear the interval", async () => {
			vi.useFakeTimers();
			const mod = await freshModule();
			let resolveHandler: () => void = () => {
				throw new Error("handler promise was not initialized");
			};
			const handler = vi.fn(
				() =>
					new Promise<{ success: true; message: string }>((resolve) => {
						resolveHandler = () => resolve({ success: true, message: "done" });
					}),
			);
			mocks.getTask.mockReturnValue({
				id: "task-heartbeat",
				name: "Heartbeat Task",
				handler,
			});

			const taskPromise = mod.runTaskNow("task-heartbeat");

			expect(handler).toHaveBeenCalledOnce();
			vi.advanceTimersByTime(9_999);
			expect(mocks.heartbeatJobRun).not.toHaveBeenCalled();
			vi.advanceTimersByTime(1);
			expect(mocks.heartbeatJobRun).toHaveBeenCalledWith(55);

			resolveHandler();
			await taskPromise;

			expect(vi.getTimerCount()).toBe(0);
			vi.useRealTimers();
		});

		it("should mark unsuccessful handler results as failed job runs", async () => {
			const mod = await freshModule();

			const handler = vi
				.fn()
				.mockResolvedValue({ success: false, message: "bad" });
			mocks.getTask.mockReturnValue({
				id: "task-bad",
				name: "Bad Task",
				handler,
			});

			await mod.runTaskNow("task-bad");

			expect(mocks.updateSet).toHaveBeenCalledWith(
				expect.objectContaining({
					lastResult: "error",
					lastMessage: "bad",
				}),
			);
			expect(mocks.failJobRun).toHaveBeenCalledWith(55, "bad");
			expect(mocks.completeJobRun).not.toHaveBeenCalled();
		});

		it("should update DB, fail the job run, and log when handler throws", async () => {
			const mod = await freshModule();

			const error = new Error("Something broke");
			const handler = vi.fn().mockRejectedValue(error);
			mocks.getTask.mockReturnValue({
				id: "task-fail",
				name: "Fail Task",
				handler,
			});

			await mod.runTaskNow("task-fail");

			expect(mocks.updateRun).toHaveBeenCalled();
			expect(mocks.failJobRun).toHaveBeenCalledWith(55, "Something broke");
			expect(mocks.logError).toHaveBeenCalledWith(
				"scheduler",
				expect.stringContaining("Fail Task failed: Something broke"),
				error,
			);
			expect(mocks.emit).toHaveBeenCalledWith({
				type: "taskUpdated",
				taskId: "task-fail",
			});
		});

		it("should handle non-Error thrown values gracefully", async () => {
			const mod = await freshModule();

			const handler = vi.fn().mockRejectedValue("string error");
			mocks.getTask.mockReturnValue({
				id: "task-str",
				name: "Str Task",
				handler,
			});

			await mod.runTaskNow("task-str");

			expect(mocks.logError).toHaveBeenCalledWith(
				"scheduler",
				expect.stringContaining("Unknown error"),
				"string error",
			);
			expect(mocks.failJobRun).toHaveBeenCalledWith(55, "Unknown error");
		});

		it("should not fail a job run when acquisition throws a duplicate-run error", async () => {
			const mod = await freshModule();

			const handler = vi.fn();
			mocks.getTask.mockReturnValue({
				id: "task-duplicate",
				name: "Duplicate Task",
				handler,
			});
			mocks.acquireJobRun.mockImplementation(() => {
				throw new Error("This task is already running.");
			});

			await mod.runTaskNow("task-duplicate");

			expect(mocks.failJobRun).not.toHaveBeenCalled();
			expect(mocks.completeJobRun).not.toHaveBeenCalled();
		});

		it("should update job run progress, scheduled task progress, and emit events from the progress callback", async () => {
			const mod = await freshModule();

			const handler = vi.fn().mockImplementation((cb) => {
				cb("50% complete");
				return Promise.resolve({ success: true, message: "done" });
			});

			mocks.getTask.mockReturnValue({
				id: "task-progress",
				name: "Progress Task",
				handler,
			});

			await mod.runTaskNow("task-progress");

			expect(mocks.updateJobRunProgress).toHaveBeenCalledWith(
				55,
				"50% complete",
			);
			expect(mocks.updateSet).toHaveBeenCalledWith({
				progress: "50% complete",
			});
			expect(mocks.updateRun).toHaveBeenCalled();
			expect(mocks.emit).toHaveBeenCalledWith({
				type: "taskUpdated",
				taskId: "task-progress",
			});
		});
	});
});
