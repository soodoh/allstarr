import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ConnectionConfig, DownloadRequest } from "./types";

const mocks = vi.hoisted(() => ({
	assertWritableFolder: vi.fn(),
	writeDownloadFile: vi.fn(),
	removeDownloadFile: vi.fn(),
	listDownloadFiles: vi.fn(),
}));

vi.mock("@tanstack/react-start", () => ({
	createServerOnlyFn: (fn: () => Promise<unknown>) => fn,
}));

vi.mock("./blackhole-node", () => ({
	assertWritableFolder: mocks.assertWritableFolder,
	writeDownloadFile: mocks.writeDownloadFile,
	removeDownloadFile: mocks.removeDownloadFile,
	listDownloadFiles: mocks.listDownloadFiles,
}));

import blackholeProvider from "./blackhole";

beforeEach(() => {
	vi.resetAllMocks();
});

function makeConfig(
	overrides: Partial<ConnectionConfig> = {},
): ConnectionConfig {
	return {
		implementation: "Blackhole",
		host: "",
		port: 0,
		useSsl: false,
		urlBase: null,
		username: null,
		password: null,
		apiKey: null,
		category: null,
		tag: null,
		settings: { watchFolder: "/downloads/watch" },
		...overrides,
	};
}

function makeDownload(
	overrides: Partial<DownloadRequest> = {},
): DownloadRequest {
	return {
		url: null,
		torrentData: null,
		nzbData: null,
		category: null,
		tag: null,
		savePath: null,
		...overrides,
	};
}

describe("getWatchFolder", () => {
	it("throws when settings is null", async () => {
		await expect(
			blackholeProvider.testConnection(makeConfig({ settings: null })),
		).resolves.toEqual({
			success: false,
			message:
				"Blackhole watch folder is not configured. Set watchFolder in settings.",
			version: null,
		});
	});

	it("throws when watchFolder is missing from settings", async () => {
		await expect(
			blackholeProvider.testConnection(makeConfig({ settings: {} })),
		).resolves.toEqual({
			success: false,
			message:
				"Blackhole watch folder is not configured. Set watchFolder in settings.",
			version: null,
		});
	});

	it("throws when watchFolder is an empty string", async () => {
		await expect(
			blackholeProvider.testConnection(
				makeConfig({ settings: { watchFolder: "   " } }),
			),
		).resolves.toEqual({
			success: false,
			message:
				"Blackhole watch folder is not configured. Set watchFolder in settings.",
			version: null,
		});
	});
});

describe("testConnection", () => {
	it("returns success when the folder is writable", async () => {
		mocks.assertWritableFolder.mockReturnValue(undefined);

		const result = await blackholeProvider.testConnection(makeConfig());

		expect(result).toEqual({
			success: true,
			message: "Blackhole folder is accessible: /downloads/watch",
			version: "N/A",
		});
		expect(mocks.assertWritableFolder).toHaveBeenCalledWith("/downloads/watch");
	});

	it("returns failure when the folder is not writable", async () => {
		mocks.assertWritableFolder.mockImplementation(() => {
			throw new Error("EACCES: permission denied");
		});

		const result = await blackholeProvider.testConnection(makeConfig());

		expect(result).toEqual({
			success: false,
			message: "Cannot access folder: EACCES: permission denied",
			version: null,
		});
	});

	it("trims whitespace from the watch folder path", async () => {
		mocks.assertWritableFolder.mockReturnValue(undefined);

		const result = await blackholeProvider.testConnection(
			makeConfig({ settings: { watchFolder: "  /downloads/watch  " } }),
		);

		expect(result).toEqual({
			success: true,
			message: "Blackhole folder is accessible: /downloads/watch",
			version: "N/A",
		});
		expect(mocks.assertWritableFolder).toHaveBeenCalledWith("/downloads/watch");
	});
});

