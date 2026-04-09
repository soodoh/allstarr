import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	all: vi.fn(),
}));

vi.mock("src/db", () => ({
	db: {
		select: vi.fn(() => ({
			from: vi.fn(() => ({
				all: mocks.all,
			})),
		})),
	},
}));

vi.mock("src/db/schema", () => ({
	downloadProfiles: { rootFolderPath: "downloadProfiles.rootFolderPath" },
}));

beforeEach(() => {
	vi.clearAllMocks();
});

describe("getRootFolderPaths", () => {
	it("returns unique root folder paths", async () => {
		mocks.all.mockReturnValueOnce([
			{ rootFolderPath: "/movies" },
			{ rootFolderPath: "/tv" },
			{ rootFolderPath: "/movies" },
			{ rootFolderPath: "/tv" },
		]);

		const { getRootFolderPaths } = await import("../root-folders");
		const result = getRootFolderPaths();

		expect(result).toEqual(["/movies", "/tv"]);
		expect(mocks.all).toHaveBeenCalledTimes(1);
	});

	it("filters out null and empty paths", async () => {
		mocks.all.mockReturnValueOnce([
			{ rootFolderPath: "/movies" },
			{ rootFolderPath: null },
			{ rootFolderPath: "" },
			{ rootFolderPath: "/tv" },
		]);

		const { getRootFolderPaths } = await import("../root-folders");
		const result = getRootFolderPaths();

		expect(result).toEqual(["/movies", "/tv"]);
	});

	it("returns empty array when no profiles exist", async () => {
		mocks.all.mockReturnValueOnce([]);

		const { getRootFolderPaths } = await import("../root-folders");
		const result = getRootFolderPaths();

		expect(result).toEqual([]);
	});
});
