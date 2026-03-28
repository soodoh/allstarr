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

describe("detectReleaseType — manga", () => {
  test("multi-volume: Vol 01-10", () => {
    const result = detectReleaseType("One Piece Vol.01-10 [CBZ]", "manga");
    expect(result.releaseType).toBe(ReleaseType.MultiVolume);
    expect(result.packInfo).toEqual({
      volumes: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    });
  });

  test("multi-volume: v01-v05", () => {
    const result = detectReleaseType("Naruto v01-v05 CBZ", "manga");
    expect(result.releaseType).toBe(ReleaseType.MultiVolume);
    expect(result.packInfo).toEqual({ volumes: [1, 2, 3, 4, 5] });
  });

  test("multi-volume: Volumes 1-3", () => {
    const result = detectReleaseType("Berserk Volumes 1-3 [Digital]", "manga");
    expect(result.releaseType).toBe(ReleaseType.MultiVolume);
    expect(result.packInfo).toEqual({ volumes: [1, 2, 3] });
  });

  test("single volume: Vol 05", () => {
    const result = detectReleaseType("One Piece Vol.05 [CBZ]", "manga");
    expect(result.releaseType).toBe(ReleaseType.SingleVolume);
    expect(result.packInfo).toEqual({ volumes: [5] });
  });

  test("single volume: v03", () => {
    const result = detectReleaseType("Naruto v03 CBZ", "manga");
    expect(result.releaseType).toBe(ReleaseType.SingleVolume);
    expect(result.packInfo).toEqual({ volumes: [3] });
  });

  test("single volume: Volume 12", () => {
    const result = detectReleaseType("Berserk Volume 12 [Digital]", "manga");
    expect(result.releaseType).toBe(ReleaseType.SingleVolume);
    expect(result.packInfo).toEqual({ volumes: [12] });
  });

  test("multi-chapter: Ch 040-045", () => {
    const result = detectReleaseType("One Piece Ch.040-045 [CBZ]", "manga");
    expect(result.releaseType).toBe(ReleaseType.MultiChapter);
    expect(result.packInfo).toEqual({ chapters: [40, 41, 42, 43, 44, 45] });
  });

  test("multi-chapter: c010-c015", () => {
    const result = detectReleaseType("Naruto c010-c015 CBZ", "manga");
    expect(result.releaseType).toBe(ReleaseType.MultiChapter);
    expect(result.packInfo).toEqual({ chapters: [10, 11, 12, 13, 14, 15] });
  });

  test("multi-chapter: Chapters 1-5", () => {
    const result = detectReleaseType("Berserk Chapters 1-5 [Digital]", "manga");
    expect(result.releaseType).toBe(ReleaseType.MultiChapter);
    expect(result.packInfo).toEqual({ chapters: [1, 2, 3, 4, 5] });
  });

  test("single chapter: Ch 040", () => {
    const result = detectReleaseType("One Piece Ch.040 [CBZ]", "manga");
    expect(result.releaseType).toBe(ReleaseType.SingleChapter);
    expect(result.packInfo).toBeNull();
  });

  test("single chapter: Chapter 40", () => {
    const result = detectReleaseType("One Piece Chapter 40 [CBZ]", "manga");
    expect(result.releaseType).toBe(ReleaseType.SingleChapter);
    expect(result.packInfo).toBeNull();
  });

  test("single chapter: c040", () => {
    const result = detectReleaseType("Naruto c040 CBZ", "manga");
    expect(result.releaseType).toBe(ReleaseType.SingleChapter);
    expect(result.packInfo).toBeNull();
  });

  test("volume + chapter: Vol 05 Ch 040 treated as single chapter in volume context", () => {
    const result = detectReleaseType("One Piece Vol.05 Ch.040 [CBZ]", "manga");
    expect(result.releaseType).toBe(ReleaseType.SingleChapter);
    expect(result.packInfo).toBeNull();
  });

  test("unknown when no pattern matches", () => {
    const result = detectReleaseType("Some Random Manga Title", "manga");
    expect(result.releaseType).toBe(ReleaseType.Unknown);
    expect(result.packInfo).toBeNull();
  });
});