describe("addDownload", () => {
	it("writes torrent data with .torrent extension", async () => {
		const torrentData = Buffer.from([1, 2, 3]);
		mocks.writeDownloadFile.mockReturnValue(
			"/downloads/watch/allstarr-123.torrent",
		);
		vi.spyOn(Date, "now").mockReturnValue(123);

		const result = await blackholeProvider.addDownload(
			makeConfig(),
			makeDownload({ torrentData }),
		);

		expect(result).toBe("/downloads/watch/allstarr-123.torrent");
		expect(mocks.writeDownloadFile).toHaveBeenCalledWith(
			"/downloads/watch",
			"allstarr-123.torrent",
			torrentData,
		);
	});

	it("writes nzb data with .nzb extension", async () => {
		const nzbData = Buffer.from("<nzb></nzb>");
		mocks.writeDownloadFile.mockReturnValue(
			"/downloads/watch/allstarr-456.nzb",
		);
		vi.spyOn(Date, "now").mockReturnValue(456);

		const result = await blackholeProvider.addDownload(
			makeConfig(),
			makeDownload({ nzbData }),
		);

		expect(result).toBe("/downloads/watch/allstarr-456.nzb");
		expect(mocks.writeDownloadFile).toHaveBeenCalledWith(
			"/downloads/watch",
			"allstarr-456.nzb",
			nzbData,
		);
	});

	it("writes a .torrent.url file for torrent URLs", async () => {
		mocks.writeDownloadFile.mockReturnValue(
			"/downloads/watch/allstarr-789.torrent.url",
		);
		vi.spyOn(Date, "now").mockReturnValue(789);

		const result = await blackholeProvider.addDownload(
			makeConfig(),
			makeDownload({ url: "https://example.com/file.torrent" }),
		);

		expect(result).toBe("/downloads/watch/allstarr-789.torrent.url");
		expect(mocks.writeDownloadFile).toHaveBeenCalledWith(
			"/downloads/watch",
			"allstarr-789.torrent.url",
			"https://example.com/file.torrent",
			"utf8",
		);
	});

	it("writes a .nzb.url file for nzb URLs", async () => {
		mocks.writeDownloadFile.mockReturnValue(
			"/downloads/watch/allstarr-999.nzb.url",
		);
		vi.spyOn(Date, "now").mockReturnValue(999);

		const result = await blackholeProvider.addDownload(
			makeConfig(),
			makeDownload({ url: "https://example.com/file.nzb" }),
		);

		expect(result).toBe("/downloads/watch/allstarr-999.nzb.url");
		expect(mocks.writeDownloadFile).toHaveBeenCalledWith(
			"/downloads/watch",
			"allstarr-999.nzb.url",
			"https://example.com/file.nzb",
			"utf8",
		);
	});

	it("prefers torrentData over nzbData and url", async () => {
		const torrentData = Buffer.from([1]);
		const nzbData = Buffer.from([2]);
		mocks.writeDownloadFile.mockReturnValue(
			"/downloads/watch/allstarr-100.torrent",
		);
		vi.spyOn(Date, "now").mockReturnValue(100);

		await blackholeProvider.addDownload(
			makeConfig(),
			makeDownload({
				torrentData,
				nzbData,
				url: "https://example.com/file.torrent",
			}),
		);

		expect(mocks.writeDownloadFile).toHaveBeenCalledWith(
			"/downloads/watch",
			"allstarr-100.torrent",
			torrentData,
		);
	});

	it("throws when no url or file data is provided", async () => {
		await expect(
			blackholeProvider.addDownload(makeConfig(), makeDownload()),
		).rejects.toThrow("No URL or file data provided for Blackhole download");
	});

	it("throws when watchFolder is not configured", async () => {
		await expect(
			blackholeProvider.addDownload(
				makeConfig({ settings: null }),
				makeDownload({ url: "https://example.com/file.torrent" }),
			),
		).rejects.toThrow("Blackhole watch folder is not configured");
	});
});

describe("removeDownload", () => {
	it("delegates to removeDownloadFile with the correct folder and id", async () => {
		await blackholeProvider.removeDownload(makeConfig(), "test.torrent", false);

		expect(mocks.removeDownloadFile).toHaveBeenCalledWith(
			"/downloads/watch",
			"test.torrent",
		);
	});

	it("ignores the deleteFiles flag", async () => {
		await blackholeProvider.removeDownload(makeConfig(), "test.torrent", true);

		expect(mocks.removeDownloadFile).toHaveBeenCalledWith(
			"/downloads/watch",
			"test.torrent",
		);
	});
});

describe("getDownloads", () => {
	it("maps listed files to DownloadItem objects", async () => {
		mocks.listDownloadFiles.mockReturnValue([
			{ id: "movie.torrent", name: "movie.torrent", size: 1024 },
			{ id: "show.nzb", name: "show.nzb", size: 2048 },
		]);

		const result = await blackholeProvider.getDownloads(makeConfig());

		expect(result).toEqual([
			{
				id: "movie.torrent",
				name: "movie.torrent",
				status: "queued",
				size: 1024,
				downloaded: 1024,
				uploadSpeed: 0,
				downloadSpeed: 0,
				category: null,
				outputPath: null,
				isCompleted: false,
			},
			{
				id: "show.nzb",
				name: "show.nzb",
				status: "queued",
				size: 2048,
				downloaded: 2048,
				uploadSpeed: 0,
				downloadSpeed: 0,
				category: null,
				outputPath: null,
				isCompleted: false,
			},
		]);
		expect(mocks.listDownloadFiles).toHaveBeenCalledWith("/downloads/watch");
	});

	it("returns an empty array when no files exist", async () => {
		mocks.listDownloadFiles.mockReturnValue([]);

		const result = await blackholeProvider.getDownloads(makeConfig());

		expect(result).toEqual([]);
	});
});
