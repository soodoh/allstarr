# Manga Wikipedia Volume Mapping Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enrich manga volume grouping by parsing chapter-to-volume mappings from Wikipedia's "List of X chapters" pages.

**Architecture:** MangaUpdates stays the sole source for chapter lists and release dates. A new `wikipedia.ts` module searches Wikipedia for chapter list pages, parses `{{Graphic novel list}}` wikitext templates to extract volume-to-chapter-range mappings, and these mappings override volume assignments during import and refresh. Pure parser functions are fully unit-tested.

**Tech Stack:** MediaWiki API (REST, no auth), wikitext regex parsing, Drizzle ORM (SQLite), Vitest

---

## File Map

### New Files

- `src/server/wikipedia.ts` -- Wikipedia API client and wikitext parser
- `src/__tests__/wikipedia.test.ts` -- Unit tests for parser and mapping functions

### Modified Files

- `src/db/schema/manga.ts` -- Add `wikipediaPageTitle` column to `manga`; add `mappingSource` column to `mangaVolumes`
- `src/server/manga-import.ts` -- Apply Wikipedia volume mappings in import and refresh flows

---

### Task 1: Wikipedia Wikitext Parser -- Tests

**Files:**

- Create: `src/__tests__/wikipedia.test.ts`

- [ ] **Step 1: Write tests for `extractGraphicNovelListBlocks`**

```typescript
import { describe, it, expect } from "vitest";
import {
  extractGraphicNovelListBlocks,
  extractVolumeNumber,
  extractFirstChapterNumber,
  extractSubpageLinks,
  extractVolumesFromWikitext,
  deriveVolumeRanges,
  applyWikipediaVolumeMappings,
} from "src/server/wikipedia";

// --- Test Fixtures ---

const CHAINSAW_MAN_WIKITEXT = `{{Graphic novel list/header
| Language = Japanese
| Width = 50%
}}
{{Graphic novel list
| VolumeNumber = 1
| OriginalRelDate = March 4, 2019
| OriginalISBN = 978-4-08-881773-5
| ChapterList = {{Numbered list|start=1|"Dog & Chainsaw"|"The Place Where Pochita Is"|"Arrival in Tokyo"|"Power"}}
| ChapterListCol2 = {{Numbered list|start=5|"A Way to Touch Some Boobs"|"Service"|"Meowy's Whereabouts"}}
}}
{{Graphic novel list
| VolumeNumber = 2
| OriginalRelDate = May 2, 2019
| OriginalISBN = 978-4-08-881813-8
| ChapterList = {{Numbered list|start=8|"Gunfire"|"Rescue"|"Kon"|"Compromise"}}
| ChapterListCol2 = {{Numbered list|start=12|"Squeeze"|"Gun Devil"|"Emergency Exit"|"The First Devil Hunter"}}
}}
{{Graphic novel list
| VolumeNumber = 3
| OriginalRelDate = August 2, 2019
| ChapterList = {{Numbered list|start=17|"Kill Denji"|"Chainsaw vs. Bat"}}
}}
{{Graphic novel list/footer}}`;

const NARUTO_WIKITEXT = `{{Graphic novel list/header
| Language = Japanese
}}
{{Graphic novel list
| VolumeNumber = 1
| OriginalRelDate = March 3, 2000
| ChapterList =
# <li value="1"> "Uzumaki Naruto!!"
# "Konohamaru!!"
# "Sasuke Uchiha!!"
# "Hatake Kakashi!!"
# "Unpreparedness is One's Greatest Enemy!!"
# "Not Sasuke!!"
# "Kakashi's Conclusion"
}}
{{Graphic novel list
| VolumeNumber = 2
| OriginalRelDate = June 2, 2000
| ChapterList =
# <li value="8"> "And That's Why You're Disqualified!!"
# "The Worst Client"
# "The Second Critter"
# "Vows...!!"
# "Haku's Disposal!!"
# "Precious Person...!!"
# "He Who Couldn't Be"
# "In the Midst of Despair...!!"
# "Starting to Bloom...!!"
}}
{{Graphic novel list/footer}}`;

const BLEACH_WIKITEXT = `{{Graphic novel list/header
| Language = Japanese
}}
{{Graphic novel list
| VolumeNumber = 1
| OriginalRelDate = January 5, 2002
| ChapterList =
* 1. "Death & Strawberry"
* 2. "Starter"
* 3. "Headhittin'"
* 4. "Why do you eat it?"
* 5. "Binda Blinda"
* 6. "Microcrack."
* 7. "The Pink Cheeked Parakeet"
}}
{{Graphic novel list
| VolumeNumber = 2
| OriginalRelDate = April 4, 2002
| ChapterList =
* 8. "Chasing Chad"
* 9. "Monster and a Transfer (and Allergy to Perverts)"
* 10. "Monster and a Transfer, pt. 2 (The Deathberry)"
}}
{{Graphic novel list/footer}}`;

const SUBPAGE_WIKITEXT = `This article covers chapters 1 to 200.
{{further|List of One Piece chapters (187-396)}}
{{main|List of One Piece chapters (397-594)}}

