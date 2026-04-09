import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	accessSync: vi.fn(),
	writeFileSync: vi.fn(),
	unlinkSync: vi.fn(),
	readdirSync: vi.fn(),
	statSync: vi.fn(),
}));

vi.mock("node:fs", () => ({
	default: {
		accessSync: mocks.accessSync,
		writeFileSync: mocks.writeFileSync,
		unlinkSync: mocks.unlinkSync,
		readdirSync: mocks.readdirSync,
		statSync: mocks.statSync,
		constants: { W_OK: 2 },
	},
}));

vi.mock("node:path", () => ({
	default: {
		join: (...args: string[]) => args.join("/"),
	},
}));

import {
	assertWritableFolder,
	listDownloadFiles,
	removeDownloadFile,
	writeDownloadFile,
} from "./blackhole-node";

beforeEach(() => {
	vi.resetAllMocks();
});

describe("assertWritableFolder", () => {
	it("succeeds when the folder is writable", () => {
		mocks.accessSync.mockReturnValue(undefined);

		expect(() => assertWritableFolder("/downloads")).not.toThrow();
		expect(mocks.accessSync).toHaveBeenCalledWith("/downloads", 2);
	});

	it("throws when the folder is not writable", () => {
		mocks.accessSync.mockImplementation(() => {
			throw new Error("EACCES: permission denied");
		});

		expect(() => assertWritableFolder("/readonly")).toThrow(
			"EACCES: permission denied",
		);
	});

	it("throws when the folder does not exist", () => {
		mocks.accessSync.mockImplementation(() => {
			throw new Error("ENOENT: no such file or directory");
		});

		expect(() => assertWritableFolder("/missing")).toThrow("ENOENT");
	});
});

describe("writeDownloadFile", () => {
	it("writes binary data without encoding", () => {
		const data = new Uint8Array([1, 2, 3]);
		const result = writeDownloadFile("/downloads", "test.torrent", data);

		expect(result).toBe("/downloads/test.torrent");
		expect(mocks.writeFileSync).toHaveBeenCalledWith(
			"/downloads/test.torrent",
			data,
		);
	});

	it("writes string data with encoding", () => {
		const result = writeDownloadFile(
			"/downloads",
			"test.torrent.url",
			"https://example.com/file.torrent",
			"utf8",
		);

		expect(result).toBe("/downloads/test.torrent.url");
		expect(mocks.writeFileSync).toHaveBeenCalledWith(
			"/downloads/test.torrent.url",
			"https://example.com/file.torrent",
			"utf8",
		);
	});

	it("writes string data without encoding when none is provided", () => {
		const result = writeDownloadFile("/downloads", "test.nzb", "nzb-content");

		expect(result).toBe("/downloads/test.nzb");
		expect(mocks.writeFileSync).toHaveBeenCalledWith(
			"/downloads/test.nzb",
			"nzb-content",
		);
	});

	it("propagates write errors", () => {
		mocks.writeFileSync.mockImplementation(() => {
			throw new Error("ENOSPC: no space left on device");
		});

		expect(() =>
			writeDownloadFile("/downloads", "test.torrent", new Uint8Array([1])),
		).toThrow("ENOSPC");
	});
});

describe("removeDownloadFile", () => {
	it("unlinks the file at the joined path", () => {
		removeDownloadFile("/downloads", "test.torrent");

		expect(mocks.unlinkSync).toHaveBeenCalledWith("/downloads/test.torrent");
	});

	it("silently ignores errors when file was already picked up", () => {
		mocks.unlinkSync.mockImplementation(() => {
			throw new Error("ENOENT: no such file or directory");
		});

		expect(() =>
			removeDownloadFile("/downloads", "test.torrent"),
		).not.toThrow();
	});
});

describe("listDownloadFiles", () => {
	it("returns .torrent and .nzb files with stats", () => {
		mocks.readdirSync.mockReturnValue([
			"movie.torrent",
			"show.nzb",
			"readme.txt",
			"notes.log",
		]);
		mocks.statSync
			.mockReturnValueOnce({ size: 1024 })
			.mockReturnValueOnce({ size: 2048 });

		const result = listDownloadFiles("/downloads");

		expect(result).toEqual([
			{ id: "movie.torrent", name: "movie.torrent", size: 1024 },
			{ id: "show.nzb", name: "show.nzb", size: 2048 },
		]);
		expect(mocks.statSync).toHaveBeenCalledTimes(2);
		expect(mocks.statSync).toHaveBeenCalledWith("/downloads/movie.torrent");
		expect(mocks.statSync).toHaveBeenCalledWith("/downloads/show.nzb");
	});

	it("filters out non-torrent/nzb files", () => {
		mocks.readdirSync.mockReturnValue(["readme.txt", "image.png", ".hidden"]);

		const result = listDownloadFiles("/downloads");

		expect(result).toEqual([]);
		expect(mocks.statSync).not.toHaveBeenCalled();
	});

	it("returns an empty array when the directory is empty", () => {
		mocks.readdirSync.mockReturnValue([]);

		const result = listDownloadFiles("/downloads");

		expect(result).toEqual([]);
	});

	it("returns an empty array when readdir throws", () => {
		mocks.readdirSync.mockImplementation(() => {
			throw new Error("ENOENT: no such file or directory");
		});

		const result = listDownloadFiles("/downloads");

		expect(result).toEqual([]);
	});
});
