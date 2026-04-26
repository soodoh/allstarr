import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	all: vi.fn(),
	clearTaskTimer: vi.fn(),
	emit: vi.fn(),
	get: vi.fn(),
	listActiveJobRuns: vi.fn(),
	requireAdmin: vi.fn(),
	requireAuth: vi.fn(),
	rescheduleTask: vi.fn(),
	run: vi.fn(),
	runTaskNow: vi.fn(),
}));

vi.mock("@tanstack/react-start", () => ({
	createServerFn: () => ({
		handler: (handler: (...args: unknown[]) => unknown) => handler,
		inputValidator: (validator: (input: unknown) => unknown) => ({
			handler:
				(handler: (input: { data: unknown }) => unknown) =>
				(input: { data: unknown }) =>
					handler({ data: validator(input.data) }),
		}),
	}),
}));

vi.mock("drizzle-orm", () => ({
	eq: vi.fn((left: unknown, right: unknown) => ({ left, right })),
}));

vi.mock("src/db", () => ({
	db: {
		select: vi.fn(() => ({
			from: vi.fn(() => ({
				all: mocks.all,
				where: vi.fn(() => ({
					get: mocks.get,
				})),
			})),
		})),
		update: vi.fn(() => ({
			set: vi.fn(() => ({
				where: vi.fn(() => ({
					run: mocks.run,
				})),
			})),
		})),
	},
}));

vi.mock("src/db/schema", () => ({
	scheduledTasks: {
		enabled: "scheduledTasks.enabled",
		id: "scheduledTasks.id",
	},
}));

vi.mock("./event-bus", () => ({
	eventBus: { emit: mocks.emit },
}));

vi.mock("./middleware", () => ({
	requireAdmin: mocks.requireAdmin,
	requireAuth: mocks.requireAuth,
}));

vi.mock("./job-runs", () => ({
	listActiveJobRuns: mocks.listActiveJobRuns,
}));

vi.mock("./scheduler/timers", () => ({
	clearTaskTimer: mocks.clearTaskTimer,
	rescheduleTask: mocks.rescheduleTask,
}));

vi.mock("./scheduler", () => ({
	runTaskNow: mocks.runTaskNow,
}));

import {
	getScheduledTasksFn,
	runScheduledTaskFn,
	toggleTaskEnabledFn,
} from "./tasks";