{{Graphic novel list
| VolumeNumber = 1
| ChapterList = {{Numbered list|start=1|"Romance Dawn"}}
}}`;

// --- Tests ---

describe("extractGraphicNovelListBlocks", () => {
  it("extracts volume blocks and skips header/footer", () => {
    const blocks = extractGraphicNovelListBlocks(CHAINSAW_MAN_WIKITEXT);
    expect(blocks).toHaveLength(3);
    expect(blocks[0]).toContain("VolumeNumber = 1");
    expect(blocks[1]).toContain("VolumeNumber = 2");
    expect(blocks[2]).toContain("VolumeNumber = 3");
  });

  it("handles Naruto hash-list format", () => {
    const blocks = extractGraphicNovelListBlocks(NARUTO_WIKITEXT);
    expect(blocks).toHaveLength(2);
  });

  it("handles Bleach bullet-list format", () => {
    const blocks = extractGraphicNovelListBlocks(BLEACH_WIKITEXT);
    expect(blocks).toHaveLength(2);
  });

  it("returns empty array for wikitext with no volume blocks", () => {
    const blocks = extractGraphicNovelListBlocks(
      "Some random text with no templates.",
    );
    expect(blocks).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Write tests for `extractVolumeNumber`**

Append to the same file:

```typescript
describe("extractVolumeNumber", () => {
  it("extracts volume number from Chainsaw Man block", () => {
    const blocks = extractGraphicNovelListBlocks(CHAINSAW_MAN_WIKITEXT);
    expect(extractVolumeNumber(blocks[0])).toBe(1);
    expect(extractVolumeNumber(blocks[1])).toBe(2);
    expect(extractVolumeNumber(blocks[2])).toBe(3);
  });

  it("returns null for block without VolumeNumber", () => {
    expect(
      extractVolumeNumber("{{Graphic novel list\n| ChapterList = stuff\n}}"),
    ).toBeNull();
  });
});
```

- [ ] **Step 3: Write tests for `extractFirstChapterNumber`**

Append to the same file:

```typescript
describe("extractFirstChapterNumber", () => {
  it("extracts from Numbered list start= (Chainsaw Man)", () => {
    const blocks = extractGraphicNovelListBlocks(CHAINSAW_MAN_WIKITEXT);
    expect(extractFirstChapterNumber(blocks[0])).toBe(1);
    expect(extractFirstChapterNumber(blocks[1])).toBe(8);
    expect(extractFirstChapterNumber(blocks[2])).toBe(17);
  });

  it("extracts from <li value=N> (Naruto)", () => {
    const blocks = extractGraphicNovelListBlocks(NARUTO_WIKITEXT);
    expect(extractFirstChapterNumber(blocks[0])).toBe(1);
    expect(extractFirstChapterNumber(blocks[1])).toBe(8);
  });

  it("extracts from bullet list * NNN. (Bleach)", () => {
    const blocks = extractGraphicNovelListBlocks(BLEACH_WIKITEXT);
    expect(extractFirstChapterNumber(blocks[0])).toBe(1);
    expect(extractFirstChapterNumber(blocks[1])).toBe(8);
  });

  it("returns null when no chapter number found", () => {
    expect(
      extractFirstChapterNumber(
        "{{Graphic novel list\n| Summary = A cool volume\n}}",
      ),
    ).toBeNull();
  });
});
```

- [ ] **Step 4: Write tests for `extractSubpageLinks`**

Append:

```typescript
describe("extractSubpageLinks", () => {
  it("extracts further and main links", () => {
    const links = extractSubpageLinks(SUBPAGE_WIKITEXT);
    expect(links).toEqual([
      "List of One Piece chapters (187-396)",
      "List of One Piece chapters (397-594)",
    ]);
  });

  it("returns empty array when no subpage links", () => {
    expect(extractSubpageLinks(CHAINSAW_MAN_WIKITEXT)).toEqual([]);
  });
});
```

- [ ] **Step 5: Write tests for `extractVolumesFromWikitext` and `deriveVolumeRanges`**

Append:

```typescript
describe("extractVolumesFromWikitext", () => {
  it("extracts all volumes from Chainsaw Man wikitext", () => {
    const volumes = extractVolumesFromWikitext(CHAINSAW_MAN_WIKITEXT);
    expect(volumes).toEqual([
      { volumeNumber: 1, firstChapter: 1 },
      { volumeNumber: 2, firstChapter: 8 },
      { volumeNumber: 3, firstChapter: 17 },
    ]);
  });

  it("extracts all volumes from Naruto wikitext", () => {
    const volumes = extractVolumesFromWikitext(NARUTO_WIKITEXT);
    expect(volumes).toEqual([
      { volumeNumber: 1, firstChapter: 1 },
      { volumeNumber: 2, firstChapter: 8 },
    ]);
  });

  it("extracts all volumes from Bleach wikitext", () => {
    const volumes = extractVolumesFromWikitext(BLEACH_WIKITEXT);
    expect(volumes).toEqual([
      { volumeNumber: 1, firstChapter: 1 },
      { volumeNumber: 2, firstChapter: 8 },
    ]);
  });
});

