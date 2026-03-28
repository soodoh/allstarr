# Pack Preference & Multi-Pack Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add release type detection, pack-aware searching, and pack qualification so Allstarr prefers season/volume/author packs when appropriate, including multi-season and multi-volume packs that Sonarr doesn't support.

**Architecture:** Release titles are parsed to detect type (single, multi, pack) and extract pack contents. The scoring comparator adds release type rank between CF score and size. Pack qualification gates auto-grab on whether all contained items are wanted. Search strategy picks the broadest query level based on what's missing. Import mapping splits pack downloads into individual items via filename parsing.

**Tech Stack:** TypeScript, Bun test runner, regex-based title parsing

**Spec:** `docs/superpowers/specs/2026-03-28-pack-preference-and-multi-pack-design.md`

---

## File Structure

| File                                              | Action | Responsibility                                                              |
| ------------------------------------------------- | ------ | --------------------------------------------------------------------------- |
| `src/server/indexers/types.ts`                    | Modify | Add ReleaseType enum, ParsedPackInfo type, extend IndexerRelease            |
| `src/server/indexers/release-type-parser.ts`      | Create | Release type detection from title parsing — all content types               |
| `src/server/indexers/release-type-parser.test.ts` | Create | Unit tests for release type detection                                       |
| `src/server/indexers/format-parser.ts`            | Modify | Call detectReleaseType in enrichRelease                                     |
| `src/server/indexers.ts`                          | Modify | Update sort comparator, add pack qualification to findBestReleaseForProfile |
| `src/server/auto-search.ts`                       | Modify | Add pack-level search functions, refactor search orchestration              |
| `src/server/import-mapping.ts`                    | Create | Map pack download files to individual DB items via filename parsing         |
| `src/server/import-mapping.test.ts`               | Create | Unit tests for import mapping                                               |
| `src/server/file-import.ts`                       | Modify | Integrate import mapping for pack downloads                                 |

---

### Task 1: Add ReleaseType Enum and Types

**Files:**

- Modify: `src/server/indexers/types.ts`

- [ ] **Step 1: Add ReleaseType enum and ParsedPackInfo type**

Add after the existing `ReleaseRejection` type (around line 67):

```typescript
export const ReleaseType = {
  Unknown: 0,
  // TV Shows
  SingleEpisode: 1,
  MultiEpisode: 2,
  SeasonPack: 3,
  MultiSeasonPack: 4,
  // Books
  SingleBook: 10,
  AuthorPack: 11,
  // Manga
  SingleChapter: 20,
  MultiChapter: 21,
  SingleVolume: 22,
  MultiVolume: 23,
} as const;

export type ReleaseType = (typeof ReleaseType)[keyof typeof ReleaseType];

export type ParsedPackInfo = {
  seasons?: number[];
  episodes?: number[];
  volumes?: number[];
  chapters?: number[];
};
```

- [ ] **Step 2: Extend IndexerRelease type**

Add two new fields to the `IndexerRelease` type (around line 84):

```typescript
releaseType: ReleaseType;
packInfo: ParsedPackInfo | null;
```

- [ ] **Step 3: Verify build**

Run: `bun run build`
Expected: Type errors in files that construct IndexerRelease (format-parser.ts enrichRelease). That's expected — we'll fix it in Task 5.

- [ ] **Step 4: Commit**

```bash
git add src/server/indexers/types.ts
git commit -m "feat: add ReleaseType enum, ParsedPackInfo, and IndexerRelease fields"
```

---

### Task 2: TV Show Release Type Parser

**Files:**

- Create: `src/server/indexers/release-type-parser.ts`
- Create: `src/server/indexers/release-type-parser.test.ts`

- [ ] **Step 1: Write failing tests for TV show detection**

Create `src/server/indexers/release-type-parser.test.ts`:

```typescript
import { describe, expect, test } from "bun:test";
import { detectReleaseType } from "./release-type-parser";
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test src/server/indexers/release-type-parser.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement TV show detection**

Create `src/server/indexers/release-type-parser.ts`:

```typescript
import { ReleaseType, type ParsedPackInfo } from "./types";

type ContentType = "tv" | "book" | "manga";

type DetectionResult = {
  releaseType: ReleaseType;
  packInfo: ParsedPackInfo | null;
};

// TV patterns — ordered from most specific to least specific
const TV_MULTI_SEASON_RANGE = /S(\d{1,2})\s*-\s*S(\d{1,2})/i;
const TV_COMPLETE_SERIES = /\bcomplete\s+series\b/i;
const TV_MULTI_EPISODE_RANGE = /S(\d{1,2})E(\d{1,3})\s*-\s*E(\d{1,3})/i;
const TV_MULTI_EPISODE_CONCAT = /S(\d{1,2})((?:E\d{1,3}){2,})/i;
const TV_SINGLE_EPISODE = /S(\d{1,2})E(\d{1,3})/i;
const TV_SEASON_ONLY = /(?:^|[\s._-])S(\d{1,2})(?:[\s._-]|$)/i;
const TV_SEASON_WORD = /\b(?:Season|Saison|Series|Stagione)\s*(\d{1,2})\b/i;
const TV_DAILY = /\b\d{4}[._-]\d{2}[._-]\d{2}\b/;

function expandRange(start: number, end: number): number[] {
  const result: number[] = [];
  for (let i = start; i <= end; i++) result.push(i);
  return result;
}