describe("tasks server functions", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.all.mockReturnValue([]);
		mocks.listActiveJobRuns.mockReturnValue([]);
	});

	describe("getScheduledTasksFn", () => {
		it("calls requireAuth", async () => {
			await getScheduledTasksFn();
			expect(mocks.requireAuth).toHaveBeenCalledTimes(1);
		});

		it("maps DB rows to ScheduledTask with computed nextExecution when enabled", async () => {
			const lastExec = new Date("2026-04-09T10:00:00.000Z");
			mocks.all.mockReturnValue([
				{
					enabled: true,
					group: "metadata",
					id: "refresh-metadata",
					interval: 3600,
					lastDuration: 45,
					lastExecution: lastExec,
					lastMessage: "Refreshed 5 items",
					lastResult: "success",
					name: "Refresh Metadata",
					progress: null,
				},
			]);

			const result = await getScheduledTasksFn();

			expect(result).toEqual([
				{
					enabled: true,
					group: "metadata",
					id: "refresh-metadata",
					interval: 3600,
					isRunning: false,
					lastDuration: 45,
					lastExecution: "2026-04-09T10:00:00.000Z",
					lastMessage: "Refreshed 5 items",
					lastResult: "success",
					name: "Refresh Metadata",
					nextExecution: new Date(
						lastExec.getTime() + 3600 * 1000,
					).toISOString(),
					progress: null,
				},
			]);
			expect(mocks.listActiveJobRuns).toHaveBeenCalledTimes(1);
		});

		it("sets nextExecution to null when task is disabled", async () => {
			mocks.all.mockReturnValue([
				{
					enabled: false,
					group: "library",
					id: "scan-library",
					interval: 7200,
					lastDuration: 120,
					lastExecution: new Date("2026-04-09T08:00:00.000Z"),
					lastMessage: null,
					lastResult: "success",
					name: "Scan Library",
					progress: null,
				},
			]);

			const result = await getScheduledTasksFn();

			expect(result[0].nextExecution).toBeNull();
		});

		it("sets nextExecution to null when lastExecution is null", async () => {
			mocks.all.mockReturnValue([
				{
					enabled: true,
					group: "library",
					id: "scan-library",
					interval: 7200,
					lastDuration: null,
					lastExecution: null,
					lastMessage: null,
					lastResult: null,
					name: "Scan Library",
					progress: null,
				},
			]);

			const result = await getScheduledTasksFn();

			expect(result[0].nextExecution).toBeNull();
			expect(result[0].lastExecution).toBeNull();
		});

		it("reflects isRunning from active scheduled job runs", async () => {
			mocks.all.mockReturnValue([
				{
					enabled: true,
					group: "metadata",
					id: "refresh-metadata",
					interval: 3600,
					lastDuration: null,
					lastExecution: null,
					lastMessage: null,
					lastResult: null,
					name: "Refresh Metadata",
					progress: "50%",
				},
			]);
			mocks.listActiveJobRuns.mockReturnValue([
				{
					sourceType: "scheduled",
					jobType: "refresh-metadata",
				},
			]);

			const result = await getScheduledTasksFn();

			expect(result[0].isRunning).toBe(true);
			expect(result[0].progress).toBe("50%");
		});

		it("ignores active non-scheduled job runs for isRunning", async () => {
			mocks.all.mockReturnValue([
				{
					enabled: true,
					group: "metadata",
					id: "refresh-metadata",
					interval: 3600,
					lastDuration: null,
					lastExecution: null,
					lastMessage: null,
					lastResult: null,
					name: "Refresh Metadata",
					progress: null,
				},
			]);
			mocks.listActiveJobRuns.mockReturnValue([
				{
					sourceType: "command",
					jobType: "refresh-metadata",
				},
				{
					sourceType: "scheduled",
					jobType: "other-task",
				},
			]);

			const result = await getScheduledTasksFn();

			expect(result[0].isRunning).toBe(false);
		});
	});

	describe("runScheduledTaskFn", () => {
		it("calls requireAdmin then runTaskNow", async () => {
			mocks.runTaskNow.mockResolvedValue(undefined);

			const result = await runScheduledTaskFn({
				data: { taskId: "refresh-metadata" },
			});

			expect(mocks.requireAdmin).toHaveBeenCalledTimes(1);
			expect(mocks.runTaskNow).toHaveBeenCalledWith("refresh-metadata");
			expect(result).toEqual({ success: true });
		});
	});

	describe("toggleTaskEnabledFn", () => {
		it("enables a task and reschedules it", async () => {
			mocks.get.mockReturnValue({
				id: "refresh-metadata",
				interval: 3600,
				name: "Refresh Metadata",
			});

			const result = await toggleTaskEnabledFn({
				data: { enabled: true, taskId: "refresh-metadata" },
			});

			expect(mocks.requireAdmin).toHaveBeenCalledTimes(1);
			expect(mocks.run).toHaveBeenCalledTimes(1);
			expect(mocks.rescheduleTask).toHaveBeenCalledWith(
				"refresh-metadata",
				3600 * 1000,
			);
			expect(mocks.clearTaskTimer).not.toHaveBeenCalled();
			expect(result).toEqual({ success: true });
		});

		it("disables a task and clears the timer", async () => {
			const result = await toggleTaskEnabledFn({
				data: { enabled: false, taskId: "scan-library" },
			});

			expect(mocks.requireAdmin).toHaveBeenCalledTimes(1);
			expect(mocks.run).toHaveBeenCalledTimes(1);
			expect(mocks.clearTaskTimer).toHaveBeenCalledWith("scan-library");
			expect(mocks.rescheduleTask).not.toHaveBeenCalled();
			expect(result).toEqual({ success: true });
		});

		it("emits a taskUpdated event", async () => {
			mocks.get.mockReturnValue({
				id: "refresh-metadata",
				interval: 3600,
				name: "Refresh Metadata",
			});

			await toggleTaskEnabledFn({
				data: { enabled: true, taskId: "refresh-metadata" },
			});

			expect(mocks.emit).toHaveBeenCalledWith({
				taskId: "refresh-metadata",
				type: "taskUpdated",
			});
		});

		it("does not reschedule when the enabled task is not found in DB", async () => {
			mocks.get.mockReturnValue(undefined);

			const result = await toggleTaskEnabledFn({
				data: { enabled: true, taskId: "missing-task" },
			});

			expect(mocks.rescheduleTask).not.toHaveBeenCalled();
			expect(result).toEqual({ success: true });
		});
	});
});
