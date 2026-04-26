import { describe, expect, it } from "vitest";
import { isTaskUpdatedEventForTask } from "./tasks";

describe("isTaskUpdatedEventForTask", () => {
	it("matches taskUpdated events for the expected task", () => {
		expect(
			isTaskUpdatedEventForTask(
				{
					type: "taskUpdated",
					data: JSON.stringify({ type: "taskUpdated", taskId: "rss-sync" }),
				},
				"rss-sync",
			),
		).toBe(true);
	});

	it("rejects malformed, unrelated, and different-task events", () => {
		expect(
			isTaskUpdatedEventForTask(
				{ type: "taskUpdated", data: "{not-json" },
				"rss-sync",
			),
		).toBe(false);
		expect(
			isTaskUpdatedEventForTask(
				{
					type: "queueUpdated",
					data: JSON.stringify({ type: "queueUpdated" }),
				},
				"rss-sync",
			),
		).toBe(false);
		expect(
			isTaskUpdatedEventForTask(
				{
					type: "taskUpdated",
					data: JSON.stringify({
						type: "taskUpdated",
						taskId: "rescan-folders",
					}),
				},
				"rss-sync",
			),
		).toBe(false);
	});
});
