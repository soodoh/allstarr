# Manga Volume Mapping Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix incorrect manga volume-to-chapter mappings by adding MangaDex as primary volume source, fixing Wikipedia parser bugs, and implementing a multi-source merge strategy.

**Architecture:** MangaDex `/aggregate` endpoint becomes the primary volume mapping source. Wikipedia (with parser fixes) serves as fallback. MangaUpdates remains the chapter discovery source with lowest-priority volume data. A per-chapter priority chain (MangaDex > Wikipedia > MangaUpdates > ungrouped) resolves conflicts.

**Tech Stack:** TypeScript, Drizzle ORM (SQLite), Vitest, MangaDex REST API, Wikipedia MediaWiki API

**Spec:** `docs/superpowers/specs/2026-03-29-manga-volume-mapping-fixes-design.md`

---

## File Map

| File                              | Action   | Responsibility                                                           |
| --------------------------------- | -------- | ------------------------------------------------------------------------ |
| `src/db/schema/manga.ts`          | Modify   | Add `mangaDexId`, `mangaDexFetchedAt` columns                            |
| `drizzle/NNNN_*.sql`              | Generate | Migration for new columns                                                |
| `src/server/mangadex.ts`          | Create   | MangaDex API client: search, match, aggregate                            |
| `src/__tests__/mangadex.test.ts`  | Create   | Tests for MangaDex parsing and matching                                  |
| `src/server/wikipedia.ts`         | Modify   | Parser fixes: subpage links, search ranking, chapter format, last-volume |
| `src/__tests__/wikipedia.test.ts` | Modify   | Tests for new parser strategies                                          |
| `src/server/manga-import.ts`      | Modify   | Merge strategy, chapter discovery, MangaDex integration                  |

---

### Task 1: Schema — Add MangaDex Columns

**Files:**

- Modify: `src/db/schema/manga.ts:36-39`

- [ ] **Step 1: Add columns to manga table**

In `src/db/schema/manga.ts`, add after the `wikipediaFetchedAt` column (line 39):

```typescript
    mangaDexId: text("manga_dex_id"),
    mangaDexFetchedAt: integer("manga_dex_fetched_at", {
      mode: "timestamp",
    }),
```

- [ ] **Step 2: Generate migration**

Run: `bun run db:generate`
Expected: New migration file appears in `drizzle/` directory.

- [ ] **Step 3: Run migration**

Run: `bun run db:migrate`
Expected: Migration applies cleanly, no errors.

- [ ] **Step 4: Commit**

Commit message: `feat: add mangaDexId and mangaDexFetchedAt columns to manga table`
Stage: `src/db/schema/manga.ts` and `drizzle/` directory.

---

### Task 2: MangaDex API Client — Types and Aggregate Parsing (TDD)

**Files:**

- Create: `src/__tests__/mangadex.test.ts`
- Create: `src/server/mangadex.ts`

- [ ] **Step 1: Write tests for aggregate parsing**

Create `src/__tests__/mangadex.test.ts`:

```typescript
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
    const { mappings } = parseMangaDexAggregate(BERSERK_AGGREGATE);
    expect(mappings[0]).toStrictEqual({
      volumeNumber: 1,
      firstChapter: 1,
      lastChapter: 6,
    });
    expect(mappings[1]).toStrictEqual({
      volumeNumber: 2,
      firstChapter: 7,
      lastChapter: 11,
    });
  });

  it("excludes the 'none' bucket from volume mappings", () => {
    const { mappings } = parseMangaDexAggregate(BERSERK_AGGREGATE);
    const volumeNumbers = mappings.map((m) => m.volumeNumber);
    expect(volumeNumbers).not.toContain(null);
    expect(mappings).toHaveLength(2);
  });

  it("returns chapter numbers from the 'none' bucket separately", () => {
    const { ungroupedChapters } = parseMangaDexAggregate(BERSERK_AGGREGATE);
    expect(ungroupedChapters).toStrictEqual(["380", "381"]);
  });

  it("returns all chapter numbers across all volumes", () => {
    const { allChapterNumbers } = parseMangaDexAggregate(BERSERK_AGGREGATE);
    expect(allChapterNumbers).toContain("1");
    expect(allChapterNumbers).toContain("11");
    expect(allChapterNumbers).toContain("380");
    expect(allChapterNumbers).toContain("381");
    expect(allChapterNumbers).toHaveLength(13);
  });

  it("returns empty arrays for empty aggregate", () => {
    const result = parseMangaDexAggregate(EMPTY_AGGREGATE);
    expect(result.mappings).toStrictEqual([]);
    expect(result.ungroupedChapters).toStrictEqual([]);
    expect(result.allChapterNumbers).toStrictEqual([]);
  });

  it("handles single-volume aggregate", () => {
    const { mappings } = parseMangaDexAggregate(SINGLE_VOLUME_AGGREGATE);
    expect(mappings).toHaveLength(1);
    expect(mappings[0]).toStrictEqual({
      volumeNumber: 1,
      firstChapter: 1,
      lastChapter: 3,
    });
  });

  it("ignores non-numeric chapter keys when computing min/max", () => {
    const { mappings } = parseMangaDexAggregate(NON_NUMERIC_CHAPTERS_AGGREGATE);
    expect(mappings[0]).toStrictEqual({
      volumeNumber: 1,
      firstChapter: 1,
      lastChapter: 2,
    });
  });

  it("sorts volume mappings by volumeNumber ascending", () => {
    const { mappings } = parseMangaDexAggregate(BERSERK_AGGREGATE);
    for (let i = 1; i < mappings.length; i++) {
      expect(mappings[i].volumeNumber).toBeGreaterThan(
        mappings[i - 1].volumeNumber,
      );
    }
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun vitest run src/__tests__/mangadex.test.ts`
Expected: FAIL — module `src/server/mangadex` does not exist.

