import { describe, expect, test } from "vitest";
import { mapBookFiles, mapTvFiles } from "./import-mapping";

describe("mapTvFiles", () => {
	test("maps S01E01 pattern to season/episode", () => {
		const result = mapTvFiles([
			"/downloads/Show.S01E01.720p.mkv",
			"/downloads/Show.S01E02.720p.mkv",
			"/downloads/Show.S01E03.720p.mkv",
		]);
		expect(result).toEqual([
			{ path: "/downloads/Show.S01E01.720p.mkv", season: 1, episode: 1 },
			{ path: "/downloads/Show.S01E02.720p.mkv", season: 1, episode: 2 },
			{ path: "/downloads/Show.S01E03.720p.mkv", season: 1, episode: 3 },
		]);
	});

	test("handles multi-season files", () => {
		const result = mapTvFiles([
			"/downloads/Show.S01E01.mkv",
			"/downloads/Show.S02E01.mkv",
		]);
		expect(result).toEqual([
			{ path: "/downloads/Show.S01E01.mkv", season: 1, episode: 1 },
			{ path: "/downloads/Show.S02E01.mkv", season: 2, episode: 1 },
		]);
	});

	test("skips files without episode patterns", () => {
		const result = mapTvFiles([
			"/downloads/Show.S01E01.mkv",
			"/downloads/Show.nfo",
			"/downloads/extras/featurette.mkv",
		]);
		expect(result).toEqual([
			{ path: "/downloads/Show.S01E01.mkv", season: 1, episode: 1 },
		]);
	});
});

describe("mapBookFiles", () => {
	test("returns file paths with extracted titles for fuzzy matching", () => {
		const result = mapBookFiles([
			"/downloads/Brandon Sanderson - The Way of Kings.epub",
			"/downloads/Brandon Sanderson - Words of Radiance.epub",
		]);
		expect(result).toEqual([
			{
				path: "/downloads/Brandon Sanderson - The Way of Kings.epub",
				extractedTitle: "The Way of Kings",
			},
			{
				path: "/downloads/Brandon Sanderson - Words of Radiance.epub",
				extractedTitle: "Words of Radiance",
			},
		]);
	});

	test("handles files without author-title separator", () => {
		const result = mapBookFiles(["/downloads/The Way of Kings.epub"]);
		expect(result).toEqual([
			{
				path: "/downloads/The Way of Kings.epub",
				extractedTitle: "The Way of Kings",
			},
		]);
	});
});
