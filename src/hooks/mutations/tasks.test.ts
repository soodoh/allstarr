import { QueryClient } from "@tanstack/react-query";
import { renderHook } from "src/test/render";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
	error,
	invalidateQueries,
	runScheduledTaskFn,
	success,
	toggleTaskEnabledFn,
} = vi.hoisted(() => ({
	error: vi.fn(),
	invalidateQueries: vi.fn(),
	runScheduledTaskFn: vi.fn(),
	success: vi.fn(),
	toggleTaskEnabledFn: vi.fn(),
}));

vi.mock("sonner", () => ({
	toast: {
		error,
		success,
	},
}));

vi.mock("src/server/tasks", () => ({
	runScheduledTaskFn: (...args: unknown[]) => runScheduledTaskFn(...args),
	toggleTaskEnabledFn: (...args: unknown[]) => toggleTaskEnabledFn(...args),
}));

import { queryKeys } from "src/lib/query-keys";

import { useRunTask, useToggleTaskEnabled } from "./tasks";

describe("mutations/tasks", () => {
	beforeEach(() => {
		vi.spyOn(QueryClient.prototype, "invalidateQueries").mockImplementation(
			invalidateQueries,
		);
	});

	afterEach(() => {
		vi.restoreAllMocks();
		error.mockReset();
		invalidateQueries.mockReset();
		runScheduledTaskFn.mockReset();
		success.mockReset();
		toggleTaskEnabledFn.mockReset();
	});

	it("wires run-task mutations and success handling", async () => {
		runScheduledTaskFn.mockResolvedValue({ ok: true });

		const { result } = await renderHook(() => useRunTask());

		await result.current.mutateAsync("task-1");

		expect(runScheduledTaskFn).toHaveBeenCalledWith({
			data: { taskId: "task-1" },
		});
		expect(success).toHaveBeenCalledWith("Task completed");
		expect(invalidateQueries).toHaveBeenCalledWith({
			queryKey: queryKeys.tasks.all,
		});
	});

	it("shows the run-task error toast", async () => {
		runScheduledTaskFn.mockRejectedValue(new Error("boom"));

		const { result } = await renderHook(() => useRunTask());

		await result.current.mutateAsync("task-1").catch(() => {});

		expect(error).toHaveBeenCalledWith("boom");
	});

	it("wires toggle-task mutations and invalidates tasks", async () => {
		toggleTaskEnabledFn.mockResolvedValue({ ok: true });

		const { result } = await renderHook(() => useToggleTaskEnabled());

		await result.current.mutateAsync({
			enabled: true,
			taskId: "task-2",
		});

		expect(toggleTaskEnabledFn).toHaveBeenCalledWith({
			data: { enabled: true, taskId: "task-2" },
		});
		expect(invalidateQueries).toHaveBeenCalledWith({
			queryKey: queryKeys.tasks.all,
		});
	});

	it("shows the toggle-task error toast", async () => {
		toggleTaskEnabledFn.mockRejectedValue("nope");

		const { result } = await renderHook(() => useToggleTaskEnabled());

		await result.current
			.mutateAsync({
				enabled: true,
				taskId: "task-2",
			})
			.catch(() => {});

		expect(error).toHaveBeenCalledWith("Failed to update task");
	});
});