- [ ] **Step 3: Implement types and parsing functions**

Create `src/server/mangadex.ts`:

```typescript
/**
 * MangaDex API client for manga volume/chapter aggregate data.
 * Used as the primary source for volume-to-chapter mappings.
 */

import { createApiFetcher } from "./api-cache";
import { parseChapterNumber } from "./manga-chapter-utils";
import type { WikipediaVolumeMapping as VolumeMapping } from "./wikipedia";

// ─── Types ────────────────────────────────────────────────────────────────

type MangaDexAggregateChapter = {
  chapter: string;
  id: string;
  others: string[];
  count: number;
};

type MangaDexAggregateVolume = {
  volume: string;
  count: number;
  chapters: Record<string, MangaDexAggregateChapter>;
};

type MangaDexAggregateResponse = {
  result: string;
  volumes: Record<string, MangaDexAggregateVolume>;
};

type MangaDexSearchResult = {
  result: string;
  data: Array<{
    id: string;
    type: string;
    attributes: {
      title: Record<string, string>;
      altTitles: Array<Record<string, string>>;
      links: Record<string, string> | null;
    };
  }>;
};

export type MangaDexAggregateResult = {
  mappings: VolumeMapping[];
  ungroupedChapters: string[];
  allChapterNumbers: string[];
};

// ─── API Client ───────────────────────────────────────────────────────────

const mangaDex = createApiFetcher({
  name: "mangadex",
  cache: { ttlMs: 10 * 60 * 1000, maxEntries: 500 },
  rateLimit: { maxRequests: 5, windowMs: 1000 },
  retry: { maxRetries: 3, baseDelayMs: 1000 },
});

const MANGADEX_API_URL = "https://api.mangadex.org";
const REQUEST_TIMEOUT_MS = 15_000;

async function mangaDexFetch<T>(cacheKey: string, url: string): Promise<T> {
  return mangaDex.fetch<T>(cacheKey, async () => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) {
        throw new Error(
          `MangaDex API error: ${response.status} ${response.statusText}`,
        );
      }
      return (await response.json()) as T;
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error("MangaDex API request timed out.", { cause: error });
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  });
}

// ─── Pure Functions ───────────────────────────────────────────────────────

/**
 * Parses a MangaDex aggregate response into volume mappings.
 * Each volume's range is derived from the min/max chapter numbers within it.
 * The "none" bucket (chapters without a volume) is returned separately.
 */
export function parseMangaDexAggregate(
  aggregate: MangaDexAggregateResponse,
): MangaDexAggregateResult {
  const mappings: VolumeMapping[] = [];
  const ungroupedChapters: string[] = [];
  const allChapterNumbers: string[] = [];

  for (const [volumeKey, volumeData] of Object.entries(aggregate.volumes)) {
    const chapterKeys = Object.keys(volumeData.chapters);
    for (const key of chapterKeys) {
      allChapterNumbers.push(key);
    }

    if (volumeKey === "none") {
      ungroupedChapters.push(...chapterKeys);
      continue;
    }

    const volumeNumber = Number.parseInt(volumeKey, 10);
    if (Number.isNaN(volumeNumber)) {
      continue;
    }

    const numericChapters = chapterKeys
      .map((k) => parseChapterNumber(k))
      .filter((n): n is number => n !== null);

    if (numericChapters.length === 0) {
      continue;
    }

    mappings.push({
      volumeNumber,
      firstChapter: Math.min(...numericChapters),
      lastChapter: Math.max(...numericChapters),
    });
  }

  mappings.sort((a, b) => a.volumeNumber - b.volumeNumber);

  return { mappings, ungroupedChapters, allChapterNumbers };
}

/**
 * Checks if a MangaUpdates slug matches a MangaDex mu link.
 * Our slug format: "njeqwry/berserk" (ID + title path).
 * MangaDex mu link: "njeqwry" (just the ID).
 */
export function matchMangaUpdatesSlug(
  ourSlug: string | null,
  mangaDexMuLink: string | null,
): boolean {
  if (!ourSlug || !mangaDexMuLink) {
    return false;
  }
  const ourId = ourSlug.split("/")[0];
  return ourId === mangaDexMuLink;
}

// ─── API Functions ────────────────────────────────────────────────────────

/**
 * Search MangaDex for a manga by title and verify the match using
 * the MangaUpdates slug stored in the links metadata.
 * Returns the MangaDex manga ID or null if no verified match found.
 */
export async function searchAndMatchManga(
  title: string,
  mangaUpdatesSlug: string | null,
): Promise<string | null> {
  const url = new URL(`${MANGADEX_API_URL}/manga`);
  url.searchParams.set("title", title);
  url.searchParams.set("limit", "10");

  const cacheKey = `search:${title}`;
  const result = await mangaDexFetch<MangaDexSearchResult>(
    cacheKey,
    url.toString(),
  );

  for (const entry of result.data) {
    const muLink = entry.attributes.links?.mu ?? null;
    if (matchMangaUpdatesSlug(mangaUpdatesSlug, muLink)) {
      return entry.id;
    }
  }

  return null;
}

/**
 * Fetch the volume/chapter aggregate for a MangaDex manga.
 * Returns parsed volume mappings and the full chapter list.
 */
export async function getMangaDexAggregate(
  mangaDexId: string,
): Promise<MangaDexAggregateResult> {
  const url = `${MANGADEX_API_URL}/manga/${mangaDexId}/aggregate`;
  const cacheKey = `aggregate:${mangaDexId}`;
  const result = await mangaDexFetch<MangaDexAggregateResponse>(cacheKey, url);
  return parseMangaDexAggregate(result);
}

/**
 * Main entry point: search, match, and fetch aggregate in one call.
 * Returns null if manga not found or not matched.
 */
export async function getMangaDexVolumeMappings(
  title: string,
  mangaUpdatesSlug: string | null,
  existingMangaDexId?: string | null,
): Promise<{ mangaDexId: string; aggregate: MangaDexAggregateResult } | null> {
  const mangaDexId =
    existingMangaDexId || (await searchAndMatchManga(title, mangaUpdatesSlug));
  if (!mangaDexId) {
    return null;
  }

  const aggregate = await getMangaDexAggregate(mangaDexId);
  return { mangaDexId, aggregate };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun vitest run src/__tests__/mangadex.test.ts`
