import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TaskResult } from "../registry";

const mocks = vi.hoisted(() => ({
	registerTask: vi.fn(),
	refreshDownloads: vi.fn(),
	eventBus: { getClientCount: vi.fn() },
	rescheduleTask: vi.fn(),
}));

vi.mock("../registry", () => ({
	registerTask: mocks.registerTask,
}));

vi.mock("../../download-manager", () => ({
	refreshDownloads: mocks.refreshDownloads,
}));

vi.mock("../../event-bus", () => ({
	eventBus: mocks.eventBus,
}));

vi.mock("../timers", () => ({
	rescheduleTask: mocks.rescheduleTask,
}));

// Import to trigger registerTask at module level
await import("./refresh-downloads");

const taskDef = mocks.registerTask.mock.calls[0][0];
const handler = taskDef.handler;

describe("refresh-downloads task", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("registers with correct metadata", () => {
		expect(taskDef.id).toBe("refresh-downloads");
		expect(taskDef.name).toBe("Refresh Downloads");
		expect(taskDef.group).toBe("media");
		expect(taskDef.defaultInterval).toBe(60);
	});

	it("reschedules to 4s when active downloads and clients connected", async () => {
		const result: TaskResult = {
			success: true,
			message: "Refreshed 3 downloads",
		};
		mocks.refreshDownloads.mockResolvedValue(result);
		mocks.eventBus.getClientCount.mockReturnValue(2);

		const returned = await handler(vi.fn());

		expect(returned).toBe(result);
		expect(mocks.rescheduleTask).toHaveBeenCalledWith(
			"refresh-downloads",
			4000,
		);
	});

	it("reschedules to 15s when no active downloads but clients connected", async () => {
		const result: TaskResult = {
			success: true,
			message: "No active tracked downloads",
		};
		mocks.refreshDownloads.mockResolvedValue(result);
		mocks.eventBus.getClientCount.mockReturnValue(1);

		const returned = await handler(vi.fn());

		expect(returned).toBe(result);
		expect(mocks.rescheduleTask).toHaveBeenCalledWith(
			"refresh-downloads",
			15_000,
		);
	});

	it("reschedules to 60s when no clients connected", async () => {
		const result: TaskResult = {
			success: true,
			message: "Refreshed 5 downloads",
		};
		mocks.refreshDownloads.mockResolvedValue(result);
		mocks.eventBus.getClientCount.mockReturnValue(0);

		const returned = await handler(vi.fn());

		expect(returned).toBe(result);
		expect(mocks.rescheduleTask).toHaveBeenCalledWith(
			"refresh-downloads",
			60_000,
		);
	});

	it("does not reschedule when interval stays the same", async () => {
		// First call: set interval to 60s (no clients)
		mocks.refreshDownloads.mockResolvedValue({
			success: true,
			message: "No active tracked downloads",
		});
		mocks.eventBus.getClientCount.mockReturnValue(0);
		await handler(vi.fn());
		vi.clearAllMocks();

		// Second call: still no clients, interval should remain 60s
		mocks.refreshDownloads.mockResolvedValue({
			success: true,
			message: "No active tracked downloads",
		});
		mocks.eventBus.getClientCount.mockReturnValue(0);
		await handler(vi.fn());

		expect(mocks.rescheduleTask).not.toHaveBeenCalled();
	});

	it("returns the result from refreshDownloads", async () => {
		const result: TaskResult = {
			success: false,
			message: "Download client unavailable",
		};
		mocks.refreshDownloads.mockResolvedValue(result);
		mocks.eventBus.getClientCount.mockReturnValue(0);

		const returned = await handler(vi.fn());

		expect(returned).toEqual(result);
	});

	it("treats unsuccessful result as no active downloads", async () => {
		const result: TaskResult = {
			success: false,
			message: "Connection failed",
		};
		mocks.refreshDownloads.mockResolvedValue(result);
		mocks.eventBus.getClientCount.mockReturnValue(3);

		await handler(vi.fn());

		// success is false, so hasActiveDownloads is false => INTERVAL_IDLE (15s)
		expect(mocks.rescheduleTask).toHaveBeenCalledWith(
			"refresh-downloads",
			15_000,
		);
	});
});