describe("deriveVolumeRanges", () => {
  it("derives lastChapter from consecutive volumes", () => {
    const input = [
      { volumeNumber: 1, firstChapter: 1 },
      { volumeNumber: 2, firstChapter: 8 },
      { volumeNumber: 3, firstChapter: 17 },
    ];
    expect(deriveVolumeRanges(input, 25)).toEqual([
      { volumeNumber: 1, firstChapter: 1, lastChapter: 7 },
      { volumeNumber: 2, firstChapter: 8, lastChapter: 16 },
      { volumeNumber: 3, firstChapter: 17, lastChapter: 25 },
    ]);
  });

  it("uses latestChapter for the final volume", () => {
    const input = [{ volumeNumber: 1, firstChapter: 1 }];
    expect(deriveVolumeRanges(input, 100)).toEqual([
      { volumeNumber: 1, firstChapter: 1, lastChapter: 100 },
    ]);
  });

  it("falls back to firstChapter when no latestChapter", () => {
    const input = [{ volumeNumber: 1, firstChapter: 1 }];
    expect(deriveVolumeRanges(input)).toEqual([
      { volumeNumber: 1, firstChapter: 1, lastChapter: 1 },
    ]);
  });

  it("returns empty array for empty input", () => {
    expect(deriveVolumeRanges([])).toEqual([]);
  });
});
```

- [ ] **Step 6: Write tests for `applyWikipediaVolumeMappings`**

Append:

```typescript
describe("applyWikipediaVolumeMappings", () => {
  const mappings = [
    { volumeNumber: 1, firstChapter: 1, lastChapter: 7 },
    { volumeNumber: 2, firstChapter: 8, lastChapter: 16 },
  ];

  it("assigns volume to chapters within a mapped range", () => {
    const chapters = [
      {
        chapterNumber: "3",
        volume: null,
        releaseDate: null,
        scanlationGroup: null,
        fromExpansion: false,
      },
      {
        chapterNumber: "10",
        volume: null,
        releaseDate: null,
        scanlationGroup: null,
        fromExpansion: false,
      },
    ];
    const result = applyWikipediaVolumeMappings(chapters, mappings);
    expect(result[0].volume).toBe("1");
    expect(result[1].volume).toBe("2");
  });

  it("overrides existing MangaUpdates volume with Wikipedia data", () => {
    const chapters = [
      {
        chapterNumber: "3",
        volume: "99",
        releaseDate: null,
        scanlationGroup: null,
        fromExpansion: false,
      },
    ];
    const result = applyWikipediaVolumeMappings(chapters, mappings);
    expect(result[0].volume).toBe("1");
  });

  it("leaves non-numeric chapters ungrouped", () => {
    const chapters = [
      {
        chapterNumber: "Oneshot",
        volume: null,
        releaseDate: null,
        scanlationGroup: null,
        fromExpansion: false,
      },
    ];
    const result = applyWikipediaVolumeMappings(chapters, mappings);
    expect(result[0].volume).toBeNull();
  });

  it("leaves chapters beyond mapped range ungrouped", () => {
    const chapters = [
      {
        chapterNumber: "50",
        volume: null,
        releaseDate: null,
        scanlationGroup: null,
        fromExpansion: false,
      },
    ];
    const result = applyWikipediaVolumeMappings(chapters, mappings);
    expect(result[0].volume).toBeNull();
  });

  it("handles decimal chapter numbers", () => {
    const chapters = [
      {
        chapterNumber: "3.5",
        volume: null,
        releaseDate: null,
        scanlationGroup: null,
        fromExpansion: false,
      },
    ];
    const result = applyWikipediaVolumeMappings(chapters, mappings);
    expect(result[0].volume).toBe("1");
  });

  it("does not mutate original chapters array", () => {
    const chapters = [
      {
        chapterNumber: "3",
        volume: null,
        releaseDate: null,
        scanlationGroup: null,
        fromExpansion: false,
      },
    ];
    applyWikipediaVolumeMappings(chapters, mappings);
    expect(chapters[0].volume).toBeNull();
  });
});
```

- [ ] **Step 7: Run tests to verify they fail**

Run: `bun run test -- src/__tests__/wikipedia.test.ts`

Expected: FAIL -- all imports missing since `src/server/wikipedia.ts` does not exist yet.

- [ ] **Step 8: Commit test file**

```bash
git add src/__tests__/wikipedia.test.ts
git commit -m "test: add Wikipedia wikitext parser tests"
```

---

### Task 2: Wikipedia Wikitext Parser -- Implementation

**Files:**

- Create: `src/server/wikipedia.ts`

- [ ] **Step 1: Create the parser with all pure functions and API client**

```typescript
import { createApiFetcher } from "./api-cache";
import { parseChapterNumber } from "./manga-chapter-utils";