Expected: All tests PASS.

- [ ] **Step 5: Commit**

Commit message: `feat: add MangaDex API client with aggregate parsing and slug matching`
Stage: `src/server/mangadex.ts` and `src/__tests__/mangadex.test.ts`.

---

### Task 3: Wikipedia Fixes — Subpage Discovery and Search Ranking (TDD)

**Files:**

- Modify: `src/__tests__/wikipedia.test.ts`
- Modify: `src/server/wikipedia.ts`

- [ ] **Step 1: Add tests for plain wikilink subpage extraction**

In `src/__tests__/wikipedia.test.ts`, add a new fixture after `SUBPAGE_WIKITEXT` (line 102):

```typescript
const HUB_PAGE_WIKITEXT = `{{Short description|none}}
Below is a list of chapters.

==Lists of main series chapters==
* [[List of One Piece chapters (1\u2013186)|Chapters 1 to 186]]
* [[List of One Piece chapters (187\u2013388)|Chapters 187 to 388]]
* [[List of One Piece chapters (389\u2013594)|Chapters 389 to 594]]

==See also==
Some other content.`;
```

Then add tests in the `extractSubpageLinks` describe block (after line 288):

```typescript
it("extracts plain wikilinks matching chapter list subpage pattern", () => {
  const links = extractSubpageLinks(HUB_PAGE_WIKITEXT);
  expect(links).toContain("List of One Piece chapters (1\u2013186)");
  expect(links).toContain("List of One Piece chapters (187\u2013388)");
  expect(links).toContain("List of One Piece chapters (389\u2013594)");
});

it("extracts both {{further}} templates and plain wikilinks", () => {
  const combined = SUBPAGE_WIKITEXT + "\n" + HUB_PAGE_WIKITEXT;
  const links = extractSubpageLinks(combined);
  expect(links).toContain("List of One Piece chapters (187-396)");
  expect(links).toContain("List of One Piece chapters (1\u2013186)");
});

it("does not extract non-chapter-list wikilinks", () => {
  const wikitext = `See [[One Piece]] and [[List of One Piece characters]].`;
  const links = extractSubpageLinks(wikitext);
  expect(links).toStrictEqual([]);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun vitest run src/__tests__/wikipedia.test.ts -t "extracts plain wikilinks"`
