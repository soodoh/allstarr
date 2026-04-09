import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const systemInfoMocks = vi.hoisted(() => ({
	accessSync: vi.fn(),
	existsSync: vi.fn(),
	getRootFolderPaths: vi.fn(),
	prepare: vi.fn(),
	readFileSync: vi.fn(),
	select: vi.fn(),
	spawnSync: vi.fn(),
	statSync: vi.fn(),
	statfsSync: vi.fn(),
	type: vi.fn(),
	uptime: vi.fn(),
	release: vi.fn(),
	arch: vi.fn(),
}));

const bunMock = vi.hoisted(() => ({
	spawnSync: vi.fn(),
	version: "test-bun",
}));

vi.mock("node:fs", () => ({
	accessSync: (...args: unknown[]) => systemInfoMocks.accessSync(...args),
	constants: {
		R_OK: 4,
		W_OK: 2,
	},
	existsSync: (...args: unknown[]) => systemInfoMocks.existsSync(...args),
	readFileSync: (...args: unknown[]) => systemInfoMocks.readFileSync(...args),
	statSync: (...args: unknown[]) => systemInfoMocks.statSync(...args),
	statfsSync: (...args: unknown[]) => systemInfoMocks.statfsSync(...args),
}));

vi.mock("node:os", () => ({
	arch: (...args: unknown[]) => systemInfoMocks.arch(...args),
	release: (...args: unknown[]) => systemInfoMocks.release(...args),
	type: (...args: unknown[]) => systemInfoMocks.type(...args),
}));

vi.mock("src/db", () => ({
	db: {
		select: (...args: unknown[]) => systemInfoMocks.select(...args),
	},
	sqlite: {
		prepare: (...args: unknown[]) => systemInfoMocks.prepare(...args),
	},
}));

vi.mock("./root-folders", () => ({
	getRootFolderPaths: (...args: unknown[]) =>
		systemInfoMocks.getRootFolderPaths(...args),
}));

import { getDiskSpace, getSystemAbout, runHealthChecks } from "./system-info";

const originalEnv = {
	DATABASE_URL: process.env.DATABASE_URL,
	HARDCOVER_TOKEN: process.env.HARDCOVER_TOKEN,
};

function createSelectChain(
	allResult?: unknown,
	getResult?: unknown,
): {
	all: ReturnType<typeof vi.fn>;
	from: ReturnType<typeof vi.fn>;
	get: ReturnType<typeof vi.fn>;
	where: ReturnType<typeof vi.fn>;
} {
	const chain = {
		all: vi.fn(() => allResult),
		from: vi.fn(() => chain),
		get: vi.fn(() => getResult),
		where: vi.fn(() => chain),
	};
	return chain;
}

