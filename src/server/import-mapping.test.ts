import { describe, expect, test } from "bun:test";
import { mapBookFiles, mapMangaFiles, mapTvFiles } from "./import-mapping";

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

describe("mapMangaFiles", () => {
	test("maps Vol and Ch patterns", () => {
		const result = mapMangaFiles([
			"/downloads/Manga Vol.05 Ch.040.cbz",
			"/downloads/Manga Vol.05 Ch.041.cbz",
		]);
		expect(result).toEqual([
			{ path: "/downloads/Manga Vol.05 Ch.040.cbz", volume: 5, chapter: 40 },
			{ path: "/downloads/Manga Vol.05 Ch.041.cbz", volume: 5, chapter: 41 },
		]);
	});

	test("maps chapter-only patterns", () => {
		const result = mapMangaFiles([
			"/downloads/Manga Chapter 40.cbz",
			"/downloads/Manga Chapter 41.cbz",
		]);
		expect(result).toEqual([
			{ path: "/downloads/Manga Chapter 40.cbz", volume: null, chapter: 40 },
			{ path: "/downloads/Manga Chapter 41.cbz", volume: null, chapter: 41 },
		]);
	});

	test("maps volume-only patterns (no chapter)", () => {
		const result = mapMangaFiles([
			"/downloads/Manga Vol.01.cbz",
			"/downloads/Manga Vol.02.cbz",
		]);
		expect(result).toEqual([
			{ path: "/downloads/Manga Vol.01.cbz", volume: 1, chapter: null },
			{ path: "/downloads/Manga Vol.02.cbz", volume: 2, chapter: null },
		]);
	});

	test("skips non-matching files", () => {
		const result = mapMangaFiles([
			"/downloads/Manga Vol.05 Ch.040.cbz",
			"/downloads/cover.jpg",
		]);
		expect(result).toEqual([
			{ path: "/downloads/Manga Vol.05 Ch.040.cbz", volume: 5, chapter: 40 },
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
