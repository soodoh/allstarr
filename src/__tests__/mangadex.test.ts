import { describe, it, expect } from "vitest";
import {
  parseMangaDexAggregate,
  matchMangaUpdatesSlug,
} from "src/server/mangadex";

// ─── Fixtures ─────────────────────────────────────────────────────────────

const BERSERK_AGGREGATE = {
  result: "ok",
  volumes: {
    "1": {
      volume: "1",
      count: 6,
      chapters: {
        "1": { chapter: "1", id: "a1", others: [], count: 1 },
        "2": { chapter: "2", id: "a2", others: [], count: 1 },
        "3": { chapter: "3", id: "a3", others: [], count: 1 },
        "4": { chapter: "4", id: "a4", others: [], count: 1 },
        "5": { chapter: "5", id: "a5", others: [], count: 1 },
        "6": { chapter: "6", id: "a6", others: [], count: 1 },
      },
    },
    "2": {
      volume: "2",
      count: 5,
      chapters: {
        "7": { chapter: "7", id: "b1", others: [], count: 1 },
        "8": { chapter: "8", id: "b2", others: [], count: 1 },
        "9": { chapter: "9", id: "b3", others: [], count: 1 },
        "10": { chapter: "10", id: "b4", others: [], count: 1 },
        "11": { chapter: "11", id: "b5", others: [], count: 1 },
      },
    },
    none: {
      volume: "none",
      count: 2,
      chapters: {
        "380": { chapter: "380", id: "c1", others: [], count: 1 },
        "381": { chapter: "381", id: "c2", others: [], count: 1 },
      },
    },
  },
};

const EMPTY_AGGREGATE = {
  result: "ok",
  volumes: {},
};

const SINGLE_VOLUME_AGGREGATE = {
  result: "ok",
  volumes: {
    "1": {
      volume: "1",
      count: 3,
      chapters: {
        "1": { chapter: "1", id: "a1", others: [], count: 1 },
        "2": { chapter: "2", id: "a2", others: [], count: 1 },
        "3": { chapter: "3", id: "a3", others: [], count: 1 },
      },
    },
  },
};

const NON_NUMERIC_CHAPTERS_AGGREGATE = {
  result: "ok",
  volumes: {
    "1": {
      volume: "1",
      count: 3,
      chapters: {
        "1": { chapter: "1", id: "a1", others: [], count: 1 },
        "2": { chapter: "2", id: "a2", others: [], count: 1 },
        Prologue: { chapter: "Prologue", id: "a3", others: [], count: 1 },
      },
    },
  },
};

// ─── parseMangaDexAggregate ───────────────────────────────────────────────

describe("parseMangaDexAggregate", () => {
  it("returns volume mappings with correct firstChapter and lastChapter", () => {
    const result = parseMangaDexAggregate(BERSERK_AGGREGATE);
    const vol1 = result.mappings.find((m) => m.volumeNumber === 1);
    const vol2 = result.mappings.find((m) => m.volumeNumber === 2);
    expect(vol1).toStrictEqual({
      volumeNumber: 1,
      firstChapter: 1,
      lastChapter: 6,
    });
    expect(vol2).toStrictEqual({
      volumeNumber: 2,
      firstChapter: 7,
      lastChapter: 11,
    });
  });

  it("excludes the 'none' bucket from volume mappings", () => {
    const result = parseMangaDexAggregate(BERSERK_AGGREGATE);
    expect(result.mappings).toHaveLength(2);
    expect(result.mappings.every((m) => m.volumeNumber !== null)).toBe(true);
  });

  it("returns chapter numbers from the 'none' bucket separately", () => {
    const result = parseMangaDexAggregate(BERSERK_AGGREGATE);
    expect(result.ungroupedChapters).toContain("380");
    expect(result.ungroupedChapters).toContain("381");
  });

  it("returns all chapter numbers across all volumes", () => {
    const result = parseMangaDexAggregate(BERSERK_AGGREGATE);
    expect(result.allChapterNumbers).toHaveLength(13);
    expect(result.allChapterNumbers).toContain("1");
    expect(result.allChapterNumbers).toContain("11");
    expect(result.allChapterNumbers).toContain("380");
    expect(result.allChapterNumbers).toContain("381");
  });

  it("returns empty arrays for empty aggregate", () => {
    const result = parseMangaDexAggregate(EMPTY_AGGREGATE);
    expect(result.mappings).toStrictEqual([]);
    expect(result.ungroupedChapters).toStrictEqual([]);
    expect(result.allChapterNumbers).toStrictEqual([]);
  });

  it("handles single-volume aggregate", () => {
    const result = parseMangaDexAggregate(SINGLE_VOLUME_AGGREGATE);
    expect(result.mappings).toHaveLength(1);
    expect(result.mappings[0]).toStrictEqual({
      volumeNumber: 1,
      firstChapter: 1,
      lastChapter: 3,
    });
  });

  it("ignores non-numeric chapter keys when computing min/max", () => {
    const result = parseMangaDexAggregate(NON_NUMERIC_CHAPTERS_AGGREGATE);
    expect(result.mappings).toHaveLength(1);
    expect(result.mappings[0]).toStrictEqual({
      volumeNumber: 1,
      firstChapter: 1,
      lastChapter: 2,
    });
  });

  it("sorts volume mappings by volumeNumber ascending", () => {
    // Construct an aggregate with volumes in non-sorted order
    const aggregate = {
      result: "ok",
      volumes: {
        "3": {
          volume: "3",
          count: 2,
          chapters: {
            "20": { chapter: "20", id: "z1", others: [], count: 1 },
            "21": { chapter: "21", id: "z2", others: [], count: 1 },
          },
        },
        "1": {
          volume: "1",
          count: 2,
          chapters: {
            "1": { chapter: "1", id: "x1", others: [], count: 1 },
            "2": { chapter: "2", id: "x2", others: [], count: 1 },
          },
        },
        "2": {
          volume: "2",
          count: 2,
          chapters: {
            "10": { chapter: "10", id: "y1", others: [], count: 1 },
            "11": { chapter: "11", id: "y2", others: [], count: 1 },
          },
        },
      },
    };
    const result = parseMangaDexAggregate(aggregate);
    expect(result.mappings.map((m) => m.volumeNumber)).toStrictEqual([1, 2, 3]);
  });
});

// ─── matchMangaUpdatesSlug ────────────────────────────────────────────────

describe("matchMangaUpdatesSlug", () => {
  it("matches when MangaDex mu link equals the slug ID portion", () => {
    expect(matchMangaUpdatesSlug("njeqwry/berserk", "njeqwry")).toBe(true);
  });

  it("matches when slug has no title suffix", () => {
    expect(matchMangaUpdatesSlug("njeqwry", "njeqwry")).toBe(true);
  });

  it("returns false for non-matching slugs", () => {
    expect(matchMangaUpdatesSlug("njeqwry/berserk", "pb8uwds")).toBe(false);
  });

  it("returns false for null slug", () => {
    expect(matchMangaUpdatesSlug(null, "njeqwry")).toBe(false);
  });

  it("returns false for null mu link", () => {
    expect(matchMangaUpdatesSlug("njeqwry/berserk", null)).toBe(false);
  });
});
