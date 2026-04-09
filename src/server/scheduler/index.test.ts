import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	emit: vi.fn(),
	logInfo: vi.fn(),
	logError: vi.fn(),
	getAllTasks: vi.fn(),
	getTask: vi.fn(),
	isTaskRunning: vi.fn(),
	markTaskRunning: vi.fn(),
	markTaskComplete: vi.fn(),
	getTimers: vi.fn(),
	setTaskExecutor: vi.fn(),
	selectAll: vi.fn(),
	insertRun: vi.fn(),
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
			set: vi.fn(() => ({
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
vi.mock("./state", () => ({
	isTaskRunning: mocks.isTaskRunning,
	markTaskRunning: mocks.markTaskRunning,
	markTaskComplete: mocks.markTaskComplete,
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
	mocks.isTaskRunning.mockReturnValue(false);
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

			expect(mocks.setTaskExecutor).toHaveBeenCalledOnce();
			expect(mocks.logInfo).toHaveBeenCalledWith(
				"scheduler",
				expect.stringContaining("Started with"),
			);
		});

		it("should be idempotent — second call is a no-op", async () => {
			const mod = await freshModule();

			mocks.getAllTasks.mockReturnValue([]);
			mocks.selectAll.mockReturnValue([]);

			mod.ensureSchedulerStarted();
			mod.ensureSchedulerStarted();

			// setTaskExecutor and logInfo should only be called once
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

			expect(mocks.markTaskRunning).toHaveBeenCalledWith("task-1");
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

			expect(mocks.markTaskRunning).toHaveBeenCalledWith("my-task");
			expect(handler).toHaveBeenCalledOnce();
			expect(mocks.markTaskComplete).toHaveBeenCalledWith("my-task");
		});
	});

	describe("executeTask (via runTaskNow)", () => {
		it("should skip execution when the task is already running", async () => {
			const mod = await freshModule();

			const handler = vi.fn();
			mocks.getTask.mockReturnValue({
				id: "busy-task",
				name: "Busy Task",
				handler,
			});
			mocks.isTaskRunning.mockReturnValue(true);

			await mod.runTaskNow("busy-task");

			expect(handler).not.toHaveBeenCalled();
			expect(mocks.markTaskRunning).not.toHaveBeenCalled();
		});

		it("should mark running, call handler, update DB, emit event, and mark complete on success", async () => {
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

			expect(mocks.markTaskRunning).toHaveBeenCalledWith("task-ok");
			expect(handler).toHaveBeenCalledOnce();
			expect(mocks.updateRun).toHaveBeenCalled();
			expect(mocks.emit).toHaveBeenCalledWith({
				type: "taskUpdated",
				taskId: "task-ok",
			});
			expect(mocks.logInfo).toHaveBeenCalledWith(
				"scheduler",
				expect.stringContaining("OK Task"),
			);
			expect(mocks.markTaskComplete).toHaveBeenCalledWith("task-ok");
		});

		it("should update DB with error details and log when handler throws", async () => {
			const mod = await freshModule();

			const error = new Error("Something broke");
			const handler = vi.fn().mockRejectedValue(error);
			mocks.getTask.mockReturnValue({
				id: "task-fail",
				name: "Fail Task",
				handler,
			});

			await mod.runTaskNow("task-fail");

			expect(mocks.markTaskRunning).toHaveBeenCalledWith("task-fail");
			expect(mocks.updateRun).toHaveBeenCalled();
			expect(mocks.logError).toHaveBeenCalledWith(
				"scheduler",
				expect.stringContaining("Fail Task failed: Something broke"),
				error,
			);
			expect(mocks.emit).toHaveBeenCalledWith({
				type: "taskUpdated",
				taskId: "task-fail",
			});
			expect(mocks.markTaskComplete).toHaveBeenCalledWith("task-fail");
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
			expect(mocks.markTaskComplete).toHaveBeenCalledWith("task-str");
		});

		it("should always call markTaskComplete even on handler error", async () => {
			const mod = await freshModule();

			const handler = vi.fn().mockRejectedValue(new Error("boom"));
			mocks.getTask.mockReturnValue({
				id: "task-err",
				name: "Err Task",
				handler,
			});

			await mod.runTaskNow("task-err");

			// markTaskComplete must be called regardless
			expect(mocks.markTaskComplete).toHaveBeenCalledWith("task-err");
		});

		it("should pass an updateProgress callback to the handler", async () => {
			const mod = await freshModule();

			let capturedCallback: ((msg: string) => void) | undefined;
			const handler = vi.fn().mockImplementation((cb) => {
				capturedCallback = cb;
				return Promise.resolve({ success: true, message: "done" });
			});

			mocks.getTask.mockReturnValue({
				id: "task-progress",
				name: "Progress Task",
				handler,
			});

			await mod.runTaskNow("task-progress");

			expect(capturedCallback).toBeDefined();

			// Calling the progress callback should update DB and emit event
			capturedCallback!("50% complete");

			expect(mocks.updateRun).toHaveBeenCalled();
			expect(mocks.emit).toHaveBeenCalledWith({
				type: "taskUpdated",
				taskId: "task-progress",
			});
		});
	});
});