describe("server/system-info", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.stubGlobal("Bun", bunMock as never);
		if (originalEnv.DATABASE_URL === undefined) {
			delete process.env.DATABASE_URL;
		} else {
			process.env.DATABASE_URL = originalEnv.DATABASE_URL;
		}
		if (originalEnv.HARDCOVER_TOKEN === undefined) {
			delete process.env.HARDCOVER_TOKEN;
		} else {
			process.env.HARDCOVER_TOKEN = originalEnv.HARDCOVER_TOKEN;
		}
		systemInfoMocks.type.mockReturnValue("Linux");
		systemInfoMocks.release.mockReturnValue("6.0.0");
		systemInfoMocks.arch.mockReturnValue("x64");
		systemInfoMocks.uptime.mockReturnValue(1234);
		bunMock.spawnSync.mockImplementation((...args: unknown[]) =>
			systemInfoMocks.spawnSync(...args),
		);
		vi.spyOn(process, "uptime").mockImplementation(() =>
			systemInfoMocks.uptime(),
		);
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	it("reports warnings when system prerequisites are missing", async () => {
		systemInfoMocks.getRootFolderPaths.mockReturnValue([]);
		systemInfoMocks.select
			.mockImplementationOnce(() => createSelectChain([]))
			.mockImplementationOnce(() => createSelectChain([]))
			.mockImplementationOnce(() => createSelectChain([]))
			.mockImplementationOnce(() => createSelectChain([], { count: 2 }));
		systemInfoMocks.spawnSync.mockReturnValue({ exitCode: 1 });
		systemInfoMocks.prepare.mockReturnValue({
			get: vi.fn(() => ({ v: "3.45.1" })),
		});
		process.env.HARDCOVER_TOKEN = "";

		const checks = await runHealthChecks();

		expect(systemInfoMocks.getRootFolderPaths).toHaveBeenCalledTimes(1);
		expect(checks).toEqual([
			{
				source: "RootFolderCheck",
				type: "warning",
				message:
					"No root folders have been configured. Set a root folder path on at least one download profile in Settings.",
				wikiUrl: "/settings/profiles",
			},
			{
				source: "IndexerCheck",
				type: "warning",
				message:
					"No indexers have been configured. Add at least one indexer in Settings.",
				wikiUrl: "/settings/indexers",
			},
			{
				source: "DownloadClientCheck",
				type: "warning",
				message:
					"No download clients have been configured. Add at least one download client in Settings.",
				wikiUrl: "/settings/download-clients",
			},
			{
				source: "HardcoverTokenCheck",
				type: "warning",
				message:
					"No Hardcover API token configured. Search functionality requires a valid token.",
				wikiUrl: "/settings/general",
			},
			{
				source: "SystemDependencyCheck",
				type: "warning",
				message:
					"FFmpeg is not installed. Audio and video metadata extraction will be unavailable. Install ffmpeg for full audio support.",
				wikiUrl: null,
			},
			{
				source: "UnmappedFilesCheck",
				type: "warning",
				message:
					"2 unmapped files found in your root folders. Review and map or ignore them.",
				wikiUrl: "/unmapped-files",
			},
		]);
	});

	it("reports an inaccessible root folder as an error", async () => {
		systemInfoMocks.getRootFolderPaths.mockReturnValue([
			"/media/good",
			"/media/missing",
		]);
		systemInfoMocks.accessSync.mockImplementation((folderPath: string) => {
			if (folderPath === "/media/missing") {
				throw new Error("missing");
			}
		});
		systemInfoMocks.select
			.mockImplementationOnce(() => createSelectChain([{ id: 1 }]))
			.mockImplementationOnce(() => createSelectChain([{ id: 1 }]))
			.mockImplementationOnce(() => createSelectChain([{ id: 1 }]))
			.mockImplementationOnce(() => createSelectChain([], { count: 0 }));
		systemInfoMocks.spawnSync.mockReturnValue({ exitCode: 0 });
		systemInfoMocks.prepare.mockReturnValue({
			get: vi.fn(() => ({ v: "3.45.1" })),
		});
		process.env.HARDCOVER_TOKEN = "token";

		const checks = await runHealthChecks();

		expect(systemInfoMocks.accessSync).toHaveBeenNthCalledWith(
			1,
			"/media/good",
			6,
		);
		expect(systemInfoMocks.accessSync).toHaveBeenNthCalledWith(
			2,
			"/media/missing",
			6,
		);
		expect(checks).toContainEqual({
			source: "RootFolderCheck",
			type: "error",
			message:
				'Root folder "/media/missing" is not accessible or does not exist.',
			wikiUrl: "/settings/profiles",
		});
		expect(checks).not.toContainEqual(
			expect.objectContaining({ source: "IndexerCheck" }),
		);
		expect(checks).not.toContainEqual(
			expect.objectContaining({ source: "DownloadClientCheck" }),
		);
		expect(checks).not.toContainEqual(
			expect.objectContaining({ source: "HardcoverTokenCheck" }),
		);
		expect(checks).not.toContainEqual(
			expect.objectContaining({ source: "SystemDependencyCheck" }),
		);
		expect(checks).not.toContainEqual(
			expect.objectContaining({ source: "UnmappedFilesCheck" }),
		);
	});

	it("returns disk-space entries for accessible folders and zeros for missing ones", async () => {
		systemInfoMocks.getRootFolderPaths.mockReturnValue([
			"/media/a",
			"/media/b",
		]);
		systemInfoMocks.statfsSync.mockImplementation((folderPath: string) => {
			if (folderPath === "/media/a") {
				return { bfree: 2, bsize: 10, blocks: 5 };
			}
			throw new Error("missing");
		});

		await expect(getDiskSpace()).resolves.toEqual([
			{
				path: "/media/a",
				label: "/media/a",
				freeSpace: 20,
				totalSpace: 50,
			},
			{
				path: "/media/b",
				label: "/media/b",
				freeSpace: 0,
				totalSpace: 0,
			},
		]);
	});

	it("reports system about details using the docker detection and sqlite version paths", async () => {
		process.env.DATABASE_URL = "/custom/sqlite.db";
		systemInfoMocks.statSync.mockReturnValue({ size: 4096 });
		systemInfoMocks.existsSync.mockImplementation(
			(path: string) => path === "/.dockerenv",
		);
		systemInfoMocks.prepare.mockReturnValue({
			get: vi.fn(() => ({ v: "3.46.0" })),
		});
		systemInfoMocks.readFileSync.mockReturnValue("");
		systemInfoMocks.type.mockReturnValue("Linux");
		systemInfoMocks.release.mockReturnValue("6.1.0");
		systemInfoMocks.arch.mockReturnValue("arm64");
		systemInfoMocks.uptime.mockReturnValue(9876);

		const about = await getSystemAbout();

		expect(systemInfoMocks.statSync).toHaveBeenCalledWith("/custom/sqlite.db");
		expect(systemInfoMocks.prepare).toHaveBeenCalledWith(
			"SELECT sqlite_version() as v",
		);
		expect(about).toEqual({
			version: "0.1.0",
			runtimeVersion: bunMock.version,
			sqliteVersion: "3.46.0",
			databasePath: "/custom/sqlite.db",
			databaseSize: 4096,
			osInfo: "Linux 6.1.0 (arm64)",
			isDocker: true,
			uptimeSeconds: 9876,
			startTime: expect.any(String),
		});
	});

	it("falls back to zero database size and non-docker detection when files are missing", async () => {
		delete process.env.DATABASE_URL;
		systemInfoMocks.statSync.mockImplementation(() => {
			throw new Error("missing");
		});
		systemInfoMocks.existsSync.mockReturnValue(false);
		systemInfoMocks.readFileSync.mockImplementation(() => {
			throw new Error("missing");
		});
		systemInfoMocks.prepare.mockReturnValue({
			get: vi.fn(() => ({ v: "3.46.0" })),
		});

		const about = await getSystemAbout();

		expect(about.databasePath).toBe("data/sqlite.db");
		expect(about.databaseSize).toBe(0);
		expect(about.isDocker).toBe(false);
		expect(about.sqliteVersion).toBe("3.46.0");
	});
});
