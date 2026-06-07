import { describe, expect, it } from "vitest";
import {
	assignImportAssets,
	buildAssetOperations,
	type ImportAssetRowInput,
	pruneEmptyDirectories,
} from "./import-assets";

function buildRow(
	overrides: Partial<ImportAssetRowInput> = {},
): ImportAssetRowInput {
	return {
		rowId: "tv-101",
		contentType: "tv",
		sourcePath:
			"/downloads/Severance/Season 1/Severance - S01E01 - Good News About Hell.mkv",
		destinationPath: "/library/tv/Severance/Season 01/Severance S01E01.mkv",
		sourceContainerRoot: "/downloads/Severance",
		destinationContainerRoot: "/library/tv/Severance",
		...overrides,
	};
}

describe("assignImportAssets", () => {
	it("attaches tv episode assets, trickplay trees, and show-level theme audio to one owning row", () => {
		const result = assignImportAssets({
			rows: [buildRow()],
			discoveredPaths: [
				"/downloads/Severance/Season 1/Severance - S01E01 - Good News About Hell.nfo",
				"/downloads/Severance/Season 1/Severance - S01E01 - Good News About Hell-thumb.jpg",
				"/downloads/Severance/Season 1/Severance - S01E01 - Good News About Hell.trickplay/320 - 10x10/0.jpg",
				"/downloads/Severance/theme.mp3",
			],
		});

		expect(result.unrelatedPaths).toEqual([]);
		expect(
			result.rows[0]?.assets.map((asset) => ({
				sourcePath: asset.sourcePath,
				destinationRelativePath: asset.destinationRelativePath,
				kind: asset.kind,
				ownershipReason: asset.ownershipReason,
			})),
		).toEqual([
			{
				sourcePath:
					"/downloads/Severance/Season 1/Severance - S01E01 - Good News About Hell-thumb.jpg",
				destinationRelativePath: "Season 01/Severance S01E01-thumb.jpg",
				kind: "file",
				ownershipReason: "direct",
			},
			{
				sourcePath:
					"/downloads/Severance/Season 1/Severance - S01E01 - Good News About Hell.nfo",
				destinationRelativePath: "Season 01/Severance S01E01.nfo",
				kind: "file",
				ownershipReason: "direct",
			},
			{
				sourcePath:
					"/downloads/Severance/Season 1/Severance - S01E01 - Good News About Hell.trickplay",
				destinationRelativePath: "Season 01/Severance S01E01.trickplay",
				kind: "directory",
				ownershipReason: "nested",
			},
			{
				sourcePath: "/downloads/Severance/theme.mp3",
				destinationRelativePath: "theme.mp3",
				kind: "file",
				ownershipReason: "container",
			},
		]);
	});

	it("places direct tv assets beside the managed episode when the source file is at show root", () => {
		const result = assignImportAssets({
			rows: [
				buildRow({
					sourcePath:
						"/downloads/Severance/Severance - S01E01 - Good News About Hell.mkv",
				}),
			],
			discoveredPaths: [
				"/downloads/Severance/Severance - S01E01 - Good News About Hell.nfo",
				"/downloads/Severance/Severance - S01E01 - Good News About Hell.trickplay/320 - 10x10/0.jpg",
			],
		});

		expect(
			result.rows[0]?.assets.map((asset) => ({
				sourcePath: asset.sourcePath,
				destinationRelativePath: asset.destinationRelativePath,
				kind: asset.kind,
			})),
		).toEqual([
			{
				sourcePath:
					"/downloads/Severance/Severance - S01E01 - Good News About Hell.nfo",
				destinationRelativePath: "Season 01/Severance S01E01.nfo",
				kind: "file",
			},
			{
				sourcePath:
					"/downloads/Severance/Severance - S01E01 - Good News About Hell.trickplay",
				destinationRelativePath: "Season 01/Severance S01E01.trickplay",
				kind: "directory",
			},
		]);
	});

	it("uses episode tokens and source containment when stems do not match", () => {
		const result = assignImportAssets({
			rows: [
				buildRow({
					sourcePath: "/downloads/Show/Season 1/Show.S01E01.mkv",
					destinationPath: "/library/tv/Show/Season 01/Show S01E01.mkv",
					sourceContainerRoot: "/downloads/Show",
					destinationContainerRoot: "/library/tv/Show",
				}),
			],
			discoveredPaths: [
				"/downloads/Show/Season 1/Commentary.S01E01.en.srt",
				"/other/Show/Season 1/Show.S01E01.nfo",
			],
		});

		expect(result.rows[0]?.assets).toEqual([
			expect.objectContaining({
				destinationRelativePath: "Season 01/Commentary.S01E01.en.srt",
				ownershipReason: "token",
				sourcePath: "/downloads/Show/Season 1/Commentary.S01E01.en.srt",
			}),
		]);
		expect(result.unrelatedPaths).toEqual([
			"/other/Show/Season 1/Show.S01E01.nfo",
		]);
	});

	it("assigns ambiguous TV container assets deterministically to the earliest source row", () => {
		const result = assignImportAssets({
			rows: [
				buildRow({
					rowId: "tv-2",
					sourcePath: "/downloads/Show/Season 1/Show.S01E02.mkv",
					destinationPath: "/library/tv/Show/Season 01/Show S01E02.mkv",
					sourceContainerRoot: "/downloads/Show",
					destinationContainerRoot: "/library/tv/Show",
				}),
				buildRow({
					rowId: "tv-1",
					sourcePath: "/downloads/Show/Season 1/Show.S01E01.mkv",
					destinationPath: "/library/tv/Show/Season 01/Show S01E01.mkv",
					sourceContainerRoot: "/downloads/Show",
					destinationContainerRoot: "/library/tv/Show",
				}),
			],
			discoveredPaths: ["/downloads/Show/theme.mp3"],
		});

		expect(result.unrelatedPaths).toEqual([]);
		expect(result.rows[0]?.assets).toEqual([]);
		expect(result.rows[1]?.assets).toEqual([
			expect.objectContaining({
				destinationRelativePath: "theme.mp3",
				ownershipReason: "container",
			}),
		]);
	});

	it("marks ambiguous container files as unrelated instead of attaching twice", () => {
		const result = assignImportAssets({
			rows: [
				buildRow({
					rowId: "audio-1",
					contentType: "audiobook",
					sourcePath: "/downloads/Foundation/Foundation (1).mp3",
					destinationPath:
						"/library/audiobooks/Isaac Asimov/Foundation/Foundation (1).mp3",
					sourceContainerRoot: "/downloads/Foundation",
					destinationContainerRoot:
						"/library/audiobooks/Isaac Asimov/Foundation",
				}),
				buildRow({
					rowId: "audio-2",
					contentType: "audiobook",
					sourcePath: "/downloads/Foundation/Foundation (2).mp3",
					destinationPath:
						"/library/audiobooks/Isaac Asimov/Foundation/Foundation (2).mp3",
					sourceContainerRoot: "/downloads/Foundation",
					destinationContainerRoot:
						"/library/audiobooks/Isaac Asimov/Foundation",
				}),
			],
			discoveredPaths: ["/downloads/Foundation/random.bin"],
		});

		expect(result.rows[0]?.assets).toEqual([]);
		expect(result.rows[1]?.assets).toEqual([]);
		expect(result.unrelatedPaths).toEqual(["/downloads/Foundation/random.bin"]);
	});
});