function detectTvReleaseType(title: string): DetectionResult {
  // Multi-season range: S01-S03
  const multiSeasonMatch = title.match(TV_MULTI_SEASON_RANGE);
  if (multiSeasonMatch) {
    const start = parseInt(multiSeasonMatch[1]);
    const end = parseInt(multiSeasonMatch[2]);
    return {
      releaseType: ReleaseType.MultiSeasonPack,
      packInfo: { seasons: expandRange(start, end) },
    };
  }

  // Complete series (no specific seasons known)
  if (TV_COMPLETE_SERIES.test(title)) {
    return {
      releaseType: ReleaseType.MultiSeasonPack,
      packInfo: { seasons: [] },
    };
  }

  // Multi-episode range: S01E01-E03
  const multiEpRangeMatch = title.match(TV_MULTI_EPISODE_RANGE);
  if (multiEpRangeMatch) {
    const season = parseInt(multiEpRangeMatch[1]);
    const epStart = parseInt(multiEpRangeMatch[2]);
    const epEnd = parseInt(multiEpRangeMatch[3]);
    return {
      releaseType: ReleaseType.MultiEpisode,
      packInfo: { seasons: [season], episodes: expandRange(epStart, epEnd) },
    };
  }

  // Multi-episode concatenated: S01E01E02E03
  const multiEpConcatMatch = title.match(TV_MULTI_EPISODE_CONCAT);
  if (multiEpConcatMatch) {
    const season = parseInt(multiEpConcatMatch[1]);
    const epPart = multiEpConcatMatch[2];
    const episodes = [...epPart.matchAll(/E(\d{1,3})/gi)].map((m) =>
      parseInt(m[1]),
    );
    return {
      releaseType: ReleaseType.MultiEpisode,
      packInfo: { seasons: [season], episodes },
    };
  }

  // Single episode: S01E01 (must come after multi-episode checks)
  if (TV_SINGLE_EPISODE.test(title)) {
    return { releaseType: ReleaseType.SingleEpisode, packInfo: null };
  }

  // Daily show: 2024.03.15
  if (TV_DAILY.test(title)) {
    return { releaseType: ReleaseType.SingleEpisode, packInfo: null };
  }

  // Season only: S01 (no episode number)
  const seasonOnlyMatch = title.match(TV_SEASON_ONLY);
  if (seasonOnlyMatch) {
    return {
      releaseType: ReleaseType.SeasonPack,
      packInfo: { seasons: [parseInt(seasonOnlyMatch[1])] },
    };
  }

  // Season word: "Season 2"
  const seasonWordMatch = title.match(TV_SEASON_WORD);
  if (seasonWordMatch) {
    return {
      releaseType: ReleaseType.SeasonPack,
      packInfo: { seasons: [parseInt(seasonWordMatch[1])] },
    };
  }

  return { releaseType: ReleaseType.Unknown, packInfo: null };
}

