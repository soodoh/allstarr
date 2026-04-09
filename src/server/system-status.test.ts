import { beforeEach, describe, expect, it, vi } from "vitest";

const systemStatusMocks = vi.hoisted(() => ({
	getDiskSpace: vi.fn(),
	getSystemAbout: vi.fn(),
	requireAuth: vi.fn(),
	runHealthChecks: vi.fn(),
}));

vi.mock("@tanstack/react-start", () => ({
	createServerFn: () => ({
		handler: (handler: (...args: unknown[]) => unknown) => handler,
	}),
}));

vi.mock("./middleware", () => ({
	requireAuth: systemStatusMocks.requireAuth,
}));

vi.mock("./system-info", () => ({
	getDiskSpace: systemStatusMocks.getDiskSpace,
	getSystemAbout: systemStatusMocks.getSystemAbout,
	runHealthChecks: systemStatusMocks.runHealthChecks,
}));

import { getSystemStatusFn } from "./system-status";

describe("system status server function", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		systemStatusMocks.getDiskSpace.mockResolvedValue([
			{ freeSpace: 50, label: "/media", path: "/media", totalSpace: 100 },
		]);
		systemStatusMocks.getSystemAbout.mockResolvedValue({
			databasePath: "data/sqlite.db",
			databaseSize: 123,
			isDocker: false,
			osInfo: "Darwin 23.0.0 (arm64)",
			runtimeVersion: "1.2.0",
			sqliteVersion: "3.45.0",
			startTime: "2026-04-08T00:00:00.000Z",
			uptimeSeconds: 42,
			version: "0.1.0",
		});
		systemStatusMocks.runHealthChecks.mockResolvedValue([
			{
				message: "warning",
				source: "RootFolderCheck",
				type: "warning",
				wikiUrl: "/settings/profiles",
			},
		]);
	});

	it("requires auth and returns health, disk, and about data", async () => {
		await expect(getSystemStatusFn()).resolves.toEqual({
			about: {
				databasePath: "data/sqlite.db",
				databaseSize: 123,
				isDocker: false,
				osInfo: "Darwin 23.0.0 (arm64)",
				runtimeVersion: "1.2.0",
				sqliteVersion: "3.45.0",
				startTime: "2026-04-08T00:00:00.000Z",
				uptimeSeconds: 42,
				version: "0.1.0",
			},
			diskSpace: [
				{ freeSpace: 50, label: "/media", path: "/media", totalSpace: 100 },
			],
			health: [
				{
					message: "warning",
					source: "RootFolderCheck",
					type: "warning",
					wikiUrl: "/settings/profiles",
				},
			],
		});

		expect(systemStatusMocks.requireAuth).toHaveBeenCalledTimes(1);
		expect(systemStatusMocks.runHealthChecks).toHaveBeenCalledTimes(1);
		expect(systemStatusMocks.getDiskSpace).toHaveBeenCalledTimes(1);
		expect(systemStatusMocks.getSystemAbout).toHaveBeenCalledTimes(1);
	});
});
