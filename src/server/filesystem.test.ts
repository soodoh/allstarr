import { beforeEach, describe, expect, it, vi } from "vitest";

const filesystemMocks = vi.hoisted(() => ({
	browseDirectoryParse: vi.fn((data: unknown) => data),
	existsSync: vi.fn(),
	readdirSync: vi.fn(),
	requireAdmin: vi.fn(),
	statSync: vi.fn(),
}));

vi.mock("@tanstack/react-start", () => ({
	createServerFn: () => ({
		handler: (handler: (...args: unknown[]) => unknown) => handler,
		inputValidator: (validator: (input: unknown) => unknown) => ({
			handler:
				(
					handler: (input: {
						data: { path: string; showHidden?: boolean };
					}) => unknown,
				) =>
				(input: { data: { path: string; showHidden?: boolean } }) =>
					handler({
						data: validator(input.data) as {
							path: string;
							showHidden?: boolean;
						},
					}),
		}),
	}),
}));

vi.mock("node:fs", () => ({
	existsSync: filesystemMocks.existsSync,
	readdirSync: filesystemMocks.readdirSync,
	statSync: filesystemMocks.statSync,
}));

vi.mock("src/lib/validators", () => ({
	browseDirectorySchema: {
		parse: filesystemMocks.browseDirectoryParse,
	},
}));

vi.mock("./middleware", () => ({
	requireAdmin: filesystemMocks.requireAdmin,
}));

import { browseDirectoryFn, getServerCwdFn } from "./filesystem";

describe("filesystem server functions", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("returns the server cwd after admin auth", async () => {
		await expect(getServerCwdFn()).resolves.toBe(process.cwd());
		expect(filesystemMocks.requireAdmin).toHaveBeenCalledTimes(1);
	});

	it("falls back to cwd when the requested path is missing", async () => {
		filesystemMocks.existsSync.mockReturnValue(false);
		filesystemMocks.readdirSync.mockReturnValue([]);

		await expect(
			browseDirectoryFn({
				data: { path: "/missing/path", showHidden: false },
			}),
		).resolves.toEqual({
			current: process.cwd(),
			directories: [],
			parent:
				process.cwd() === "/"
					? null
					: process.cwd().slice(0, process.cwd().lastIndexOf("/")) || "/",
		});
	});

	it("lists visible directories, resolves directory symlinks, and sorts results", async () => {
		filesystemMocks.existsSync.mockImplementation(
			(path: string) => path === "/media/library",
		);
		filesystemMocks.readdirSync.mockReturnValue([
			{
				isDirectory: () => false,
				isSymbolicLink: () => true,
				name: "beta-link",
			},
			{
				isDirectory: () => true,
				isSymbolicLink: () => false,
				name: ".hidden",
			},
			{
				isDirectory: () => false,
				isSymbolicLink: () => false,
				name: "notes.txt",
			},
			{
				isDirectory: () => true,
				isSymbolicLink: () => false,
				name: "alpha",
			},
		]);
		filesystemMocks.statSync.mockReturnValue({
			isDirectory: () => true,
		});

		await expect(
			browseDirectoryFn({
				data: { path: "/media/library", showHidden: false },
			}),
		).resolves.toEqual({
			current: "/media/library",
			directories: [
				{ name: "alpha", path: "/media/library/alpha" },
				{ name: "beta-link", path: "/media/library/beta-link" },
			],
			parent: "/media",
		});

		expect(filesystemMocks.requireAdmin).toHaveBeenCalledTimes(1);
		expect(filesystemMocks.browseDirectoryParse).toHaveBeenCalledWith({
			path: "/media/library",
			showHidden: false,
		});
		expect(filesystemMocks.statSync).toHaveBeenCalledWith(
			"/media/library/beta-link",
		);
	});

	it("includes hidden directories when requested and treats broken symlinks as non-directories", async () => {
		filesystemMocks.existsSync.mockImplementation(
			(path: string) => path === "/",
		);
		filesystemMocks.readdirSync.mockReturnValue([
			{
				isDirectory: () => true,
				isSymbolicLink: () => false,
				name: ".config",
			},
			{
				isDirectory: () => false,
				isSymbolicLink: () => true,
				name: "broken-link",
			},
		]);
		filesystemMocks.statSync.mockImplementation(() => {
			throw new Error("broken");
		});

		await expect(
			browseDirectoryFn({
				data: { path: "/", showHidden: true },
			}),
		).resolves.toEqual({
			current: "/",
			directories: [{ name: ".config", path: "/.config" }],
			parent: null,
		});
	});
});