export function detectReleaseType(
  title: string,
  contentType: ContentType,
): DetectionResult {
  switch (contentType) {
    case "tv":
      return detectTvReleaseType(title);
    case "book":
      return { releaseType: ReleaseType.Unknown, packInfo: null }; // Task 3
    case "manga":
      return { releaseType: ReleaseType.Unknown, packInfo: null }; // Task 4
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test src/server/indexers/release-type-parser.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/server/indexers/release-type-parser.ts src/server/indexers/release-type-parser.test.ts
git commit -m "feat: add TV show release type parser with tests"
```

---

### Task 3: Book Release Type Parser

**Files:**

- Modify: `src/server/indexers/release-type-parser.ts`
- Modify: `src/server/indexers/release-type-parser.test.ts`

- [ ] **Step 1: Write failing tests for book detection**

Add to `release-type-parser.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test src/server/indexers/release-type-parser.test.ts`
Expected: Book tests FAIL (returns Unknown)

- [ ] **Step 3: Implement book detection**

Add to `release-type-parser.ts`:

```typescript
const BOOK_COMPLETE = /\bcomplete\s+(?:collection|works|series)\b/i;
const BOOK_COLLECTION = /\b(?:collection|anthology|omnibus)\b/i;
const BOOK_N_BOOKS = /\(\d+\s+books?\)/i;
const BOOK_SERIES = /\bseries\b/i;

function detectBookReleaseType(title: string): DetectionResult {
  if (
    BOOK_COMPLETE.test(title) ||
    BOOK_COLLECTION.test(title) ||
    BOOK_N_BOOKS.test(title) ||
    BOOK_SERIES.test(title)
  ) {
    return { releaseType: ReleaseType.AuthorPack, packInfo: {} };
  }

  return { releaseType: ReleaseType.SingleBook, packInfo: null };
}
```

Update the `detectReleaseType` switch case for `"book"` to call `detectBookReleaseType(title)`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test src/server/indexers/release-type-parser.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/server/indexers/release-type-parser.ts src/server/indexers/release-type-parser.test.ts
git commit -m "feat: add book release type parser with tests"
```

---

### Task 4: Manga Release Type Parser

**Files:**

- Modify: `src/server/indexers/release-type-parser.ts`
- Modify: `src/server/indexers/release-type-parser.test.ts`

- [ ] **Step 1: Write failing tests for manga detection**

Add to `release-type-parser.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test src/server/indexers/release-type-parser.test.ts`
Expected: Manga tests FAIL (returns Unknown)

- [ ] **Step 3: Implement manga detection**

Add to `release-type-parser.ts`:

```typescript
// Manga patterns — volume ranges first, then single volumes, then chapter ranges, then single chapters
const MANGA_MULTI_VOLUME =
  /\b(?:Vol(?:ume)?s?|v)\.?\s*(\d+)\s*-\s*(?:Vol(?:ume)?s?|v)?\.?\s*(\d+)/i;
const MANGA_SINGLE_VOLUME = /\b(?:Vol(?:ume)?|v)\.?\s*(\d+)\b/i;
const MANGA_MULTI_CHAPTER =
  /\b(?:Ch(?:apter)?s?|c)\.?\s*(\d+)\s*-\s*(?:Ch(?:apter)?s?|c)?\.?\s*(\d+)/i;
const MANGA_SINGLE_CHAPTER = /\b(?:Ch(?:apter)?|c)\.?\s*(\d+)\b/i;

function detectMangaReleaseType(title: string): DetectionResult {
  const hasMultiVolume = title.match(MANGA_MULTI_VOLUME);
  const hasSingleVolume = !hasMultiVolume && title.match(MANGA_SINGLE_VOLUME);
  const hasMultiChapter = title.match(MANGA_MULTI_CHAPTER);
  const hasSingleChapter =
    !hasMultiChapter && title.match(MANGA_SINGLE_CHAPTER);

  // Multi-volume: Vol 01-10
  if (hasMultiVolume) {
    const start = parseInt(hasMultiVolume[1]);
    const end = parseInt(hasMultiVolume[2]);
    return {
      releaseType: ReleaseType.MultiVolume,
      packInfo: { volumes: expandRange(start, end) },
    };
  }

  // If both volume and chapter present (Vol 05 Ch 040), it's a single chapter release
  if (hasSingleVolume && (hasMultiChapter || hasSingleChapter)) {
    if (hasMultiChapter) {
      const start = parseInt(hasMultiChapter[1]);
      const end = parseInt(hasMultiChapter[2]);
      return {
        releaseType: ReleaseType.MultiChapter,
        packInfo: { chapters: expandRange(start, end) },
      };
    }
    return { releaseType: ReleaseType.SingleChapter, packInfo: null };
  }

  // Single volume (no chapter marker)
  if (hasSingleVolume) {
    return {
      releaseType: ReleaseType.SingleVolume,
      packInfo: { volumes: [parseInt(hasSingleVolume[1])] },
    };
  }

  // Multi-chapter: Ch 040-045
  if (hasMultiChapter) {
    const start = parseInt(hasMultiChapter[1]);
    const end = parseInt(hasMultiChapter[2]);
    return {
      releaseType: ReleaseType.MultiChapter,
      packInfo: { chapters: expandRange(start, end) },
    };
  }

  // Single chapter: Ch 040
  if (hasSingleChapter) {
    return { releaseType: ReleaseType.SingleChapter, packInfo: null };
  }

  return { releaseType: ReleaseType.Unknown, packInfo: null };
}
```

Update the `detectReleaseType` switch case for `"manga"` to call `detectMangaReleaseType(title)`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test src/server/indexers/release-type-parser.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/server/indexers/release-type-parser.ts src/server/indexers/release-type-parser.test.ts
git commit -m "feat: add manga release type parser with tests"
```

---

### Task 5: Integrate Parser into enrichRelease

**Files:**

- Modify: `src/server/indexers/format-parser.ts`

- [ ] **Step 1: Import detectReleaseType and update enrichRelease**

In `format-parser.ts`, add the import:

```typescript
import { detectReleaseType } from "./release-type-parser";
import { ReleaseType as ReleaseTypeEnum } from "./types";
```

In `enrichRelease()` (around line 278), after computing `quality`, `sizeFormatted`, and `ageFormatted`, add release type detection. The `enrichRelease` function needs a `contentType` parameter to know which parser to use.

Update the function signature to accept a `contentType` parameter:

```typescript
export function enrichRelease(
  raw: CoalescedResult & { allstarrIndexerId: number; indexerSource: "manual" | "synced" },
  contentType: "tv" | "book" | "manga" = "book",
): IndexerRelease {
```

After computing quality (the `matchFormat()` call), add:

```typescript
const { releaseType, packInfo } = detectReleaseType(raw.title, contentType);
```

Include in the returned object:

```typescript
releaseType,
packInfo,
```

- [ ] **Step 2: Update all callsites of enrichRelease to pass contentType**

Search for all calls to `enrichRelease` in the codebase. They are in `src/server/indexers/http.ts` inside `searchNewznab`. The contentType needs to be threaded through from the search call.

Add `contentType` parameter to `searchNewznab`:

```typescript
export async function searchNewznab(
  feed: NewznabFeedConfig,
  query: string,
  categories: number[],
  bookParams?: BookSearchParams,
  indexerIdentity?: { indexerType: string; indexerId: number },
  contentType: "tv" | "book" | "manga" = "book",
): Promise<IndexerRelease[]>;
```

Pass it through to `enrichRelease`:

```typescript
enrichRelease({ ...result, allstarrIndexerId: ..., indexerSource: ... }, contentType)
```

Update callers of `searchNewznab` in `src/server/indexers.ts` (`searchAllIndexers` and `searchIndexersFn`) to accept and forward `contentType`.

- [ ] **Step 3: Verify build**

Run: `bun run build`
Expected: PASS — all types satisfied

- [ ] **Step 4: Commit**

```bash
git add src/server/indexers/format-parser.ts src/server/indexers/http.ts src/server/indexers.ts
git commit -m "feat: integrate release type detection into enrichRelease pipeline"
```

---

### Task 6: Update Scoring Comparator

**Files:**

- Modify: `src/server/indexers.ts`

- [ ] **Step 1: Add getReleaseTypeRank helper**

Add near the top of `indexers.ts` (after imports):

```typescript
import { ReleaseType } from "./indexers/types";

function getReleaseTypeRank(releaseType: ReleaseType): number {
  switch (releaseType) {
    case ReleaseType.MultiSeasonPack:
    case ReleaseType.MultiVolume:
      return 4;
    case ReleaseType.SeasonPack:
    case ReleaseType.SingleVolume:
      return 3;
    case ReleaseType.MultiEpisode:
    case ReleaseType.MultiChapter:
    case ReleaseType.AuthorPack:
      return 2;
    case ReleaseType.SingleEpisode:
    case ReleaseType.SingleChapter:
    case ReleaseType.SingleBook:
      return 1;
    default:
      return 0;
  }
}
```

- [ ] **Step 2: Update the sort comparator in dedupeAndScoreReleases**

Find the sort block (around line 657). Replace:

```typescript
relevant.sort((a, b) => {
  const qualityDiff = b.quality.weight - a.quality.weight;
  if (qualityDiff !== 0) return qualityDiff;
  const cfDiff = b.cfScore - a.cfScore;
  if (cfDiff !== 0) return cfDiff;
  return b.size - a.size;
});
```

With:

```typescript
relevant.sort((a, b) => {
  const qualityDiff = b.quality.weight - a.quality.weight;
  if (qualityDiff !== 0) return qualityDiff;
  const cfDiff = b.cfScore - a.cfScore;
  if (cfDiff !== 0) return cfDiff;
  const typeDiff =
    getReleaseTypeRank(b.releaseType) - getReleaseTypeRank(a.releaseType);
  if (typeDiff !== 0) return typeDiff;
  return b.size - a.size;
});
```

> **Note:** The spec also lists protocol preference, indexer priority, and seeds/age as new scoring factors. These are general scoring improvements not specific to pack support. They can be added in a follow-up — the pack feature works correctly without them.

- [ ] **Step 3: Verify build**

Run: `bun run build`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/server/indexers.ts
git commit -m "feat: add release type rank to scoring comparator"
```

---

### Task 7: Pack Qualification Logic

**Files:**

- Modify: `src/server/indexers.ts`

This task adds qualification checking so that packs are only grabbed when their contents are actually wanted.

- [ ] **Step 1: Define PackContext type**

Add near existing types in `indexers.ts`:

```typescript
export type PackContext = {
  /** Season number → set of wanted episode numbers in that season */
  wantedEpisodesBySeason?: Map<number, Set<number>>;
  /** Set of wanted book IDs */
  wantedBookIds?: Set<number>;
  /** Volume number → set of wanted chapter numbers in that volume */
  wantedChaptersByVolume?: Map<number, Set<number>>;
  /** Total number of wanted items (used for "Complete Series" packs with no specific seasons) */
  totalWantedSeasons?: number;
};
```

- [ ] **Step 2: Add isPackQualified helper**

```typescript
function isPackQualified(
  release: IndexerRelease,
  packContext: PackContext | null,
): boolean {
  // Non-pack releases are always qualified
  const rank = getReleaseTypeRank(release.releaseType);
  if (rank <= 1) return true;

  // No context means we can't qualify packs (auto-search always provides context)
  if (!packContext) return true;

  const info = release.packInfo;
  if (!info) return true;

  switch (release.releaseType) {
    case ReleaseType.MultiSeasonPack: {
      if (!packContext.wantedEpisodesBySeason) return false;
      // "Complete Series" with no specific seasons — qualify if we have wanted seasons
      if (!info.seasons || info.seasons.length === 0) {
        return (packContext.totalWantedSeasons ?? 0) > 0;
      }
      // Every season in the pack must have at least one wanted episode
      return info.seasons.every(
        (s) => (packContext.wantedEpisodesBySeason!.get(s)?.size ?? 0) > 0,
      );
    }

    case ReleaseType.SeasonPack: {
      if (!packContext.wantedEpisodesBySeason || !info.seasons?.[0])
        return false;
      // At least 2 episodes in this season must be wanted
      const wanted = packContext.wantedEpisodesBySeason.get(info.seasons[0]);
      return (wanted?.size ?? 0) >= 2;
    }

    case ReleaseType.MultiEpisode: {
      if (
        !packContext.wantedEpisodesBySeason ||
        !info.episodes ||
        !info.seasons?.[0]
      )
        return false;
      const wanted = packContext.wantedEpisodesBySeason.get(info.seasons[0]);
      if (!wanted) return false;
      // Every episode in the pack must be wanted
      return info.episodes.every((ep) => wanted.has(ep));
    }

    case ReleaseType.AuthorPack: {
      if (!packContext.wantedBookIds) return false;
      // Author packs qualify if there are wanted books (we can't verify exact contents from title)
      return packContext.wantedBookIds.size > 0;
    }

    case ReleaseType.MultiVolume: {
      if (!packContext.wantedChaptersByVolume || !info.volumes) return false;
      // Every volume in the pack must have at least one wanted chapter
      return info.volumes.every(
        (v) => (packContext.wantedChaptersByVolume!.get(v)?.size ?? 0) > 0,
      );
    }

    case ReleaseType.SingleVolume: {
      if (!packContext.wantedChaptersByVolume || !info.volumes?.[0])
        return false;
      // At least 2 chapters in this volume must be wanted
      const wanted = packContext.wantedChaptersByVolume.get(info.volumes[0]);
      return (wanted?.size ?? 0) >= 2;
    }

    case ReleaseType.MultiChapter: {
      if (!packContext.wantedChaptersByVolume || !info.chapters) return false;
      // Every chapter must be wanted (check across all volumes)
      const allWanted = new Set<number>();
      for (const chSet of packContext.wantedChaptersByVolume.values()) {
        for (const ch of chSet) allWanted.add(ch);
      }
      return info.chapters.every((ch) => allWanted.has(ch));
    }

    default:
      return true;
  }
}
```

- [ ] **Step 3: Integrate into findBestReleaseForProfile**

Update `findBestReleaseForProfile` signature to accept optional `packContext`:

```typescript
export function findBestReleaseForProfile(
  releases: IndexerRelease[],
  profile: ProfileInfo,
  bestExistingWeight: number,
  blocklistedTitles: Set<string>,
  grabbedGuids: Set<string>,
  bestExistingCFScore = 0,
  packContext: PackContext | null = null,
): IndexerRelease | null;
```

In the candidate filtering loop, add a pack qualification check after the existing blocklist check:

```typescript
// Skip disqualified packs
if (!isPackQualified(release, packContext)) continue;
```

- [ ] **Step 4: Verify build**

Run: `bun run build`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/server/indexers.ts
git commit -m "feat: add pack qualification logic to findBestReleaseForProfile"
```

---

### Task 8: Pack-Aware Search for TV Shows

**Files:**

- Modify: `src/server/auto-search.ts`

This task refactors the episode search orchestration to group wanted episodes and search at the broadest applicable level.

- [ ] **Step 1: Add searchAndGrabForSeason function**

This function searches at the season level (query: `"show name" S##`) and can grab season packs or individual episodes from the results.

```typescript
async function searchAndGrabForSeason(
  show: { id: number; title: string },
  seasonNumber: number,
  wantedEpisodes: WantedEpisode[],
  allWantedBySeason: Map<number, WantedEpisode[]>,
  ixs: EnabledIndexers,
): Promise<SearchDetail> {
  const query = `"${cleanQueryTitle(show.title)}" S${String(seasonNumber).padStart(2, "0")}`;
  const categories = deriveCategories(wantedEpisodes[0]);

  const allReleases = await searchAllIndexers(
    ixs,
    query,
    categories,
    undefined,
    "tv",
  );
  if (allReleases.length === 0) return { searched: true, grabbed: false };

  // Build pack context for qualification
  const wantedEpisodesBySeason = new Map<number, Set<number>>();
  for (const [sNum, eps] of allWantedBySeason) {
    wantedEpisodesBySeason.set(sNum, new Set(eps.map((e) => e.episodeNumber)));
  }
  const packContext: PackContext = { wantedEpisodesBySeason };

  const scored = dedupeAndScoreReleases(allReleases, null, {
    title: show.title,
    authorName: null,
  });

  return grabPerProfileForEpisodes(scored, wantedEpisodes, packContext);
}
```

- [ ] **Step 2: Add searchAndGrabForShow function**

Searches at the show level (query: just show name) for multi-season packs.

```typescript
async function searchAndGrabForShow(
  show: { id: number; title: string },
  wantedBySeason: Map<number, WantedEpisode[]>,
  ixs: EnabledIndexers,
): Promise<SearchDetail> {
  const query = `"${cleanQueryTitle(show.title)}"`;
  const firstEpisode = [...wantedBySeason.values()][0]?.[0];
  if (!firstEpisode) return { searched: false, grabbed: false };
  const categories = deriveCategories(firstEpisode);

  const allReleases = await searchAllIndexers(
    ixs,
    query,
    categories,
    undefined,
    "tv",
  );
  if (allReleases.length === 0) return { searched: true, grabbed: false };

  const wantedEpisodesBySeason = new Map<number, Set<number>>();
  for (const [sNum, eps] of wantedBySeason) {
    wantedEpisodesBySeason.set(sNum, new Set(eps.map((e) => e.episodeNumber)));
  }
  const packContext: PackContext = {
    wantedEpisodesBySeason,
    totalWantedSeasons: wantedBySeason.size,
  };

  const allWantedEpisodes = [...wantedBySeason.values()].flat();
  const scored = dedupeAndScoreReleases(allReleases, null, {
    title: show.title,
    authorName: null,
  });

  return grabPerProfileForEpisodes(scored, allWantedEpisodes, packContext);
}
```

- [ ] **Step 3: Refactor episode search orchestration in runAutoSearch**

Find where `getWantedEpisodes()` results are iterated (the episode search loop). Replace the per-episode iteration with grouped logic:

```typescript
// Group wanted episodes by show and season
const episodesByShow = new Map<number, Map<number, WantedEpisode[]>>();
for (const ep of wantedEpisodes) {
  if (!episodesByShow.has(ep.showId)) episodesByShow.set(ep.showId, new Map());
  const showMap = episodesByShow.get(ep.showId)!;
  if (!showMap.has(ep.seasonNumber)) showMap.set(ep.seasonNumber, []);
  showMap.get(ep.seasonNumber)!.push(ep);
}

for (const [showId, seasonMap] of episodesByShow) {
  const show = {
    id: showId,
    title: seasonMap.values().next().value![0].showTitle,
  };

  // Multiple seasons with missing episodes → show-level search
  if (seasonMap.size > 1) {
    const result = await searchAndGrabForShow(show, seasonMap, ixs);
    if (result.grabbed) continue; // Pack grabbed, skip individual searches
  }

  // Per-season: 2+ missing episodes → season-level search
  for (const [seasonNumber, episodes] of seasonMap) {
    if (episodes.length >= 2) {
      const result = await searchAndGrabForSeason(
        show,
        seasonNumber,
        episodes,
        seasonMap,
        ixs,
      );
      if (result.grabbed) continue;
    }

    // Fallback to individual episode search
    for (const ep of episodes) {
      await searchAndGrabForEpisode(ep, ixs);
    }
  }
}
```

- [ ] **Step 3b: Add grabPerProfileForEpisodes helper**

This adapts the existing `grabPerProfile` pattern for episodes. It iterates each episode's profiles, finds the best release (with pack context), and grabs it:

```typescript
async function grabPerProfileForEpisodes(
  scored: IndexerRelease[],
  wantedEpisodes: WantedEpisode[],
  packContext: PackContext,
): Promise<SearchDetail> {
  const grabbedGuids = new Set<string>();
  let grabbed = false;

  for (const ep of wantedEpisodes) {
    for (const profile of ep.profiles) {
      const best = findBestReleaseForProfile(
        scored,
        profile,
        ep.bestExistingWeight,
        ep.blocklistedTitles,
        grabbedGuids,
        ep.bestExistingCFScore,
        packContext,
      );
      if (!best) continue;

      // For pack releases, set parent IDs only (episodeId left null)
      const isPack = getReleaseTypeRank(best.releaseType) >= 2;
      const result = await grabRelease(best, {
        showId: ep.showId,
        episodeId: isPack ? undefined : ep.episodeId,
        downloadProfileId: profile.id,
      });
      if (result) {
        grabbedGuids.add(best.guid);
        grabbed = true;
      }
    }
  }

  return { searched: true, grabbed };
}
```

- [ ] **Step 4: Verify build**

Run: `bun run build`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/server/auto-search.ts
git commit -m "feat: add pack-aware search orchestration for TV shows"
```

---

### Task 9: Pack-Aware Search for Books

**Files:**

- Modify: `src/server/auto-search.ts`

- [ ] **Step 1: Add searchAndGrabForAuthor function**

```typescript
async function searchAndGrabForAuthor(
  authorName: string,
  wantedBooks: WantedBook[],
  ixs: EnabledIndexers,
): Promise<SearchDetail> {
  const query = `"${cleanQueryTitle(authorName)}"`;
  const categories = deriveCategories(wantedBooks[0]);

  const allReleases = await searchAllIndexers(
    ixs,
    query,
    categories,
    undefined,
    "book",
  );
  if (allReleases.length === 0) return { searched: true, grabbed: false };

  const packContext: PackContext = {
    wantedBookIds: new Set(wantedBooks.map((b) => b.bookId)),
  };

  const scored = dedupeAndScoreReleases(allReleases, null, {
    title: "",
    authorName,
  });

  // Try to grab for each book's profiles, passing pack context
  let grabbed = false;
  for (const book of wantedBooks) {
    const result = await grabPerProfile(scored, book, packContext);
    if (result.grabbed) grabbed = true;
  }

  return { searched: true, grabbed };
}
```

- [ ] **Step 2: Refactor book search orchestration**

In the book search section of `runAutoSearch`, group wanted books by author:

```typescript
// Group wanted books by primary author
const booksByAuthor = new Map<string, WantedBook[]>();
for (const book of wantedBooks) {
  const key = book.authorName ?? "__no_author__";
  if (!booksByAuthor.has(key)) booksByAuthor.set(key, []);
  booksByAuthor.get(key)!.push(book);
}

for (const [authorName, books] of booksByAuthor) {
  // Multiple books by same author → author-level search
  if (books.length >= 2 && authorName !== "__no_author__") {
    const result = await searchAndGrabForAuthor(authorName, books, ixs);
    if (result.grabbed) continue;
  }

  // Fallback to individual book search
  for (const book of books) {
    await searchAndGrabForBook(book, ixs);
  }
}
```

- [ ] **Step 3: Thread packContext through existing grabPerProfile**

Update `grabPerProfile` to accept and forward `packContext`:

```typescript
async function grabPerProfile(
  scored: IndexerRelease[],
  book: WantedBook,
  packContext: PackContext | null = null,
): Promise<{ grabbed: boolean; releaseTitle?: string }>;
```

Pass `packContext` to `findBestReleaseForProfile` calls within.

- [ ] **Step 4: Verify build**

Run: `bun run build`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/server/auto-search.ts
git commit -m "feat: add pack-aware search orchestration for books"
```

---

### Task 10: Pack-Aware Search for Manga

**Files:**

- Modify: `src/server/auto-search.ts`

- [ ] **Step 1: Add searchAndGrabForMangaVolume function**

```typescript
async function searchAndGrabForMangaVolume(
  mangaTitle: string,
  volumeNumber: number,
  wantedChapters: WantedManga[],
  allWantedByVolume: Map<number, WantedManga[]>,
  ixs: EnabledIndexers,
): Promise<SearchDetail> {
  const query = `"${cleanQueryTitle(mangaTitle)}" Vol ${volumeNumber}`;
  const categories = deriveCategories(wantedChapters[0]);

  const allReleases = await searchAllIndexers(
    ixs,
    query,
    categories,
    undefined,
    "manga",
  );
  if (allReleases.length === 0) return { searched: true, grabbed: false };

  const wantedChaptersByVolume = new Map<number, Set<number>>();
  for (const [vNum, chs] of allWantedByVolume) {
    wantedChaptersByVolume.set(vNum, new Set(chs.map((c) => c.chapterNumber)));
  }
  const packContext: PackContext = { wantedChaptersByVolume };

  const scored = dedupeAndScoreReleases(allReleases, null, {
    title: mangaTitle,
    authorName: null,
  });

  return grabPerProfileForManga(scored, wantedChapters, packContext);
}
```

- [ ] **Step 2: Add searchAndGrabForMangaSeries function**

```typescript
async function searchAndGrabForMangaSeries(
  mangaTitle: string,
  wantedByVolume: Map<number, WantedManga[]>,
  ixs: EnabledIndexers,
): Promise<SearchDetail> {
  const query = `"${cleanQueryTitle(mangaTitle)}"`;
  const firstChapter = [...wantedByVolume.values()][0]?.[0];
  if (!firstChapter) return { searched: false, grabbed: false };
  const categories = deriveCategories(firstChapter);

  const allReleases = await searchAllIndexers(
    ixs,
    query,
    categories,
    undefined,
    "manga",
  );
  if (allReleases.length === 0) return { searched: true, grabbed: false };

  const wantedChaptersByVolume = new Map<number, Set<number>>();
  for (const [vNum, chs] of wantedByVolume) {
    wantedChaptersByVolume.set(vNum, new Set(chs.map((c) => c.chapterNumber)));
  }
  const packContext: PackContext = { wantedChaptersByVolume };

  const allWanted = [...wantedByVolume.values()].flat();
  const scored = dedupeAndScoreReleases(allReleases, null, {
    title: mangaTitle,
    authorName: null,
  });

  return grabPerProfileForManga(scored, allWanted, packContext);
}
```

- [ ] **Step 3: Add grabPerProfileForManga helper**

Same pattern as `grabPerProfileForEpisodes`:

```typescript
async function grabPerProfileForManga(
  scored: IndexerRelease[],
  wantedChapters: WantedManga[],
  packContext: PackContext,
): Promise<SearchDetail> {
  const grabbedGuids = new Set<string>();
  let grabbed = false;

  for (const ch of wantedChapters) {
    for (const profile of ch.profiles) {
      const best = findBestReleaseForProfile(
        scored,
        profile,
        ch.bestExistingWeight,
        ch.blocklistedTitles,
        grabbedGuids,
        ch.bestExistingCFScore,
        packContext,
      );
      if (!best) continue;

      const isPack = getReleaseTypeRank(best.releaseType) >= 2;
      const result = await grabRelease(best, {
        mangaId: ch.mangaId,
        mangaChapterId: isPack ? undefined : ch.mangaChapterId,
        downloadProfileId: profile.id,
      });
      if (result) {
        grabbedGuids.add(best.guid);
        grabbed = true;
      }
    }
  }

  return { searched: true, grabbed };
}
```

- [ ] **Step 4: Refactor manga search orchestration**

```typescript
// Group wanted manga by series and volume
const mangaBySeries = new Map<number, Map<number, WantedManga[]>>();
for (const ch of wantedManga) {
  if (!mangaBySeries.has(ch.mangaId)) mangaBySeries.set(ch.mangaId, new Map());
  const seriesMap = mangaBySeries.get(ch.mangaId)!;
  const volNum = ch.volumeNumber ?? 0;
  if (!seriesMap.has(volNum)) seriesMap.set(volNum, []);
  seriesMap.get(volNum)!.push(ch);
}

for (const [mangaId, volumeMap] of mangaBySeries) {
  const mangaTitle = volumeMap.values().next().value![0].mangaTitle;

  // Multiple volumes with missing chapters → series-level search
  if (volumeMap.size > 1) {
    const result = await searchAndGrabForMangaSeries(
      mangaTitle,
      volumeMap,
      ixs,
    );
    if (result.grabbed) continue;
  }

  // Per-volume: 2+ missing chapters → volume-level search
  for (const [volumeNumber, chapters] of volumeMap) {
    if (chapters.length >= 2 && volumeNumber > 0) {
      const result = await searchAndGrabForMangaVolume(
        mangaTitle,
        volumeNumber,
        chapters,
        volumeMap,
        ixs,
      );
      if (result.grabbed) continue;
    }

    // Fallback to individual chapter search
    for (const ch of chapters) {
      await searchAndGrabForManga(ch, ixs);
    }
  }
}
```

- [ ] **Step 5: Verify build**

Run: `bun run build`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/server/auto-search.ts
git commit -m "feat: add pack-aware search orchestration for manga"
```

---

### Task 11: Import Mapping Module

**Files:**

- Create: `src/server/import-mapping.ts`
- Create: `src/server/import-mapping.test.ts`

- [ ] **Step 1: Write failing tests for TV show filename mapping**

Create `src/server/import-mapping.test.ts`:

```typescript
import { describe, expect, test } from "bun:test";
import { mapTvFiles, mapMangaFiles, mapBookFiles } from "./import-mapping";

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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test src/server/import-mapping.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement import mapping functions**

Create `src/server/import-mapping.ts`:

```typescript
import { basename } from "path";

export type MappedTvFile = {
  path: string;
  season: number;
  episode: number;
};

export type MappedMangaFile = {
  path: string;
  volume: number | null;
  chapter: number | null;
};

export type MappedBookFile = {
  path: string;
  extractedTitle: string;
};

const TV_EPISODE_PATTERN = /S(\d{1,2})E(\d{1,3})/i;
const MANGA_VOL_PATTERN = /\b(?:Vol(?:ume)?|v)\.?\s*(\d+)/i;
const MANGA_CH_PATTERN = /\b(?:Ch(?:apter)?|c)\.?\s*(\d+)/i;
const BOOK_AUTHOR_TITLE = /^(.+?)\s*-\s*(.+?)(?:\.\w+)?$/;

export function mapTvFiles(filePaths: string[]): MappedTvFile[] {
  const results: MappedTvFile[] = [];
  for (const filePath of filePaths) {
    const name = basename(filePath);
    const match = name.match(TV_EPISODE_PATTERN);
    if (match) {
      results.push({
        path: filePath,
        season: parseInt(match[1]),
        episode: parseInt(match[2]),
      });
    }
  }
  return results;
}

export function mapMangaFiles(filePaths: string[]): MappedMangaFile[] {
  const results: MappedMangaFile[] = [];
  for (const filePath of filePaths) {
    const name = basename(filePath);
    const volMatch = name.match(MANGA_VOL_PATTERN);
    const chMatch = name.match(MANGA_CH_PATTERN);

    if (volMatch || chMatch) {
      results.push({
        path: filePath,
        volume: volMatch ? parseInt(volMatch[1]) : null,
        chapter: chMatch ? parseInt(chMatch[1]) : null,
      });
    }
  }
  return results;
}

export function mapBookFiles(filePaths: string[]): MappedBookFile[] {
  const results: MappedBookFile[] = [];
  for (const filePath of filePaths) {
    const name = basename(filePath);
    // Strip file extension
    const nameNoExt = name.replace(/\.\w+$/, "");

    const authorTitleMatch = nameNoExt.match(BOOK_AUTHOR_TITLE);
    const extractedTitle = authorTitleMatch
      ? authorTitleMatch[2].trim()
      : nameNoExt;

    results.push({ path: filePath, extractedTitle });
  }
  return results;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test src/server/import-mapping.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/server/import-mapping.ts src/server/import-mapping.test.ts
git commit -m "feat: add import mapping module for pack downloads"
```

---

### Task 12: Integrate Import Mapping into File Import

**Files:**

- Modify: `src/server/file-import.ts`

- [ ] **Step 1: Detect pack downloads in importCompletedDownload**

In `importCompletedDownload` (around line 728), after fetching the tracked download, detect if this is a pack download. A pack download has a parent ID set but no specific item ID:

- Season pack: `showId` is set, `episodeId` is null
- Author pack: `authorId` is set, `bookId` is null
- Manga volume pack: `mangaId` is set, `mangaChapterId` is null

Add branching after the existing content type routing (around line 747):

```typescript
// Pack download detection
const isEpisodePack = td.showId && !td.episodeId;
const isBookPack = td.authorId && !td.bookId;
const isMangaPack = td.mangaId && !td.mangaChapterId;

if (isEpisodePack) {
  await importEpisodePackDownload(td);
  return;
}

if (isBookPack) {
  await importBookPackDownload(td);
  return;
}

if (isMangaPack) {
  await importMangaPackDownload(td);
  return;
}
```

- [ ] **Step 2: Implement importEpisodePackDownload**

```typescript
import { mapTvFiles, mapMangaFiles, mapBookFiles } from "./import-mapping";

async function importEpisodePackDownload(
  td: typeof trackedDownloads.$inferSelect,
): Promise<void> {
  if (!td.outputPath || !td.showId) return;

  // Scan for video files in the download directory
  const files = await scanDirectory(td.outputPath, VIDEO_EXTENSIONS);
  const mapped = mapTvFiles(files);

  // Look up episodes in the database for this show
  const showEpisodes = await db.query.episodes.findMany({
    where: eq(episodes.showId, td.showId),
  });

  for (const mappedFile of mapped) {
    // Find matching episode
    const episode = showEpisodes.find(
      (ep) =>
        ep.episodeNumber === mappedFile.episode &&
        getSeasonNumber(ep.seasonId) === mappedFile.season,
    );
    if (!episode) continue;

    // Check if this file is an upgrade or fills a gap
    const existingFiles = await getExistingEpisodeFiles(episode.id);
    if (shouldSkipImport(existingFiles, td)) continue;

    // Import the file using existing import logic
    await importFileForEpisode(mappedFile.path, episode, td);
  }

  // Mark tracked download as imported
  await updateTrackedDownloadState(td.id, "imported");
}
```

- [ ] **Step 3: Implement importBookPackDownload**

```typescript
async function importBookPackDownload(
  td: typeof trackedDownloads.$inferSelect,
): Promise<void> {
  if (!td.outputPath || !td.authorId) return;

  const files = await scanDirectory(td.outputPath, BOOK_EXTENSIONS);
  const mapped = mapBookFiles(files);

  // Look up books for this author
  const authorBooks = await db.query.books.findMany({
    with: { booksAuthors: true },
    where: exists(
      db
        .select()
        .from(booksAuthors)
        .where(
          and(
            eq(booksAuthors.bookId, books.id),
            eq(booksAuthors.authorId, td.authorId),
          ),
        ),
    ),
  });

  for (const mappedFile of mapped) {
    // Fuzzy match extracted title against known book titles
    const bestMatch = findBestBookMatch(mappedFile.extractedTitle, authorBooks);
    if (!bestMatch) continue;

    const existingFiles = await getExistingBookFiles(bestMatch.id);
    if (shouldSkipImport(existingFiles, td)) continue;

    await importFileForBook(mappedFile.path, bestMatch, td);
  }

  await updateTrackedDownloadState(td.id, "imported");
}
```

- [ ] **Step 4: Implement importMangaPackDownload**

```typescript
async function importMangaPackDownload(
  td: typeof trackedDownloads.$inferSelect,
): Promise<void> {
  if (!td.outputPath || !td.mangaId) return;

  const files = await scanDirectory(td.outputPath, MANGA_EXTENSIONS);
  const mapped = mapMangaFiles(files);

  const chapters = await db.query.mangaChapters.findMany({
    where: eq(mangaChapters.mangaId, td.mangaId),
    with: { mangaVolume: true },
  });

  for (const mappedFile of mapped) {
    // Match by chapter number, optionally by volume
    const chapter = chapters.find((ch) => {
      const chNum = parseFloat(ch.chapterNumber);
      if (mappedFile.chapter !== null && chNum === mappedFile.chapter) {
        if (mappedFile.volume !== null) {
          return ch.mangaVolume?.volumeNumber === mappedFile.volume;
        }
        return true;
      }
      // Volume-only files: match all chapters in that volume
      if (mappedFile.chapter === null && mappedFile.volume !== null) {
        return ch.mangaVolume?.volumeNumber === mappedFile.volume;
      }
      return false;
    });
    if (!chapter) continue;

    const existingFiles = await getExistingMangaFiles(chapter.id);
    if (shouldSkipImport(existingFiles, td)) continue;

    await importFileForMangaChapter(mappedFile.path, chapter, td);
  }

  await updateTrackedDownloadState(td.id, "imported");
}
```

Note: The `importFileForEpisode`, `importFileForBook`, `importFileForMangaChapter`, `shouldSkipImport`, `scanDirectory`, and `findBestBookMatch` helpers should be extracted from existing import logic or created as thin wrappers around it. The exact implementation depends on the current helper structure in `file-import.ts` — reuse as much existing code as possible.

- [ ] **Step 5: Verify build**

Run: `bun run build`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/server/file-import.ts
git commit -m "feat: integrate import mapping for pack downloads"
```

---

### Task 13: Update Tracked Download Creation for Packs

**Files:**

- Modify: `src/server/auto-search.ts`

When a pack is grabbed, the tracked download must reference the parent entity (show, author, manga) instead of a specific item.

- [ ] **Step 1: Update grabRelease calls for pack grabs**

In the pack-level search functions (`searchAndGrabForShow`, `searchAndGrabForSeason`, `searchAndGrabForAuthor`, `searchAndGrabForMangaSeries`, `searchAndGrabForMangaVolume`), when calling `grabRelease()`, pass the parent entity IDs instead of individual item IDs.

For TV packs:

```typescript
// Instead of: { episodeId: ep.id, showId: show.id }
// Use:        { showId: show.id }  (episodeId left null)
```

For author packs:

```typescript
// Instead of: { bookId: book.id, authorId: author.id }
// Use:        { authorId: author.id }  (bookId left null)
```

For manga packs:

```typescript
// Instead of: { mangaChapterId: ch.id, mangaId: manga.id }
// Use:        { mangaId: manga.id }  (mangaChapterId left null)
```

- [ ] **Step 2: Verify the tracked_downloads schema allows null content IDs**

Check that `bookId`, `episodeId`, and `mangaChapterId` columns are nullable (they already are based on schema — they use `references` without `notNull`). No schema change needed.

- [ ] **Step 3: Verify build**

Run: `bun run build`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/server/auto-search.ts
git commit -m "feat: store parent entity IDs for pack tracked downloads"
```

---

### Task 14: End-to-End Verification

**Files:** None (testing only)

- [ ] **Step 1: Run all unit tests**

Run: `bun test`
Expected: All tests PASS

- [ ] **Step 2: Run production build**

Run: `bun run build`
Expected: PASS with no type errors

- [ ] **Step 3: Manual verification checklist**

Start dev server (`bun run dev`) and verify:

- [ ] Interactive search for a TV show returns results with `releaseType` populated
- [ ] Interactive search for a book returns results with `releaseType` populated
- [ ] Interactive search for manga returns results with `releaseType` populated
- [ ] Season packs appear ranked above individual episodes at equal quality
- [ ] Auto-search groups wanted episodes and uses broader queries

- [ ] **Step 4: Final commit (if any fixes needed)**

```bash
git add -A
git commit -m "fix: address issues found during e2e verification"
```
