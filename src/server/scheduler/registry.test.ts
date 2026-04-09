import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	getAllTasks,
	getTask,
	registerTask,
	type TaskResult,
} from "./registry";

function createMockTask(overrides: { id: string; name?: string }) {
	return {
		id: overrides.id,
		name: overrides.name ?? `Task ${overrides.id}`,
		description: `Description for ${overrides.id}`,
		defaultInterval: 300,
		group: "maintenance" as const,
		handler: vi
			.fn<(updateProgress: (message: string) => void) => Promise<TaskResult>>()
			.mockResolvedValue({
				success: true,
				message: "done",
			}),
	};
}

describe("scheduler/registry", () => {
	// The registry is a module-level Map, so we need to be aware that
	// tasks registered in one test persist into subsequent tests.
	// We use unique IDs per test to avoid cross-contamination.

	describe("registerTask", () => {
		it("should register a task by its id", () => {
			const task = createMockTask({ id: "reg-register-1" });
			registerTask(task);
			expect(getTask("reg-register-1")).toBe(task);
		});

		it("should overwrite a task with the same id", () => {
			const first = createMockTask({ id: "reg-overwrite-1", name: "First" });
			const second = createMockTask({
				id: "reg-overwrite-1",
				name: "Second",
			});
			registerTask(first);
			registerTask(second);
			expect(getTask("reg-overwrite-1")).toBe(second);
			expect(getTask("reg-overwrite-1")?.name).toBe("Second");
		});
	});

	describe("getTask", () => {
		it("should return the task when it exists", () => {
			const task = createMockTask({ id: "reg-get-1" });
			registerTask(task);
			expect(getTask("reg-get-1")).toBe(task);
		});

		it("should return undefined for an unregistered id", () => {
			expect(getTask("nonexistent-task-id")).toBeUndefined();
		});
	});

	describe("getAllTasks", () => {
		it("should return an array containing all registered tasks", () => {
			const taskA = createMockTask({ id: "reg-all-a" });
			const taskB = createMockTask({ id: "reg-all-b" });
			registerTask(taskA);
			registerTask(taskB);

			const all = getAllTasks();
			expect(all).toContain(taskA);
			expect(all).toContain(taskB);
		});

		it("should return a new array each time (not the internal collection)", () => {
			const first = getAllTasks();
			const second = getAllTasks();
			expect(first).not.toBe(second);
			expect(first).toEqual(second);
		});

		it("should include tasks from all groups", () => {
			const search = createMockTask({ id: "reg-group-search" });
			search.group = "search";
			const media = createMockTask({ id: "reg-group-media" });
			media.group = "media";

			registerTask(search);
			registerTask(media);

			const all = getAllTasks();
			const ids = all.map((t) => t.id);
			expect(ids).toContain("reg-group-search");
			expect(ids).toContain("reg-group-media");
		});
	});
});
