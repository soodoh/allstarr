import { afterEach, describe, expect, it, vi } from "vitest";

const resetRouteMocks = vi.hoisted(() => ({
	clearRunningTasks: vi.fn(),
	invalidateFormatDefCache: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
	createFileRoute: () => (config: unknown) => config,
}));

vi.mock("src/server/indexers/format-parser", () => ({
	invalidateFormatDefCache: resetRouteMocks.invalidateFormatDefCache,
}));

vi.mock("src/server/scheduler/state", () => ({
	clearRunningTasks: resetRouteMocks.clearRunningTasks,
}));

import { Route as TestResetRoute } from "./__test-reset";

describe("test reset api route", () => {
	const originalMode = process.env.E2E_TEST_MODE;

	afterEach(() => {
		process.env.E2E_TEST_MODE = originalMode;
		vi.clearAllMocks();
	});

	function getHandler() {
		return (
			TestResetRoute as unknown as {
				server: {
					handlers: {
						POST: () => Promise<Response>;
					};
				};
			}
		).server.handlers.POST;
	}

	it("returns 404 when test mode is not enabled", async () => {
		process.env.E2E_TEST_MODE = "false";

		const response = await getHandler()();

		expect(response.status).toBe(404);
		await expect(response.text()).resolves.toBe("Not available");
		expect(resetRouteMocks.invalidateFormatDefCache).not.toHaveBeenCalled();
		expect(resetRouteMocks.clearRunningTasks).not.toHaveBeenCalled();
	});

	it("clears caches and returns ok when test mode is enabled", async () => {
		process.env.E2E_TEST_MODE = "true";

		const response = await getHandler()();

		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toEqual({ ok: true });
		expect(resetRouteMocks.invalidateFormatDefCache).toHaveBeenCalledTimes(1);
		expect(resetRouteMocks.clearRunningTasks).toHaveBeenCalledTimes(1);
	});
});
