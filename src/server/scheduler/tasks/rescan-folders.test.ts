import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	registerTask: vi.fn(),
	getRootFolderPaths: vi.fn(),
	rescanRootFolder: vi.fn(),
	logError: vi.fn(),
}));

vi.mock("src/server/disk-scan", () => ({
	getRootFolderPaths: mocks.getRootFolderPaths,
	rescanRootFolder: mocks.rescanRootFolder,
}));
vi.mock("src/server/logger", () => ({
	logError: mocks.logError,
}));
vi.mock("../registry", () => ({ registerTask: mocks.registerTask }));

import "./rescan-folders";

const taskDef = mocks.registerTask.mock.calls[0][0];
const handler = taskDef.handler;

function makeScanStats(
	overrides: Partial<{
		filesAdded: number;
		filesRemoved: number;
		filesUnchanged: number;
		filesUpdated: number;
		unmatchedFiles: number;
		errors: string[];
	}> = {},
) {
	return {
		filesAdded: 0,
		filesRemoved: 0,
		filesUnchanged: 0,
		filesUpdated: 0,
		unmatchedFiles: 0,
		errors: [],
		...overrides,
	};
}

describe("rescan-folders task", () => {
	const updateProgress = vi.fn();

	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("registers with correct metadata", () => {
		const def = taskDef;
		expect(def.id).toBe("rescan-folders");
		expect(def.name).toBe("Rescan Folders");
		expect(def.group).toBe("media");
		expect(def.defaultInterval).toBe(6 * 60 * 60);
	});

	it("returns early when no root folders configured", async () => {
		mocks.getRootFolderPaths.mockReturnValue([]);

		const result = await handler(updateProgress);

		expect(result).toEqual({
			success: true,
			message: "No root folders configured",
		});
		expect(mocks.rescanRootFolder).not.toHaveBeenCalled();
	});

	it("reports no changes detected when nothing changed", async () => {
		mocks.getRootFolderPaths.mockReturnValue(["/media/books"]);
		mocks.rescanRootFolder.mockResolvedValue(
			makeScanStats({ filesUnchanged: 10 }),
		);

		const result = await handler(updateProgress);

		expect(result).toEqual({
			success: true,
			message: "No changes detected",
		});
	});

	it("aggregates stats across multiple folders with changes", async () => {
		mocks.getRootFolderPaths.mockReturnValue([
			"/media/books",
			"/media/audiobooks",
		]);
		mocks.rescanRootFolder
			.mockResolvedValueOnce(
				makeScanStats({ filesAdded: 3, filesUnchanged: 5 }),
			)
			.mockResolvedValueOnce(
				makeScanStats({ filesAdded: 1, filesRemoved: 2, filesUpdated: 1 }),
			);

		const result = await handler(updateProgress);

		expect(result.success).toBe(true);
		expect(result.message).toBe(
			"Scanned 2 folders, 4 files added, 2 files removed, 1 file updated, 5 files unchanged",
		);
	});

	it("includes unmatched file count in summary", async () => {
		mocks.getRootFolderPaths.mockReturnValue(["/media/books"]);
		mocks.rescanRootFolder.mockResolvedValue(
			makeScanStats({ filesAdded: 1, unmatchedFiles: 3 }),
		);

		const result = await handler(updateProgress);

		expect(result.success).toBe(true);
		expect(result.message).toBe(
			"Scanned 1 folder, 1 file added, 3 unmatched files",
		);
	});

	it("sets success false when scan returns errors", async () => {
		mocks.getRootFolderPaths.mockReturnValue(["/media/books"]);
		mocks.rescanRootFolder.mockResolvedValue(
			makeScanStats({
				filesAdded: 2,
				errors: ["Failed to read file.epub"],
			}),
		);

		const result = await handler(updateProgress);

		expect(result.success).toBe(false);
		expect(result.message).toBe("Scanned 1 folder, 2 files added, 1 error");
	});

	it("handles folder scan throwing an error", async () => {
		mocks.getRootFolderPaths.mockReturnValue([
			"/media/books",
			"/media/audiobooks",
		]);
		mocks.rescanRootFolder
			.mockResolvedValueOnce(makeScanStats({ filesAdded: 1 }))
			.mockRejectedValueOnce(new Error("Permission denied"));

		const result = await handler(updateProgress);

		expect(mocks.logError).toHaveBeenCalledWith(
			"rescan-folders",
			'Failed to scan folder "/media/audiobooks"',
			expect.any(Error),
		);
		expect(result.success).toBe(false);
		expect(result.message).toBe("Scanned 2 folders, 1 file added, 1 error");
	});

	it("handles non-Error thrown value in catch block", async () => {
		mocks.getRootFolderPaths.mockReturnValue(["/media/books"]);
		mocks.rescanRootFolder.mockRejectedValue("string error");

		const result = await handler(updateProgress);

		expect(mocks.logError).toHaveBeenCalledWith(
			"rescan-folders",
			'Failed to scan folder "/media/books"',
			"string error",
		);
		expect(result.success).toBe(false);
		// No file changes so the code returns "No changes detected" despite error
		expect(result.message).toBe("No changes detected");
	});

	it("uses singular form for single folder", async () => {
		mocks.getRootFolderPaths.mockReturnValue(["/media/books"]);
		mocks.rescanRootFolder.mockResolvedValue(makeScanStats({ filesAdded: 1 }));

		const result = await handler(updateProgress);

		expect(result.message).toContain("Scanned 1 folder");
	});

	it("uses plural form for multiple folders", async () => {
		mocks.getRootFolderPaths.mockReturnValue(["/a", "/b", "/c"]);
		mocks.rescanRootFolder.mockResolvedValue(makeScanStats({ filesAdded: 1 }));

		const result = await handler(updateProgress);

		expect(result.message).toContain("Scanned 3 folders");
	});
});