Expected: FAIL — current implementation doesn't detect plain wikilinks.

- [ ] **Step 3: Fix extractSubpageLinks to detect plain wikilinks**

In `src/server/wikipedia.ts`, replace the `extractSubpageLinks` function (lines 186-201):

```typescript
/**
 * Extracts subpage links from:
 * 1. `{{further|...}}` and `{{main|...}}` templates
 * 2. Plain wikilinks matching chapter list subpage patterns:
 *    `[[List of X chapters (N-M)|...]]`
 */
export function extractSubpageLinks(wikitext: string): string[] {
  const links: string[] = [];

  // Pattern 1: {{further|...}} and {{main|...}} templates
  const templatePattern = /\{\{(?:further|main)\s*\|([^}]+)\}\}/gi;
  let match: RegExpExecArray | null;

  while ((match = templatePattern.exec(wikitext)) !== null) {
    const args = match[1].split("|");
    const title = args[0].trim();
    if (title) {
      links.push(title);
    }
  }

  // Pattern 2: plain wikilinks to chapter list subpages
  // Matches: [[List of X chapters (N-M)|display text]] or [[List of X chapters (N-M)]]
  const wikilinkPattern =
    /\[\[(List of [^[\]]+chapters\s*\([^)]+\))(?:\|[^\]]+)?\]\]/gi;
  while ((match = wikilinkPattern.exec(wikitext)) !== null) {
    const title = match[1].trim();
    if (title && !links.includes(title)) {
      links.push(title);
    }
  }

  return links;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun vitest run src/__tests__/wikipedia.test.ts -t "extractSubpageLinks"`
Expected: All tests PASS (existing + new).

- [ ] **Step 5: Add test for search ranking**

Add a new describe block and update the import at the top of the test file to include `pickBestSearchResult`:

```typescript
import {
  extractGraphicNovelListBlocks,
  extractVolumeNumber,
  extractFirstChapterNumber,
  extractSubpageLinks,
  extractVolumesFromWikitext,
  deriveVolumeRanges,
  applyWikipediaVolumeMappings,
  pickBestSearchResult,
} from "src/server/wikipedia";
```

Add at the bottom of the file:

```typescript
// ─── pickBestSearchResult ────────────────────────────────────────────────

describe("pickBestSearchResult", () => {
  it("prefers 'chapters' page over 'volumes' page", () => {
    const hits = [
      { title: "List of One Piece manga volumes" },
      { title: "Lists of One Piece chapters" },
      { title: "List of One Piece chapters (1\u2013186)" },
    ];
    expect(pickBestSearchResult(hits)).toBe("Lists of One Piece chapters");
  });

  it("returns first matching chapter page when no volumes page", () => {
    const hits = [
      { title: "List of Berserk chapters" },
      { title: "Berserk (manga)" },
    ];
    expect(pickBestSearchResult(hits)).toBe("List of Berserk chapters");
  });

  it("returns null when no chapter pages found", () => {
    const hits = [{ title: "One Piece" }, { title: "One Piece (anime)" }];
    expect(pickBestSearchResult(hits)).toBeNull();
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `bun vitest run src/__tests__/wikipedia.test.ts -t "pickBestSearchResult"`
Expected: FAIL — function not exported.

- [ ] **Step 7: Implement pickBestSearchResult and update searchChapterListPage**

In `src/server/wikipedia.ts`, add before `searchChapterListPage`:

```typescript
/**
 * Picks the best search result for a chapter list page.
 * Prefers pages with "chapters" in the title, deprioritizes "volumes".
 * Returns null if no suitable page found.
 */
export function pickBestSearchResult(
  hits: Array<{ title: string }>,
): string | null {
  const chapterPages: string[] = [];

  for (const hit of hits) {
    if (
      /lists? of .* chapters/i.test(hit.title) &&
      !/volumes/i.test(hit.title)
    ) {
      chapterPages.push(hit.title);
    }
  }

  return chapterPages[0] ?? null;
}
```

Then update `searchChapterListPage` to use it. Replace the hit-matching loop (lines 315-322):

```typescript
const hits = result.query?.search ?? [];
return pickBestSearchResult(hits);
```

- [ ] **Step 8: Run all Wikipedia tests**

Run: `bun vitest run src/__tests__/wikipedia.test.ts`
Expected: All tests PASS.

- [ ] **Step 9: Commit**

Commit message: `fix: Wikipedia subpage discovery for plain wikilinks and search ranking`
Stage: `src/server/wikipedia.ts` and `src/__tests__/wikipedia.test.ts`.

---

### Task 4: Wikipedia Fixes — Chapter Format and Last-Volume Absorption (TDD)

**Files:**

- Modify: `src/__tests__/wikipedia.test.ts`
- Modify: `src/server/wikipedia.ts`

- [ ] **Step 1: Add fixtures and test for "Chapters X-Y" extraction format**

In `src/__tests__/wikipedia.test.ts`, add fixtures near the other fixtures:

```typescript
const WITCH_HAT_BLOCK = `{{Graphic novel list
| VolumeNumber = 1
| OriginalRelDate = July 23, 2018
| ChapterList =
* Chapters 1\u20135
}}`;