// --- Types ---

export type WikipediaVolumeMapping = {
  volumeNumber: number;
  firstChapter: number;
  lastChapter: number;
};

type WikiSearchResult = {
  query?: {
    search: Array<{ title: string }>;
  };
};

type WikiParseResult = {
  parse?: {
    wikitext?: { "*": string };
  };
};

// --- Pure Parser Functions ---

/**
 * Extract {{Graphic novel list ...}} template blocks from wikitext,
 * skipping {{Graphic novel list/header}} and {{Graphic novel list/footer}}.
 * Handles nested templates by tracking brace depth.
 */
export function extractGraphicNovelListBlocks(wikitext: string): string[] {
  const blocks: string[] = [];
  const lowerText = wikitext.toLowerCase();
  const marker = "{{graphic novel list";
  let searchFrom = 0;

  while (true) {
    const start = lowerText.indexOf(marker, searchFrom);
    if (start === -1) break;

    // Skip header/footer variants
    const afterMarker = lowerText[start + marker.length];
    if (afterMarker === "/") {
      searchFrom = start + marker.length;
      continue;
    }

    // Find matching closing }} by tracking brace depth
    let depth = 0;
    let i = start;
    while (i < wikitext.length) {
      if (wikitext[i] === "{" && wikitext[i + 1] === "{") {
        depth++;
        i += 2;
      } else if (wikitext[i] === "}" && wikitext[i + 1] === "}") {
        depth--;
        if (depth === 0) {
          blocks.push(wikitext.slice(start, i + 2));
          break;
        }
        i += 2;
      } else {
        i++;
      }
    }

    searchFrom = i || start + 1;
  }

  return blocks;
}

/**
 * Extract the VolumeNumber parameter from a {{Graphic novel list}} block.
 */
export function extractVolumeNumber(block: string): number | null {
  const match = block.match(/\|\s*VolumeNumber\s*=\s*(\d+)/i);
  return match ? parseInt(match[1], 10) : null;
}

/**
 * Extract the first chapter number from a {{Graphic novel list}} block.
 * Supports four wikitext formats:
 *  1. {{Numbered list|start=N}} (Chainsaw Man, One Piece, JJK, Dandadan)
 *  2. <li value="N"> (Naruto)
 *  3. * NNN. "Title" (Bleach, FMA, Dragon Ball)
 *  4. Range like "Mission: X-Y" (Spy x Family)
 */
