import { beforeEach, describe, expect, it } from "vitest";
import {
	clearRunningTasks,
	isTaskRunning,
	markTaskComplete,
	markTaskRunning,
} from "./state";

describe("scheduler/state", () => {
	beforeEach(() => {
		clearRunningTasks();
	});

	describe("isTaskRunning", () => {
		it("should return false for a task that was never started", () => {
			expect(isTaskRunning("task-1")).toBe(false);
		});

		it("should return true for a task that has been marked running", () => {
			markTaskRunning("task-1");
			expect(isTaskRunning("task-1")).toBe(true);
		});

		it("should return false for a task that was completed", () => {
			markTaskRunning("task-1");
			markTaskComplete("task-1");
			expect(isTaskRunning("task-1")).toBe(false);
		});
	});

	describe("markTaskRunning", () => {
		it("should mark a task as running", () => {
			markTaskRunning("task-1");
			expect(isTaskRunning("task-1")).toBe(true);
		});

		it("should be idempotent for the same task id", () => {
			markTaskRunning("task-1");
			markTaskRunning("task-1");
			expect(isTaskRunning("task-1")).toBe(true);
		});

		it("should track multiple tasks independently", () => {
			markTaskRunning("task-a");
			markTaskRunning("task-b");
			expect(isTaskRunning("task-a")).toBe(true);
			expect(isTaskRunning("task-b")).toBe(true);
			expect(isTaskRunning("task-c")).toBe(false);
		});
	});

	describe("markTaskComplete", () => {
		it("should remove a task from the running set", () => {
			markTaskRunning("task-1");
			markTaskComplete("task-1");
			expect(isTaskRunning("task-1")).toBe(false);
		});

		it("should be a no-op for a task that is not running", () => {
			expect(() => markTaskComplete("nonexistent")).not.toThrow();
			expect(isTaskRunning("nonexistent")).toBe(false);
		});

		it("should not affect other running tasks", () => {
			markTaskRunning("task-a");
			markTaskRunning("task-b");
			markTaskComplete("task-a");
			expect(isTaskRunning("task-a")).toBe(false);
			expect(isTaskRunning("task-b")).toBe(true);
		});
	});

	describe("clearRunningTasks", () => {
		it("should remove all running tasks", () => {
			markTaskRunning("task-1");
			markTaskRunning("task-2");
			markTaskRunning("task-3");
			clearRunningTasks();
			expect(isTaskRunning("task-1")).toBe(false);
			expect(isTaskRunning("task-2")).toBe(false);
			expect(isTaskRunning("task-3")).toBe(false);
		});

		it("should be safe to call when no tasks are running", () => {
			expect(() => clearRunningTasks()).not.toThrow();
		});
	});
});