const WITCH_HAT_BLOCK_V2 = `{{Graphic novel list
| VolumeNumber = 2
| OriginalRelDate = November 22, 2018
| ChapterList =
* Chapters 6\u201311
* Bonus Chapter (1)
}}`;
```

Add tests in the `extractFirstChapterNumber` describe block:

```typescript
it("extracts from '* Chapters X\u2013Y' format (Witch Hat Atelier vol 1)", () => {
  expect(extractFirstChapterNumber(WITCH_HAT_BLOCK)).toBe(1);
});

it("extracts from '* Chapters 6\u201311' (Witch Hat Atelier vol 2)", () => {
  expect(extractFirstChapterNumber(WITCH_HAT_BLOCK_V2)).toBe(6);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun vitest run src/__tests__/wikipedia.test.ts -t "Chapters"`
Expected: FAIL — returns null for the new format.

- [ ] **Step 3: Add Strategy 6 to extractFirstChapterNumber**

In `src/server/wikipedia.ts`, in `extractFirstChapterNumber`, add before the final `return null`:

```typescript
// Strategy 6: * Chapters X-Y (Witch Hat Atelier style, en-dash or hyphen)
const chaptersRangeMatch = block.match(/Chapters?\s+(\d+)/i);
if (chaptersRangeMatch) {
  return Number(chaptersRangeMatch[1]);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun vitest run src/__tests__/wikipedia.test.ts -t "extractFirstChapterNumber"`
Expected: All tests PASS.

- [ ] **Step 5: Update deriveVolumeRanges tests for last-volume fix**

In `src/__tests__/wikipedia.test.ts`, update these existing tests in the `deriveVolumeRanges` describe block:

Replace "uses latestChapter for the final volume's lastChapter" (around line 385):

```typescript
it("does NOT use latestChapter for the final volume", () => {
  const volumes = [
    { volumeNumber: 1, firstChapter: 1 },
    { volumeNumber: 2, firstChapter: 8 },
  ];
  const ranges = deriveVolumeRanges(volumes, 20);
  expect(ranges[1]).toStrictEqual({
    volumeNumber: 2,
    firstChapter: 8,
    lastChapter: 8,
  });
});
```

Replace "uses latestChapter for single-volume list" (around line 408):

```typescript
it("does NOT extend single-volume range to latestChapter", () => {
  const volumes = [{ volumeNumber: 1, firstChapter: 1 }];
  const ranges = deriveVolumeRanges(volumes, 100);
  expect(ranges[0]).toStrictEqual({
    volumeNumber: 1,
    firstChapter: 1,
    lastChapter: 1,
  });
});
```

Replace "skips volumes with null firstChapter" test — update the final volume assertion (around line 432):

```typescript
// Vol 3 is the final volume, lastChapter = firstChapter
expect(ranges[1]).toStrictEqual({
  volumeNumber: 3,
  firstChapter: 17,
  lastChapter: 17,
});
```

Replace "produces 3 ranges from Chainsaw Man" (around line 439):

```typescript
it("final Chainsaw Man volume does not extend to latestChapter", () => {
  const volumes = extractVolumesFromWikitext(CHAINSAW_MAN_WIKITEXT);
  const ranges = deriveVolumeRanges(volumes, 97);
  expect(ranges).toHaveLength(3);
  expect(ranges[2]).toMatchObject({
    volumeNumber: 3,
    firstChapter: 17,
    lastChapter: 17,
  });
});
```

- [ ] **Step 6: Run tests to verify they fail**

Run: `bun vitest run src/__tests__/wikipedia.test.ts -t "deriveVolumeRanges"`
Expected: FAIL — final volumes still use latestChapter.

- [ ] **Step 7: Fix deriveVolumeRanges**

In `src/server/wikipedia.ts`, in `deriveVolumeRanges`, replace the `lastChapter` calculation (lines 246-249):

```typescript
const lastChapter =
  next === undefined ? vol.firstChapter : next.firstChapter - 1;
```

- [ ] **Step 8: Run all Wikipedia tests**

Run: `bun vitest run src/__tests__/wikipedia.test.ts`
Expected: All tests PASS.

- [ ] **Step 9: Commit**

Commit message: `fix: Wikipedia chapter format extraction and last-volume absorption bug`
Stage: `src/server/wikipedia.ts` and `src/__tests__/wikipedia.test.ts`.

---

### Task 5: Merge Strategy — Integrate MangaDex into Import Pipeline

**Files:**

- Modify: `src/server/manga-import.ts`

- [ ] **Step 1: Add imports**

At the top of `src/server/manga-import.ts`, add the MangaDex import and update existing imports:

```typescript
import { getMangaDexVolumeMappings } from "./mangadex";
import type { WikipediaVolumeMapping as VolumeMapping } from "./wikipedia";
import {
  normalizeChapterNumber,
  expandChapterRange,
  parseChapterNumber,
} from "./manga-chapter-utils";
```

Note: `parseChapterNumber` is a new addition to the existing import from `manga-chapter-utils`.

- [ ] **Step 2: Update resolveMappingSource for three sources**

Replace the `resolveMappingSource` function (lines 204-212):

```typescript
function resolveMappingSource(
  volumeNumber: number | null,
  mangaDexMappings: VolumeMapping[] | null,
  wikiMappings: VolumeMapping[] | null,
): "mangadex" | "wikipedia" | "mangaupdates" | "none" {
  if (volumeNumber === null) {
    return "none";
  }
  if (mangaDexMappings?.some((m) => m.volumeNumber === volumeNumber)) {
    return "mangadex";
  }
  if (wikiMappings?.some((m) => m.volumeNumber === volumeNumber)) {
    return "wikipedia";
  }
  return "mangaupdates";
}
```

- [ ] **Step 3: Update insertVolumesAndChapters signature**

Replace the function signature and the `mappingSource` usage inside:

```typescript
function insertVolumesAndChapters(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  mangaId: number,
  volumeGroups: Map<number | null, DeduplicatedChapter[]>,
  monitorOption: "all" | "future" | "missing" | "none",
  mangaDexMappings: VolumeMapping[] | null,
  wikiMappings: VolumeMapping[] | null,
  // oxlint-disable-next-line no-empty-function -- intentional no-op default
  updateProgress: (message: string) => void = () => {},
): { volumesAdded: number; chaptersAdded: number } {
```

Inside the function, replace the `mappingSource` in the volume insert:

```typescript
        mappingSource: resolveMappingSource(
          volumeNumber,
          mangaDexMappings,
          wikiMappings,
        ),
```

- [ ] **Step 4: Replace the data fetching section in importMangaHandler**

Replace the Wikipedia integration section (lines 314-331) with the full multi-source pipeline:

```typescript
// ── MangaDex volume mappings (primary) ──
let mangaDexId: string | null = null;
let mangaDexMappings: VolumeMapping[] | null = null;
let mangaDexChapterNumbers: string[] = [];
try {
  updateProgress("Fetching volume mappings from MangaDex...");
  const mdResult = await getMangaDexVolumeMappings(
    data.title,
    data.mangaUpdatesSlug ?? null,
  );
  if (mdResult) {
    mangaDexId = mdResult.mangaDexId;
    mangaDexMappings = mdResult.aggregate.mappings;
    mangaDexChapterNumbers = mdResult.aggregate.allChapterNumbers;
    chapters = applyWikipediaVolumeMappings(
      chapters,
      mdResult.aggregate.mappings,
    );
  }
} catch {
  // MangaDex fetch failed -- continue without
}

// ── Wikipedia volume mappings (fallback for unmapped chapters) ──
let wikipediaPageTitle: string | null = null;
let wikiMappings: VolumeMapping[] | null = null;
try {
  updateProgress("Fetching volume mappings from Wikipedia...");
  const wikiResult = await getWikipediaVolumeMappings(
    data.title,
    data.latestChapter ?? detail.latest_chapter ?? undefined,
  );
  if (wikiResult) {
    wikipediaPageTitle = wikiResult.pageTitle;
    wikiMappings = wikiResult.mappings;
    // Apply only to chapters not yet mapped by MangaDex
    chapters = chapters.map((ch) => {
      if (ch.volume !== null) return ch;
      const num = parseChapterNumber(ch.chapterNumber);
      if (num === null) return ch;
      const mapping = wikiResult.mappings.find(
        (m) => num >= m.firstChapter && num <= m.lastChapter,
      );
      return mapping ? { ...ch, volume: String(mapping.volumeNumber) } : ch;
    });
  }
} catch {
  // Wikipedia fetch failed -- continue with whatever we have
}

// ── Supplement chapters from MangaDex (fill MangaUpdates gaps) ──
if (mangaDexChapterNumbers.length > 0) {
  const existingChapterNumbers = new Set(chapters.map((c) => c.chapterNumber));
  for (const mdChapter of mangaDexChapterNumbers) {
    if (!existingChapterNumbers.has(mdChapter)) {
      const parsed = Number.parseFloat(mdChapter);
      const mapping = !Number.isNaN(parsed)
        ? (mangaDexMappings ?? []).find(
            (m) => parsed >= m.firstChapter && parsed <= m.lastChapter,
          )
        : undefined;
      chapters.push({
        chapterNumber: mdChapter,
        volume: mapping ? String(mapping.volumeNumber) : null,
        releaseDate: null,
        scanlationGroup: null,
        fromExpansion: false,
      });
    }
  }
}
```

- [ ] **Step 5: Update the transaction to store MangaDex ID and new mapping source args**

In the manga insert `.values({...})`, add after `wikipediaFetchedAt`:

```typescript
        mangaDexId,
        mangaDexFetchedAt: mangaDexId ? new Date() : null,
```

Update the `insertVolumesAndChapters` call:

```typescript
const { volumesAdded, chaptersAdded } = insertVolumesAndChapters(
  tx,
  mangaRow.id,
  volumeGroups,
  data.monitorOption,
  mangaDexMappings,
  wikiMappings,
  updateProgress,
);
```

- [ ] **Step 6: Verify build**

Run: `bun run build`
Expected: Builds successfully with no type errors.

- [ ] **Step 7: Commit**

Commit message: `feat: integrate MangaDex as primary volume source in import pipeline`
Stage: `src/server/manga-import.ts`.

---

### Task 6: Merge Strategy — Integrate MangaDex into Refresh Pipeline

**Files:**

- Modify: `src/server/manga-import.ts`

- [ ] **Step 1: Add MangaDex fetching to refreshMangaInternal**

In `refreshMangaInternal`, add MangaDex fetching before the existing Wikipedia block (around line 677). Insert after the `SEVEN_DAYS_MS` declaration:

```typescript
// Fetch MangaDex volume mappings if never fetched or stale (7+ days)
let mangaDexMappings: VolumeMapping[] | null = null;
let mangaDexChapterNumbers: string[] = [];
const lastMdFetch = mangaRow.mangaDexFetchedAt
  ? new Date(mangaRow.mangaDexFetchedAt).getTime()
  : 0;
const mangaDexStale = Date.now() - lastMdFetch > SEVEN_DAYS_MS;

if (mangaDexStale) {
  try {
    const mdResult = await getMangaDexVolumeMappings(
      mangaRow.title,
      mangaRow.mangaUpdatesSlug ?? null,
      mangaRow.mangaDexId,
    );
    if (mdResult) {
      mangaDexMappings = mdResult.aggregate.mappings;
      mangaDexChapterNumbers = mdResult.aggregate.allChapterNumbers;
      db.update(manga)
        .set({
          mangaDexId: mdResult.mangaDexId,
          mangaDexFetchedAt: new Date(),
        })
        .where(eq(manga.id, mangaId))
        .run();
    }
  } catch {
    // MangaDex fetch failed -- continue without
  }
}
```

- [ ] **Step 2: Update insertNewChapters signature and body**

Update the function signature to accept MangaDex data:

```typescript
function insertNewChapters(
  mangaId: number,
  releases: MangaUpdatesRelease[],
  monitorOption: "all" | "future" | "missing" | "none",
  wikiMappings: WikipediaVolumeMapping[] | null = null,
  mangaDexMappings: VolumeMapping[] | null = null,
  mangaDexChapterNumbers: string[] = [],
): number {
```

Replace the mapping application (around lines 464-466) with multi-source mapping:

```typescript
// Apply MangaDex mappings (primary)
let mappedChapters = mangaDexMappings
  ? applyWikipediaVolumeMappings(chapters, mangaDexMappings)
  : [...chapters.map((c) => ({ ...c }))];

// Apply Wikipedia mappings only to chapters still unmapped
if (wikiMappings) {
  mappedChapters = mappedChapters.map((ch) => {
    if (ch.volume !== null) return ch;
    const num = parseChapterNumber(ch.chapterNumber);
    if (num === null) return ch;
    const mapping = wikiMappings.find(
      (m) => num >= m.firstChapter && num <= m.lastChapter,
    );
    return mapping ? { ...ch, volume: String(mapping.volumeNumber) } : ch;
  });
}

// Supplement with chapters from MangaDex not in MangaUpdates
if (mangaDexChapterNumbers.length > 0) {
  const deduped = new Set(mappedChapters.map((c) => c.chapterNumber));
  for (const mdChapter of mangaDexChapterNumbers) {
    if (!deduped.has(mdChapter)) {
      const parsed = Number.parseFloat(mdChapter);
      const mapping = !Number.isNaN(parsed)
        ? (mangaDexMappings ?? []).find(
            (m) => parsed >= m.firstChapter && parsed <= m.lastChapter,
          )
        : undefined;
      mappedChapters.push({
        chapterNumber: mdChapter,
        volume: mapping ? String(mapping.volumeNumber) : null,
        releaseDate: null,
        scanlationGroup: null,
        fromExpansion: false,
      });
    }
  }
}
```

- [ ] **Step 3: Update resolveMappingSource calls in insertNewChapters**

In the volume creation section (around line 538, for reassigning ungrouped chapters), update the mappingSource:

```typescript
          mappingSource: mangaDexMappings
            ? "mangadex"
            : wikiMappings
              ? "wikipedia"
              : "mangaupdates",
```

In the new volume creation for new chapters (around line 588):

```typescript
          mappingSource: resolveMappingSource(
            volumeNumber,
            mangaDexMappings,
            wikiMappings,
          ),
```

- [ ] **Step 4: Update the call to insertNewChapters in refreshMangaInternal**

```typescript
const newChaptersAdded = insertNewChapters(
  mangaId,
  allReleases,
  monitorOption,
  wikiMappings,
  mangaDexMappings,
  mangaDexChapterNumbers,
);
```

- [ ] **Step 5: Verify build**

Run: `bun run build`
Expected: Builds successfully with no type errors.

- [ ] **Step 6: Commit**

Commit message: `feat: integrate MangaDex into refresh pipeline with multi-source merge`
Stage: `src/server/manga-import.ts`.

---

### Task 7: Bug Fix — Investigate and Fix Missing Chapters

**Files:**

- Modify: `src/server/manga-import.ts`

- [ ] **Step 1: Add temporary debug logging**

In `deduplicateReleases`, add after the `if (!normalized) { continue; }` check:

```typescript
// Temporary debug: trace chapters 25 and 26
if (
  /^25$|^26$/.test(normalized) ||
  normalized.includes("25-") ||
  normalized.includes("-26") ||
  normalized.includes("25+") ||
  normalized.includes("+26")
) {
  console.log(
    `[DEBUG dedup] raw="${rawChapter}" normalized="${normalized}" expanded=${JSON.stringify(expandChapterRange(normalized))} compound=${normalized.includes("+")}`,
  );
}
```

- [ ] **Step 2: Run a refresh for One Piece and check logs**

Start the dev server with `bun run dev` and trigger a refresh for One Piece. Check console for `[DEBUG dedup]` output to identify the exact release format causing the drop.

- [ ] **Step 3: Fix the identified issue**

Based on the most likely cause (compound entries skipping valid chapters), update the compound entry handling in `deduplicateReleases`. Replace the compound skip block:

```typescript
    } else if (normalized.includes("+")) {
      // Compound entry (e.g., "24-26 + Omake") — skip entirely
      continue;
```

With salvage logic:

```typescript
    } else if (normalized.includes("+")) {
      // Compound entry — try to salvage valid chapter numbers from each part
      const parts = normalized.split("+").map((p) => p.trim());
      for (const part of parts) {
        const partNormalized = normalizeChapterNumber(part);
        if (!partNormalized) continue;
        const partExpanded = expandChapterRange(partNormalized);
        if (partExpanded) {
          for (const num of partExpanded) {
            mergeChapter(
              byChapter,
              String(num),
              volume,
              releaseDate,
              groupName,
              true,
            );
          }
        } else if (/^\d+(\.\d+)?$/.test(partNormalized)) {
          mergeChapter(
            byChapter,
            partNormalized,
            volume,
            releaseDate,
            groupName,
            false,
          );
        }
      }
      continue;
```

- [ ] **Step 4: Remove debug logging**

Remove the temporary `console.log` added in Step 1.

- [ ] **Step 5: Verify build**

Run: `bun run build`
Expected: Builds successfully.

- [ ] **Step 6: Commit**

Commit message: `fix: salvage valid chapters from compound release entries`
Stage: `src/server/manga-import.ts`.

---

### Task 8: Final Verification

- [ ] **Step 1: Run all tests**

Run: `bun vitest run`
Expected: All tests PASS.

- [ ] **Step 2: Run production build**

Run: `bun run build`
Expected: Build completes with no errors.

- [ ] **Step 3: Manual verification — import One Piece**

Start dev server and import One Piece. Verify:

- Chapters 22-24 are assigned to the correct volume (not uncategorized)
- Chapters 25-26 are present
- Volume 40 does NOT contain 802 chapters
- Latest chapters without a published volume are ungrouped
- `mappingSource` on volumes shows "mangadex" or "wikipedia"

- [ ] **Step 4: Manual verification — import Berserk**

Import Berserk. Verify:

- Chapters 1-226 are present (supplemented from MangaDex)
- All chapters have correct volume assignments
- No gaps in chapter numbering

- [ ] **Step 5: Manual verification — import Witch Hat Atelier**

Import Witch Hat Atelier. Verify:

- Latest chapters beyond chapter 68 are present
- Volume assignments are correct for all 15 volumes

- [ ] **Step 6: Commit any remaining fixes**

If manual verification revealed issues, fix them and commit with a descriptive message.