export function extractFirstChapterNumber(block: string): number | null {
  // Strategy 1: {{Numbered list|start=N}}
  const numberedList = block.match(/\{\{Numbered list\|start=(\d+)/i);
  if (numberedList) return parseInt(numberedList[1], 10);

  // Strategy 2: <li value="N">
  const liValue = block.match(/<li\s+value="(\d+)">/i);
  if (liValue) return parseInt(liValue[1], 10);

  // Strategy 3: Bullet list * NNN.
  const bullet = block.match(/\*\s*(\d+)\./);
  if (bullet) return parseInt(bullet[1], 10);

  // Strategy 4: Hash list # NNN.
  const hash = block.match(/#\s*"?(\d+)\./);
  if (hash) return parseInt(hash[1], 10);

  // Strategy 5: Range pattern (Mission: X-Y, Chapter X-Y)
  const range = block.match(/(?:Mission|Chapter)[:\s]*(\d+)/i);
  if (range) return parseInt(range[1], 10);

  return null;
}

/**
 * Extract {{further|...}} and {{main|...}} subpage links from wikitext.
 */
export function extractSubpageLinks(wikitext: string): string[] {
  const links: string[] = [];
  const regex = /\{\{(?:further|main)\|([^}]+)\}\}/gi;
  let match;
  while ((match = regex.exec(wikitext)) !== null) {
    links.push(match[1].trim());
  }
  return links;
}

/**
 * Extract volume number and first chapter from all {{Graphic novel list}}
 * blocks in a page's wikitext.
 */
export function extractVolumesFromWikitext(
  wikitext: string,
): { volumeNumber: number; firstChapter: number }[] {
  const blocks = extractGraphicNovelListBlocks(wikitext);
  const volumes: { volumeNumber: number; firstChapter: number }[] = [];

  for (const block of blocks) {
    const volumeNumber = extractVolumeNumber(block);
    const firstChapter = extractFirstChapterNumber(block);
    if (volumeNumber !== null && firstChapter !== null) {
      volumes.push({ volumeNumber, firstChapter });
    }
  }

  return volumes;
}

/**
 * Convert a list of {volumeNumber, firstChapter} into full ranges
 * by deriving lastChapter from the next volume's firstChapter - 1.
 * The final volume extends to latestChapter (or its own firstChapter).
 */
export function deriveVolumeRanges(
  volumes: { volumeNumber: number; firstChapter: number }[],
  latestChapter?: number,
): WikipediaVolumeMapping[] {
  if (volumes.length === 0) return [];

  const sorted = [...volumes].sort((a, b) => a.volumeNumber - b.volumeNumber);

  return sorted.map((vol, i) => ({
    volumeNumber: vol.volumeNumber,
    firstChapter: vol.firstChapter,
    lastChapter:
      i < sorted.length - 1
        ? sorted[i + 1].firstChapter - 1
        : (latestChapter ?? vol.firstChapter),
  }));
}

/**
 * Apply Wikipedia volume mappings to deduplicated chapters.
 * Overrides the volume field for chapters that fall within a mapped range.
 * Non-numeric chapters and chapters outside all ranges are left unchanged.
 * Returns a new array (does not mutate input).
 */
export function applyWikipediaVolumeMappings<
  T extends { chapterNumber: string; volume: string | null },
>(chapters: T[], mappings: WikipediaVolumeMapping[]): T[] {
  return chapters.map((ch) => {
    const num = parseChapterNumber(ch.chapterNumber);
    if (num === null) return { ...ch };

    const match = mappings.find(
      (m) => num >= m.firstChapter && num <= m.lastChapter,
    );
    if (!match) return { ...ch };

    return { ...ch, volume: String(match.volumeNumber) };
  });
}

// --- API Client ---

const WIKIPEDIA_API = "https://en.wikipedia.org/w/api.php";
const REQUEST_TIMEOUT_MS = 15_000;

const wikipediaFetcher = createApiFetcher({
  name: "wikipedia",
  cache: { ttlMs: 10 * 60 * 1000, maxEntries: 500 },
  rateLimit: { maxRequests: 1, windowMs: 1000 },
  retry: { maxRetries: 3, baseDelayMs: 2000 },
});

async function wikipediaFetch<T>(
  cacheKey: string,
  params: URLSearchParams,
): Promise<T> {
  return wikipediaFetcher.fetch<T>(cacheKey, async () => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(`${WIKIPEDIA_API}?${params}`, {
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(
          `Wikipedia API error: ${response.status} ${response.statusText}`,
        );
      }
      return (await response.json()) as T;
    } finally {
      clearTimeout(timeoutId);
    }
  });
}

/**
 * Search Wikipedia for a manga's "List of X chapters" page.
 * Returns the page title or null if not found.
 */
async function searchChapterListPage(
  mangaTitle: string,
): Promise<string | null> {
  const params = new URLSearchParams({
    action: "query",
    list: "search",
    srsearch: `intitle:"List of" intitle:"chapters" "${mangaTitle}"`,
    srlimit: "5",
    format: "json",
  });

  const data = await wikipediaFetch<WikiSearchResult>(
    `wiki-search:${mangaTitle}`,
    params,
  );

  const results = data.query?.search ?? [];
  const match = results.find(
    (r) =>
      r.title.toLowerCase().includes("chapters") &&
      r.title.toLowerCase().includes(mangaTitle.toLowerCase()),
  );

  return match?.title ?? null;
}

/**
 * Fetch the wikitext content of a Wikipedia page.
 */
async function fetchPageWikitext(pageTitle: string): Promise<string> {
  const params = new URLSearchParams({
    action: "parse",
    page: pageTitle,
    prop: "wikitext",
    format: "json",
  });

  const data = await wikipediaFetch<WikiParseResult>(
    `wiki-page:${pageTitle}`,
    params,
  );

  return data.parse?.wikitext?.["*"] ?? "";
}

/**
 * Deduplicate volumes by number, keeping the first occurrence.
 */
function deduplicateVolumes(
  volumes: { volumeNumber: number; firstChapter: number }[],
): { volumeNumber: number; firstChapter: number }[] {
  const seen = new Map<
    number,
    { volumeNumber: number; firstChapter: number }
  >();
  for (const v of volumes) {
    if (!seen.has(v.volumeNumber)) {
      seen.set(v.volumeNumber, v);
    }
  }
  return [...seen.values()];
}

/**
 * Get Wikipedia volume mappings for a manga series.
 * Searches for the chapter list page, handles subpages, parses wikitext.
 *
 * Returns the mappings and page title, or null if no page found
 * or no volumes could be parsed.
 */
export async function getWikipediaVolumeMappings(
  mangaTitle: string,
  latestChapter?: number,
): Promise<{
  mappings: WikipediaVolumeMapping[];
  pageTitle: string;
} | null> {
  const pageTitle = await searchChapterListPage(mangaTitle);
  if (!pageTitle) return null;

  const wikitext = await fetchPageWikitext(pageTitle);

  // Check for {{Graphic novel list}} on main page
  const hasTemplates = wikitext.toLowerCase().includes("{{graphic novel list");
  const subpages = extractSubpageLinks(wikitext);

  if (!hasTemplates && subpages.length === 0) return null;

  const allVolumes: { volumeNumber: number; firstChapter: number }[] = [];

  // Parse main page if it has templates
  if (hasTemplates) {
    allVolumes.push(...extractVolumesFromWikitext(wikitext));
  }

  // Follow subpages
  for (const subpage of subpages) {
    const subWikitext = await fetchPageWikitext(subpage);
    allVolumes.push(...extractVolumesFromWikitext(subWikitext));
  }

  const mappings = deriveVolumeRanges(
    deduplicateVolumes(allVolumes),
    latestChapter,
  );
  return mappings.length > 0 ? { mappings, pageTitle } : null;
}
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `bun run test -- src/__tests__/wikipedia.test.ts`

Expected: All tests PASS.

- [ ] **Step 3: Commit**

```bash
git add src/server/wikipedia.ts src/__tests__/wikipedia.test.ts
git commit -m "feat: add Wikipedia wikitext parser for manga volume mappings"
```

---

### Task 3: Schema Changes and Migration

**Files:**

- Modify: `src/db/schema/manga.ts`

- [ ] **Step 1: Add `wikipediaPageTitle` column to `manga` table**

In `src/db/schema/manga.ts`, add after the `metadataUpdatedAt` column (line 34):

```typescript
    wikipediaPageTitle: text("wikipedia_page_title"),
```

- [ ] **Step 2: Add `mappingSource` column to `mangaVolumes` table**

In `src/db/schema/manga.ts`, add after the `monitored` column in `mangaVolumes` (line 48):

```typescript
    mappingSource: text("mapping_source").notNull().default("mangaupdates"),
```

- [ ] **Step 3: Generate the Drizzle migration**

Run: `bun run db:generate`

Expected: A new migration SQL file is created in the `drizzle/` directory with ALTER TABLE statements adding the two new columns.

- [ ] **Step 4: Apply the migration and backfill ungrouped volumes**

Run: `bun run db:migrate`

Expected: Migration applies successfully.

Then backfill existing ungrouped volumes. Open the SQLite database and run:

```sql
UPDATE manga_volumes SET mapping_source = 'none' WHERE volume_number IS NULL;
```

This sets the correct mapping source on pre-existing ungrouped volumes.

- [ ] **Step 5: Commit**

```bash
git add src/db/schema/manga.ts drizzle/
git commit -m "feat: add Wikipedia volume mapping schema columns"
```

---

### Task 4: Integrate Wikipedia into Import Flow

**Files:**

- Modify: `src/server/manga-import.ts`

- [ ] **Step 1: Add imports for Wikipedia functions**

At the top of `src/server/manga-import.ts`, add after the existing imports (after line 28):

```typescript
import {
  getWikipediaVolumeMappings,
  applyWikipediaVolumeMappings,
} from "./wikipedia";
```

- [ ] **Step 2: Update `insertVolumesAndChapters` to accept `mappingSource`**

Change the function signature at line 203 from:

```typescript
function insertVolumesAndChapters(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  mangaId: number,
  volumeGroups: Map<number | null, DeduplicatedChapter[]>,
  monitorOption: "all" | "future" | "missing" | "none",
  // oxlint-disable-next-line no-empty-function -- intentional no-op default
  updateProgress: (message: string) => void = () => {},
): { volumesAdded: number; chaptersAdded: number } {
```

To:

```typescript
function insertVolumesAndChapters(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  mangaId: number,
  volumeGroups: Map<number | null, DeduplicatedChapter[]>,
  monitorOption: "all" | "future" | "missing" | "none",
  mappingSource: "wikipedia" | "mangaupdates",
  // oxlint-disable-next-line no-empty-function -- intentional no-op default
  updateProgress: (message: string) => void = () => {},
): { volumesAdded: number; chaptersAdded: number } {
```

- [ ] **Step 3: Use `mappingSource` in volume insert calls**

Update the volume insert at line 219 to include `mappingSource`:

```typescript
const volumeRow = tx
  .insert(mangaVolumes)
  .values({
    mangaId,
    volumeNumber,
    title: volumeTitle(volumeNumber),
    monitored: true,
    mappingSource: volumeNumber === null ? "none" : mappingSource,
  })
  .returning()
  .get();
```

Also update the empty-chapters fallback insert (around line 252):

```typescript
tx.insert(mangaVolumes)
  .values({
    mangaId,
    volumeNumber: null,
    title: null,
    monitored: true,
    mappingSource: "none",
  })
  .run();
```

- [ ] **Step 4: Add Wikipedia fetch to the import handler**

In `importMangaHandler` (around line 293), replace this section:

```typescript
// Deduplicate releases into unique chapters
const chapters = deduplicateReleases(releases);
updateProgress(`Processing ${chapters.length} releases...`);

// Group into volumes
const volumeGroups = groupChaptersIntoVolumes(chapters);
```

With:

```typescript
// Deduplicate releases into unique chapters
let chapters = deduplicateReleases(releases);
updateProgress(`Processing ${chapters.length} releases...`);

// Fetch Wikipedia volume mappings
let wikipediaPageTitle: string | null = null;
let mappingSource: "wikipedia" | "mangaupdates" = "mangaupdates";
try {
  updateProgress("Fetching volume mappings from Wikipedia...");
  const wikiResult = await getWikipediaVolumeMappings(
    data.title,
    data.latestChapter ?? detail.latest_chapter ?? undefined,
  );
  if (wikiResult) {
    chapters = applyWikipediaVolumeMappings(chapters, wikiResult.mappings);
    wikipediaPageTitle = wikiResult.pageTitle;
    mappingSource = "wikipedia";
  }
} catch {
  // Wikipedia fetch failed -- continue with MangaUpdates-only data
}

// Group into volumes
const volumeGroups = groupChaptersIntoVolumes(chapters);
```

- [ ] **Step 5: Pass `mappingSource` to `insertVolumesAndChapters`**

Update the call at line 345 from:

```typescript
const { volumesAdded, chaptersAdded } = insertVolumesAndChapters(
  tx,
  mangaRow.id,
  volumeGroups,
  data.monitorOption,
  updateProgress,
);
```

To:

```typescript
const { volumesAdded, chaptersAdded } = insertVolumesAndChapters(
  tx,
  mangaRow.id,
  volumeGroups,
  data.monitorOption,
  mappingSource,
  updateProgress,
);
```

- [ ] **Step 6: Store `wikipediaPageTitle` on the manga row**

In the `manga` insert values (around line 316), add `wikipediaPageTitle` after `metadataUpdatedAt`:

```typescript
        metadataUpdatedAt: new Date(),
        wikipediaPageTitle,
```

- [ ] **Step 7: Verify build**

Run: `bun run build`

Expected: Build succeeds with no type errors.

- [ ] **Step 8: Commit**

```bash
git add src/server/manga-import.ts
git commit -m "feat: integrate Wikipedia volume mappings into manga import"
```

---

### Task 5: Integrate Wikipedia into Refresh Flow

**Files:**

- Modify: `src/server/manga-import.ts`

- [ ] **Step 1: Add `WikipediaVolumeMapping` type import**

Update the Wikipedia import at the top of the file to also include the type:

```typescript
import {
  getWikipediaVolumeMappings,
  applyWikipediaVolumeMappings,
  type WikipediaVolumeMapping,
} from "./wikipedia";
```

- [ ] **Step 2: Add Wikipedia mapping parameter to `insertNewChapters`**

Update the function signature from:

```typescript
function insertNewChapters(
  mangaId: number,
  releases: MangaUpdatesRelease[],
  monitorOption: "all" | "future" | "missing" | "none",
): number {
```

To:

```typescript
function insertNewChapters(
  mangaId: number,
  releases: MangaUpdatesRelease[],
  monitorOption: "all" | "future" | "missing" | "none",
  wikiMappings: WikipediaVolumeMapping[] | null = null,
): number {
```

- [ ] **Step 3: Apply Wikipedia mappings after deduplication in `insertNewChapters`**

After `const chapters = deduplicateReleases(releases);` (line 422), add:

```typescript
const mappedChapters = wikiMappings
  ? applyWikipediaVolumeMappings(chapters, wikiMappings)
  : chapters;
```

Then replace the three references to `chapters` in the rest of `insertNewChapters` with `mappedChapters`:

1. The ungrouped-chapter reassignment loop (line 460): `for (const ch of mappedChapters) {`
2. The new chapters filter (line 506): `const newChapters = mappedChapters.filter(`
3. Keep the `existingByNumber` loop using `chapters` since it uses normalized chapter numbers from raw data which is fine.

Actually the `existingByNumber` map is built from DB rows, not `chapters`. So just replace these two:

```typescript
  // Line 460 - reassignment loop
  for (const ch of mappedChapters) {

  // Line 506 - new chapters filter
  const newChapters = mappedChapters.filter(
    (c) => !existingChapterNumbers.has(c.chapterNumber),
  );
```

- [ ] **Step 4: Set `mappingSource` on new volumes in `insertNewChapters`**

In the volume creation for ungrouped-chapter reassignment (around line 487), add `mappingSource`:

```typescript
if (!targetVolume) {
  targetVolume = db
    .insert(mangaVolumes)
    .values({
      mangaId,
      volumeNumber: volumeNum,
      title: volumeTitle(volumeNum),
      monitored: true,
      mappingSource: wikiMappings ? "wikipedia" : "mangaupdates",
    })
    .returning({ id: mangaVolumes.id })
    .get();
}
```

In the new-chapter volume creation (around line 535), add `mappingSource`:

```typescript
if (!volumeRow) {
  volumeRow = db
    .insert(mangaVolumes)
    .values({
      mangaId,
      volumeNumber,
      title: volumeTitle(volumeNumber),
      monitored: true,
      mappingSource:
        volumeNumber === null
          ? "none"
          : wikiMappings
            ? "wikipedia"
            : "mangaupdates",
    })
    .returning()
    .get();
}
```

- [ ] **Step 5: Add Wikipedia fetch to `refreshMangaInternal`**

In `refreshMangaInternal` (line 574), after the `db.update(manga).set(...)` call that updates metadata (around line 614), add:

```typescript
// Fetch Wikipedia volume mappings if never fetched or stale (7+ days)
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const lastFetch = mangaRow.metadataUpdatedAt
  ? new Date(mangaRow.metadataUpdatedAt).getTime()
  : 0;
const wikipediaStale =
  !mangaRow.wikipediaPageTitle || Date.now() - lastFetch > SEVEN_DAYS_MS;

let wikiMappings: WikipediaVolumeMapping[] | null = null;
if (wikipediaStale) {
  try {
    const wikiResult = await getWikipediaVolumeMappings(
      mangaRow.title,
      detail.latest_chapter ?? mangaRow.latestChapter ?? undefined,
    );
    if (wikiResult) {
      wikiMappings = wikiResult.mappings;
      db.update(manga)
        .set({ wikipediaPageTitle: wikiResult.pageTitle })
        .where(eq(manga.id, mangaId))
        .run();
    }
  } catch {
    // Wikipedia fetch failed -- continue without
  }
}
```

- [ ] **Step 6: Pass `wikiMappings` to `insertNewChapters`**

Update the call from:

```typescript
const newChaptersAdded = insertNewChapters(mangaId, allReleases, monitorOption);
```

To:

```typescript
const newChaptersAdded = insertNewChapters(
  mangaId,
  allReleases,
  monitorOption,
  wikiMappings,
);
```

- [ ] **Step 7: Verify build**

Run: `bun run build`

Expected: Build succeeds with no type errors.

- [ ] **Step 8: Commit**

```bash
git add src/server/manga-import.ts
git commit -m "feat: integrate Wikipedia volume mappings into manga refresh"
```

---

### Task 6: Build Verification and Final Tests

**Files:**

- None (verification only)

- [ ] **Step 1: Run all unit tests**

Run: `bun run test`

Expected: All tests pass, including the new Wikipedia parser tests.

- [ ] **Step 2: Run production build**

Run: `bun run build`

Expected: Build succeeds with zero errors.

- [ ] **Step 3: Verify migration file is clean**

Run: `ls -la drizzle/ | tail -5`

Verify the latest migration file exists and contains the expected ALTER TABLE statements for `wikipedia_page_title` and `mapping_source`.

- [ ] **Step 4: Commit any remaining changes**

If the build or tests required fixes, commit them:

```bash
git add -A
git commit -m "fix: resolve build/test issues from Wikipedia integration"
```
