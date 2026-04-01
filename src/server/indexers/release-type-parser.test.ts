import { describe, expect, test } from "bun:test";
import detectReleaseType from "./release-type-parser";
import { ReleaseType } from "./types";

describe("detectReleaseType — TV shows", () => {
	test("single episode: S01E01", () => {
		const result = detectReleaseType(
			"Show.Name.S01E01.720p.BluRay-GROUP",
			"tv",
		);
		expect(result.releaseType).toBe(ReleaseType.SingleEpisode);
		expect(result.packInfo).toBeNull();
	});

	test("single episode: S02E15", () => {
		const result = detectReleaseType(
			"Show.Name.S02E15.1080p.WEB-DL-GROUP",
			"tv",
		);
		expect(result.releaseType).toBe(ReleaseType.SingleEpisode);
		expect(result.packInfo).toBeNull();
	});

	test("multi-episode: S01E01-E03", () => {
		const result = detectReleaseType(
			"Show.Name.S01E01-E03.720p.BluRay-GROUP",
			"tv",
		);
		expect(result.releaseType).toBe(ReleaseType.MultiEpisode);
		expect(result.packInfo).toEqual({ seasons: [1], episodes: [1, 2, 3] });
	});

	test("multi-episode: S01E01E02", () => {
		const result = detectReleaseType(
			"Show.Name.S01E01E02.720p.HDTV-GROUP",
			"tv",
		);
		expect(result.releaseType).toBe(ReleaseType.MultiEpisode);
		expect(result.packInfo).toEqual({ seasons: [1], episodes: [1, 2] });
	});

	test("season pack: S01 with no episode", () => {
		const result = detectReleaseType("Show.Name.S01.720p.BluRay-GROUP", "tv");
		expect(result.releaseType).toBe(ReleaseType.SeasonPack);
		expect(result.packInfo).toEqual({ seasons: [1] });
	});

	test("season pack: Season 2", () => {
		const result = detectReleaseType("Show Name Season 2 1080p WEB-DL", "tv");
		expect(result.releaseType).toBe(ReleaseType.SeasonPack);
		expect(result.packInfo).toEqual({ seasons: [2] });
	});

	test("multi-season pack: S01-S03", () => {
		const result = detectReleaseType(
			"Show.Name.S01-S03.720p.BluRay-GROUP",
			"tv",
		);
		expect(result.releaseType).toBe(ReleaseType.MultiSeasonPack);
		expect(result.packInfo).toEqual({ seasons: [1, 2, 3] });
	});

	test("multi-season pack: S01-S05", () => {
		const result = detectReleaseType(
			"Show.Name.S01-S05.COMPLETE.1080p.BluRay-GROUP",
			"tv",
		);
		expect(result.releaseType).toBe(ReleaseType.MultiSeasonPack);
		expect(result.packInfo).toEqual({ seasons: [1, 2, 3, 4, 5] });
	});

	test("multi-season pack: Complete Series", () => {
		const result = detectReleaseType(
			"Show.Name.Complete.Series.720p.BluRay-GROUP",
			"tv",
		);
		expect(result.releaseType).toBe(ReleaseType.MultiSeasonPack);
		expect(result.packInfo).toEqual({ seasons: [] });
	});

	test("daily show episode", () => {
		const result = detectReleaseType(
			"Show.Name.2024.03.15.720p.WEB-DL-GROUP",
			"tv",
		);
		expect(result.releaseType).toBe(ReleaseType.SingleEpisode);
		expect(result.packInfo).toBeNull();
	});

	test("unknown when no pattern matches", () => {
		const result = detectReleaseType("Some.Random.Title.720p-GROUP", "tv");
		expect(result.releaseType).toBe(ReleaseType.Unknown);
		expect(result.packInfo).toBeNull();
	});
});

describe("detectReleaseType — books", () => {
	test("single book: Author - Title", () => {
		const result = detectReleaseType(
			"Brandon Sanderson - The Way of Kings [EPUB]",
			"book",
		);
		expect(result.releaseType).toBe(ReleaseType.SingleBook);
		expect(result.packInfo).toBeNull();
	});

	test("author pack: Complete Collection", () => {
		const result = detectReleaseType(
			"Brandon Sanderson - Complete Collection (45 books) [EPUB]",
			"book",
		);
		expect(result.releaseType).toBe(ReleaseType.AuthorPack);
		expect(result.packInfo).toEqual({});
	});

	test("author pack: Complete Works", () => {
		const result = detectReleaseType(
			"Stephen King Complete Works EPUB",
			"book",
		);
		expect(result.releaseType).toBe(ReleaseType.AuthorPack);
		expect(result.packInfo).toEqual({});
	});

	test("author pack: Collection keyword", () => {
		const result = detectReleaseType(
			"Terry Pratchett - Discworld Collection [MOBI]",
			"book",
		);
		expect(result.releaseType).toBe(ReleaseType.AuthorPack);
		expect(result.packInfo).toEqual({});
	});

	test("author pack: N books indicator", () => {
		const result = detectReleaseType(
			"Author Name (35 Books) EPUB MOBI",
			"book",
		);
		expect(result.releaseType).toBe(ReleaseType.AuthorPack);
		expect(result.packInfo).toEqual({});
	});

	test("author pack: Series keyword", () => {
		const result = detectReleaseType(
			"Brandon Sanderson - Stormlight Archive Series [EPUB]",
			"book",
		);
		expect(result.releaseType).toBe(ReleaseType.AuthorPack);
		expect(result.packInfo).toEqual({});
	});

	test("single book: no pack keywords", () => {
		const result = detectReleaseType("Some Book Title 2024 EPUB", "book");
		expect(result.releaseType).toBe(ReleaseType.SingleBook);
		expect(result.packInfo).toBeNull();
	});
});