describe("buildAssetOperations", () => {
	it("keeps trickplay directories as preserved subtrees instead of flattening them", () => {
		const result = assignImportAssets({
			rows: [buildRow()],
			discoveredPaths: [
				"/downloads/Severance/Season 1/Severance - S01E01 - Good News About Hell.trickplay/320 - 10x10/0.jpg",
			],
		});
		const row = result.rows[0];
		expect(row).toBeDefined();
		if (!row) {
			throw new Error("Expected assigned import asset row");
		}

		const operations = buildAssetOperations({
			row,
			deleteDeselectedAssets: false,
		});

		expect(operations.moves).toEqual([
			{
				from: "/downloads/Severance/Season 1/Severance - S01E01 - Good News About Hell.trickplay",
				to: "/library/tv/Severance/Season 01/Severance S01E01.trickplay",
				kind: "directory",
			},
		]);
		expect(operations.deletes).toEqual([]);
		expect(operations.stopAt).toBe("/downloads/Severance");
	});

	it("deletes deselected move assets only when enabled and preserves ignored assets", () => {
		const row = {
			...buildRow(),
			assets: [
				{
					action: "move" as const,
					destinationRelativePath: "Season 01/subtitle.srt",
					kind: "file" as const,
					ownershipReason: "direct" as const,
					relativeSourcePath: "Season 1/subtitle.srt",
					selected: false,
					sourcePath: "/downloads/Severance/Season 1/subtitle.srt",
				},
				{
					action: "ignore" as const,
					destinationRelativePath: "Season 01/poster.jpg",
					kind: "file" as const,
					ownershipReason: "container" as const,
					relativeSourcePath: "poster.jpg",
					selected: false,
					sourcePath: "/downloads/Severance/poster.jpg",
				},
			],
		};

		expect(
			buildAssetOperations({ row, deleteDeselectedAssets: false }).deletes,
		).toEqual([]);
		expect(
			buildAssetOperations({ row, deleteDeselectedAssets: true }).deletes,
		).toEqual([
			{
				kind: "file",
				path: "/downloads/Severance/Season 1/subtitle.srt",
			},
		]);
	});

	it("builds delete operations for deselected attached assets when enabled", () => {
		const result = assignImportAssets({
			rows: [
				buildRow({
					rowId: "movie-1",
					contentType: "movie",
					sourcePath:
						"/downloads/Maria by Callas (2017)/Maria.by.Callas.2017.720p.BluRay.800MB.x264-GalaxyRG.mkv",
					destinationPath:
						"/library/movies/Maria by Callas (2017)/Maria by Callas (2017).mkv",
					sourceContainerRoot: "/downloads/Maria by Callas (2017)",
					destinationContainerRoot: "/library/movies/Maria by Callas (2017)",
				}),
			],
			discoveredPaths: ["/downloads/Maria by Callas (2017)/movie.nfo"],
		});

		const row = result.rows[0];
		expect(row).toBeDefined();
		if (!row) {
			throw new Error("Expected assigned import asset row");
		}
		row.assets[0] = {
			...row.assets[0],
			selected: false,
			action: "delete",
		};

		const operations = buildAssetOperations({
			row,
			deleteDeselectedAssets: true,
		});

		expect(operations.moves).toEqual([]);
		expect(operations.deletes).toEqual([
			{
				path: "/downloads/Maria by Callas (2017)/movie.nfo",
				kind: "file",
			},
		]);
	});
});

describe("pruneEmptyDirectories", () => {
	it("removes only empty directories below the bounded container root", () => {
		const deleted: string[] = [];

		pruneEmptyDirectories({
			startDirectories: [
				"/downloads/Severance/Season 1/Severance - S01E01 - Good News About Hell.trickplay/320 - 10x10",
			],
			stopAt: "/downloads/Severance",
			listEntries: (dir) =>
				({
					"/downloads/Severance/Season 1/Severance - S01E01 - Good News About Hell.trickplay/320 - 10x10":
						[],
					"/downloads/Severance/Season 1/Severance - S01E01 - Good News About Hell.trickplay/320":
						[],
					"/downloads/Severance/Season 1/Severance - S01E01 - Good News About Hell.trickplay":
						[],
					"/downloads/Severance/Season 1": ["unrelated.keep"],
				})[dir] ?? [],
			removeDirectory: (dir) => {
				deleted.push(dir);
			},
		});

		expect(deleted).toEqual([
			"/downloads/Severance/Season 1/Severance - S01E01 - Good News About Hell.trickplay/320 - 10x10",
			"/downloads/Severance/Season 1/Severance - S01E01 - Good News About Hell.trickplay",
		]);
	});
});
