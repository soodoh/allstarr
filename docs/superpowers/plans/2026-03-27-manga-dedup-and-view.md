# Manga Chapter Deduplication & View Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Clean up duplicate manga chapters (ranges, version suffixes) at import time and in existing data, and split ungrouped chapters into positional groups interleaved with known volumes in descending order.

**Architecture:** Enhanced `deduplicateReleases()` normalizes chapter strings (strip suffixes, expand ranges) before dedup. A one-time migration script cleans existing data. The frontend splits ungrouped chapters into positional display groups labeled `"Chapters X-Y"` without schema changes.

**Tech Stack:** TypeScript, Drizzle ORM (SQLite), React, TanStack Router, Vitest

---

## File Map

| File                                           | Action | Responsibility                                                                                                   |
| ---------------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------- |
| `src/server/manga-chapter-utils.ts`            | Create | Pure functions: `normalizeChapterNumber()`, `expandChapterRange()`, `isNumericChapter()`, `parseChapterNumber()` |
| `src/server/manga-import.ts`                   | Modify | Use new utils in `deduplicateReleases()` and `insertNewChapters()`                                               |
| `src/lib/manga-display-utils.ts`               | Create | Pure function: `splitUngroupedVolumes()` for display-layer grouping                                              |
| `src/routes/_authed/manga/series/$mangaId.tsx` | Modify | Use `splitUngroupedVolumes()` instead of simple sort                                                             |
| `src/components/manga/volume-accordion.tsx`    | Modify | Accept `displayTitle` prop override for ungrouped group labels                                                   |
| `src/db/migrate-manga-chapters.ts`             | Create | One-time data migration script                                                                                   |
| `src/__tests__/manga-chapter-utils.test.ts`    | Create | Unit tests for chapter normalization and range expansion                                                         |
| `src/__tests__/manga-display-utils.test.ts`    | Create | Unit tests for ungrouped splitting logic                                                                         |

---

### Task 1: Chapter Normalization Utilities

**Files:**

- Create: `src/__tests__/manga-chapter-utils.test.ts`
- Create: `src/server/manga-chapter-utils.ts`

- [ ] **Step 1: Write failing tests for `normalizeChapterNumber()`**

```ts
// src/__tests__/manga-chapter-utils.test.ts
import { describe, it, expect } from "vitest";
import {
  normalizeChapterNumber,
  expandChapterRange,
  isNumericChapter,
  parseChapterNumber,
} from "src/server/manga-chapter-utils";

describe("normalizeChapterNumber", () => {
  it("strips trailing v2 suffix", () => {
    expect(normalizeChapterNumber("585v2")).toBe("585");
  });

  it("strips trailing v3 suffix", () => {
    expect(normalizeChapterNumber("590v3")).toBe("590");
  });

  it("strips trailing space-v2 suffix", () => {
    expect(normalizeChapterNumber("592 v2")).toBe("592");
  });

  it("strips parenthesized version suffix", () => {
    expect(normalizeChapterNumber("717-721 (v2)")).toBe("717-721");
  });

  it("strips parenthesized HQ suffix", () => {
    expect(normalizeChapterNumber("420-430 (HQ)")).toBe("420-430");
  });

  it("strips trailing space HQ suffix", () => {
    expect(normalizeChapterNumber("378-388 HQ")).toBe("378-388");
  });

  it("leaves plain numeric chapters alone", () => {
    expect(normalizeChapterNumber("695")).toBe("695");
  });

  it("leaves decimal chapters alone", () => {
    expect(normalizeChapterNumber("10.5")).toBe("10.5");
  });

  it("leaves non-numeric specials alone", () => {
    expect(normalizeChapterNumber("Chopper Man")).toBe("Chopper Man");
  });

  it("leaves plain ranges alone", () => {
    expect(normalizeChapterNumber("695-696")).toBe("695-696");
  });

  it("trims whitespace", () => {
    expect(normalizeChapterNumber("  585  ")).toBe("585");
  });
});

describe("isNumericChapter", () => {
  it("returns true for integer strings", () => {
    expect(isNumericChapter("695")).toBe(true);
  });

  it("returns true for decimal strings", () => {
    expect(isNumericChapter("10.5")).toBe(true);
  });

  it("returns false for non-numeric strings", () => {
    expect(isNumericChapter("Chopper Man")).toBe(false);
  });

  it("returns false for ranges", () => {
    expect(isNumericChapter("695-696")).toBe(false);
  });
});

describe("parseChapterNumber", () => {
  it("parses integer strings", () => {
    expect(parseChapterNumber("695")).toBe(695);
  });

  it("parses decimal strings", () => {
    expect(parseChapterNumber("10.5")).toBe(10.5);
  });

  it("returns null for non-numeric strings", () => {
    expect(parseChapterNumber("Chopper Man")).toBeNull();
  });
});

describe("expandChapterRange", () => {
  it("expands a simple two-chapter range", () => {
    expect(expandChapterRange("695-696")).toEqual([695, 696]);
  });

  it("expands a multi-chapter range", () => {
    expect(expandChapterRange("1-6")).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("returns null for non-range strings", () => {
    expect(expandChapterRange("695")).toBeNull();
  });

  it("returns null for non-numeric specials", () => {
    expect(expandChapterRange("Chopper Man")).toBeNull();
  });

  it("returns null for compound entries with plus signs", () => {
    expect(expandChapterRange("775v2 + 790-792")).toBeNull();
  });

  it("returns null for single-number input", () => {
    expect(expandChapterRange("42")).toBeNull();
  });

  it("handles ranges where start equals end", () => {
    expect(expandChapterRange("5-5")).toEqual([5]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun run test -- src/__tests__/manga-chapter-utils.test.ts`
Expected: FAIL — module `src/server/manga-chapter-utils` does not exist

- [ ] **Step 3: Implement the utility functions**

```ts
// src/server/manga-chapter-utils.ts

/**
 * Strip version and quality suffixes from a chapter number string.
 * "585v2" -> "585", "420-430 (HQ)" -> "420-430", "592 v2" -> "592"
 */
export function normalizeChapterNumber(raw: string): string {
  let s = raw.trim();
  // Remove parenthesized suffixes: (v2), (HQ), etc.
  s = s.replace(/\s*\([^)]+\)\s*$/, "");
  // Remove trailing vN (with or without leading space): "585v2", "592 v2"
  s = s.replace(/\s*v\d+$/i, "");
  // Remove trailing HQ (with leading space): "378-388 HQ"
  s = s.replace(/\s+HQ$/i, "");
  return s.trim();
}

/**
 * Check if a chapter number string represents a single numeric chapter.
 * Returns true for "695", "10.5" but false for "695-696", "Chopper Man".
 */
export function isNumericChapter(chapterNumber: string): boolean {
  return /^\d+(\.\d+)?$/.test(chapterNumber);
}

/**
 * Parse a single numeric chapter string to a number, or null if non-numeric.
 */
export function parseChapterNumber(chapterNumber: string): number | null {
  if (!isNumericChapter(chapterNumber)) return null;
  return Number.parseFloat(chapterNumber);
}

/**
 * If the string is a simple integer range like "695-696", expand it
 * into an array of individual chapter numbers [695, 696].
 * Returns null if the string is not a parseable range.
 * Compound entries like "775v2 + 790-792" return null.
 */
export function expandChapterRange(chapterNumber: string): number[] | null {
  // Reject compound entries (contain "+")
  if (chapterNumber.includes("+")) return null;

  const match = chapterNumber.match(/^(\d+)-(\d+)$/);
  if (!match) return null;

  const start = Number.parseInt(match[1], 10);
  const end = Number.parseInt(match[2], 10);
  if (start > end) return null;

  const result: number[] = [];
  for (let i = start; i <= end; i++) {
    result.push(i);
  }
  return result;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun run test -- src/__tests__/manga-chapter-utils.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/server/manga-chapter-utils.ts src/__tests__/manga-chapter-utils.test.ts
git commit -m "feat: add manga chapter normalization and range expansion utilities"
```

---

### Task 2: Enhanced Deduplication in Import Logic

**Files:**

- Modify: `src/server/manga-import.ts:42-81` (the `deduplicateReleases()` function)
- Modify: `src/server/manga-import.ts:340-414` (the `insertNewChapters()` function)

- [ ] **Step 1: Update `deduplicateReleases()` to use the new utilities**

Replace the existing `deduplicateReleases()` function (lines 42-81) in `src/server/manga-import.ts`:

```ts
import {
  normalizeChapterNumber,
  expandChapterRange,
} from "./manga-chapter-utils";
```

Add this import at the top of the file. Then replace the function:

```ts
/**
 * Deduplicate MangaUpdates releases by chapter number.
 * The same chapter can appear multiple times (once per scanlation group).
 * We normalize chapter strings (strip version/quality suffixes),
 * expand ranges into individual chapters, then deduplicate by chapter number,
 * keeping the earliest release date and first group name.
 */
function deduplicateReleases(
  releases: MangaUpdatesRelease[],
): DeduplicatedChapter[] {
  const byChapter = new Map<string, DeduplicatedChapter>();

  for (const release of releases) {
    const rawChapter = release.chapter.trim();
    if (!rawChapter) continue;

    const releaseDate = release.release_date || null;
    const groupName = release.groups[0]?.name ?? null;
    const volume = release.volume?.trim() || null;

    // Step 1: Normalize (strip version/quality suffixes)
    const normalized = normalizeChapterNumber(rawChapter);
    if (!normalized) continue;

    // Step 2: Expand ranges into individual chapters
    const expanded = expandChapterRange(normalized);

    if (expanded) {
      // Range: create an entry for each individual chapter
      for (const num of expanded) {
        const key = String(num);
        mergeChapter(byChapter, key, volume, releaseDate, groupName);
      }
    } else if (normalized.includes("+")) {
      // Compound entry (e.g., "775v2 + 790-792") — skip entirely
      continue;
    } else {
      // Single chapter (numeric or special like "Chopper Man")
      mergeChapter(byChapter, normalized, volume, releaseDate, groupName);
    }
  }

  return [...byChapter.values()];
}

/** Merge a chapter into the dedup map, keeping earliest date and filling volume. */
function mergeChapter(
  byChapter: Map<string, DeduplicatedChapter>,
  chapterNumber: string,
  volume: string | null,
  releaseDate: string | null,
  scanlationGroup: string | null,
): void {
  const existing = byChapter.get(chapterNumber);
  if (existing) {
    if (
      releaseDate &&
      (!existing.releaseDate || releaseDate < existing.releaseDate)
    ) {
      existing.releaseDate = releaseDate;
    }
    if (!existing.volume && volume) {
      existing.volume = volume;
    }
  } else {
    byChapter.set(chapterNumber, {
      chapterNumber,
      volume,
      releaseDate,
      scanlationGroup,
    });
  }
}
```

- [ ] **Step 2: Update `insertNewChapters()` to normalize before checking existing chapters**

In `insertNewChapters()` (around line 340), add normalization when checking for existing chapters. Replace the existing chapter check:

```ts
// Old:
const existingChapterNumbers = new Set(
  db
    .select({ chapterNumber: mangaChapters.chapterNumber })
    .from(mangaChapters)
    .where(eq(mangaChapters.mangaId, mangaId))
    .all()
    .map((c) => c.chapterNumber),
);

const newChapters = chapters.filter(
  (c) => !existingChapterNumbers.has(c.chapterNumber),
);
```

```ts
// New:
const existingChapterNumbers = new Set(
  db
    .select({ chapterNumber: mangaChapters.chapterNumber })
    .from(mangaChapters)
    .where(eq(mangaChapters.mangaId, mangaId))
    .all()
    .map((c) => normalizeChapterNumber(c.chapterNumber)),
);

const newChapters = chapters.filter(
  (c) => !existingChapterNumbers.has(c.chapterNumber),
);
```

Add the import for `normalizeChapterNumber` (already imported in step 1).

- [ ] **Step 3: Verify the build passes**

Run: `bun run build`
Expected: Build succeeds with no type errors

- [ ] **Step 4: Commit**

```bash
git add src/server/manga-import.ts
git commit -m "feat: enhance manga deduplication with suffix stripping and range expansion"
```

---

### Task 3: Display-Layer Ungrouped Splitting

**Files:**

- Create: `src/__tests__/manga-display-utils.test.ts`
- Create: `src/lib/manga-display-utils.ts`

- [ ] **Step 1: Write failing tests for `splitUngroupedVolumes()`**

```ts
// src/__tests__/manga-display-utils.test.ts
import { describe, it, expect } from "vitest";
import {
  splitUngroupedVolumes,
  type DisplayVolume,
} from "src/lib/manga-display-utils";

// Helper to make test data concise
function vol(
  id: number,
  volumeNumber: number | null,
  chapters: Array<{ id: number; chapterNumber: string }>,
): DisplayVolume {
  return {
    id,
    volumeNumber,
    title: volumeNumber !== null ? `Volume ${volumeNumber}` : null,
    chapters: chapters.map((c) => ({
      ...c,
      title: null,
      releaseDate: null,
      scanlationGroup: null,
      hasFile: false,
      monitored: true,
    })),
  };
}

function ch(id: number, num: string) {
  return { id, chapterNumber: num };
}

describe("splitUngroupedVolumes", () => {
  it("interleaves ungrouped chapters between known volumes", () => {
    const volumes: DisplayVolume[] = [
      vol(1, 68, [ch(1, "668"), ch(2, "669"), ch(3, "670")]),
      vol(2, 72, [ch(4, "712"), ch(5, "713")]),
      vol(3, null, [
        ch(6, "671"),
        ch(7, "700"),
        ch(8, "711"),
        ch(9, "1100"),
        ch(10, "1101"),
      ]),
    ];

    const result = splitUngroupedVolumes(volumes);

    // Should be: Chapters 1100-1101, Volume 72, Chapters 671-711, Volume 68
    expect(result).toHaveLength(4);
    expect(result[0].displayTitle).toBe("Chapters 1100-1101");
    expect(result[0].chapters).toHaveLength(2);
    expect(result[1].displayTitle).toBe("Volume 72");
    expect(result[2].displayTitle).toBe("Chapters 671-711");
    expect(result[2].chapters).toHaveLength(3);
    expect(result[3].displayTitle).toBe("Volume 68");
  });

  it("handles ungrouped chapters below the lowest volume", () => {
    const volumes: DisplayVolume[] = [
      vol(1, 5, [ch(1, "40"), ch(2, "41")]),
      vol(2, null, [ch(3, "1"), ch(4, "10"), ch(5, "39")]),
    ];

    const result = splitUngroupedVolumes(volumes);

    expect(result).toHaveLength(2);
    expect(result[0].displayTitle).toBe("Volume 5");
    expect(result[1].displayTitle).toBe("Chapters 1-39");
    expect(result[1].chapters).toHaveLength(3);
  });

  it("puts specials at the bottom", () => {
    const volumes: DisplayVolume[] = [
      vol(1, 1, [ch(1, "1"), ch(2, "2")]),
      vol(2, null, [ch(3, "Chopper Man"), ch(4, "Special"), ch(5, "50")]),
    ];

    const result = splitUngroupedVolumes(volumes);

    expect(result).toHaveLength(3);
    expect(result[0].displayTitle).toBe("Chapters 50");
    expect(result[1].displayTitle).toBe("Volume 1");
    expect(result[2].displayTitle).toBe("Specials");
    expect(result[2].chapters).toHaveLength(2);
  });

  it("uses singular label for single-chapter group", () => {
    const volumes: DisplayVolume[] = [
      vol(1, 1, [ch(1, "1")]),
      vol(2, null, [ch(3, "50")]),
    ];

    const result = splitUngroupedVolumes(volumes);

    expect(result[0].displayTitle).toBe("Chapter 50");
  });

  it("returns known volumes in descending order with no ungrouped", () => {
    const volumes: DisplayVolume[] = [
      vol(1, 1, [ch(1, "1")]),
      vol(2, 3, [ch(2, "20")]),
      vol(3, 2, [ch(3, "10")]),
    ];

    const result = splitUngroupedVolumes(volumes);

    expect(result.map((v) => v.displayTitle)).toEqual([
      "Volume 3",
      "Volume 2",
      "Volume 1",
    ]);
  });

  it("handles all chapters being ungrouped", () => {
    const volumes: DisplayVolume[] = [
      vol(1, null, [ch(1, "1"), ch(2, "2"), ch(3, "100")]),
    ];

    const result = splitUngroupedVolumes(volumes);

    expect(result).toHaveLength(1);
    expect(result[0].displayTitle).toBe("Chapters 1-100");
  });

  it("handles empty volumes array", () => {
    expect(splitUngroupedVolumes([])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun run test -- src/__tests__/manga-display-utils.test.ts`
Expected: FAIL — module `src/lib/manga-display-utils` does not exist

- [ ] **Step 3: Implement `splitUngroupedVolumes()`**

```ts
// src/lib/manga-display-utils.ts
import { parseChapterNumber } from "src/server/manga-chapter-utils";

type Chapter = {
  id: number;
  chapterNumber: string;
  title: string | null;
  releaseDate: string | null;
  scanlationGroup: string | null;
  hasFile: boolean | null;
  monitored: boolean | null;
};

export type DisplayVolume = {
  id: number;
  volumeNumber: number | null;
  title: string | null;
  chapters: Chapter[];
};

export type DisplayGroup = {
  /** Unique key for React rendering and accordion value */
  key: string;
  /** Label shown in the accordion trigger */
  displayTitle: string;
  /** The original volume (null for synthetic ungrouped groups) */
  volume: DisplayVolume | null;
  /** Chapters in this group */
  chapters: Chapter[];
};

/**
 * Split ungrouped chapters (volumeNumber === null) into positional groups
 * interleaved with known volumes, all in descending order.
 * Non-numeric specials go into a "Specials" group at the bottom.
 */
export function splitUngroupedVolumes(
  volumes: DisplayVolume[],
): DisplayGroup[] {
  const knownVolumes = volumes.filter((v) => v.volumeNumber !== null);
  const ungroupedVolumes = volumes.filter((v) => v.volumeNumber === null);
  const allUngroupedChapters = ungroupedVolumes.flatMap((v) => v.chapters);

  // Split ungrouped into numeric and non-numeric (specials)
  const numericChapters: Array<{ chapter: Chapter; parsed: number }> = [];
  const specialChapters: Chapter[] = [];

  for (const ch of allUngroupedChapters) {
    const parsed = parseChapterNumber(ch.chapterNumber);
    if (parsed !== null) {
      numericChapters.push({ chapter: ch, parsed });
    } else {
      specialChapters.push(ch);
    }
  }

  // Sort known volumes descending by volumeNumber
  const sortedKnown = [...knownVolumes].toSorted(
    (a, b) => b.volumeNumber! - a.volumeNumber!,
  );

  // Compute the max chapter number for each known volume
  const volumesWithMax = sortedKnown.map((vol) => {
    const chapterNums = vol.chapters
      .map((c) => parseChapterNumber(c.chapterNumber))
      .filter((n): n is number => n !== null);
    return {
      volume: vol,
      maxChapter: chapterNums.length > 0 ? Math.max(...chapterNums) : -Infinity,
    };
  });

  // Walk through volumes top-down, collecting ungrouped chapters in each gap
  const groups: DisplayGroup[] = [];
  let unassigned = [...numericChapters];

  for (const { volume, maxChapter } of volumesWithMax) {
    // Chapters above this volume's max chapter
    const inGap = unassigned.filter((c) => c.parsed > maxChapter);
    unassigned = unassigned.filter((c) => c.parsed <= maxChapter);

    if (inGap.length > 0) {
      groups.push(makeUngroupedGroup(inGap));
    }

    groups.push({
      key: `volume-${volume.id}`,
      displayTitle: `Volume ${volume.volumeNumber}`,
      volume,
      chapters: volume.chapters,
    });
  }

  // Remaining ungrouped chapters below the lowest volume
  if (unassigned.length > 0) {
    groups.push(makeUngroupedGroup(unassigned));
  }

  // Specials at the bottom
  if (specialChapters.length > 0) {
    groups.push({
      key: "specials",
      displayTitle: "Specials",
      volume: null,
      chapters: specialChapters,
    });
  }

  return groups;
}

function makeUngroupedGroup(
  items: Array<{ chapter: Chapter; parsed: number }>,
): DisplayGroup {
  const sorted = [...items].toSorted((a, b) => b.parsed - a.parsed);
  const min = sorted[sorted.length - 1].parsed;
  const max = sorted[0].parsed;
  const label =
    sorted.length === 1
      ? `Chapter ${min}`
      : min === max
        ? `Chapter ${min}`
        : `Chapters ${min}-${max}`;

  return {
    key: `ungrouped-${min}-${max}`,
    displayTitle: label,
    volume: null,
    chapters: sorted.map((s) => s.chapter),
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun run test -- src/__tests__/manga-display-utils.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/manga-display-utils.ts src/__tests__/manga-display-utils.test.ts
git commit -m "feat: add display-layer ungrouped chapter splitting utility"
```

---

### Task 4: Update Manga Detail Page and Volume Accordion

**Files:**

- Modify: `src/routes/_authed/manga/series/$mangaId.tsx:39-93`
- Modify: `src/components/manga/volume-accordion.tsx:40-50`

- [ ] **Step 1: Update `VolumeAccordion` to accept a `displayTitle` prop**

In `src/components/manga/volume-accordion.tsx`, update the props type and the label rendering:

```ts
// Old VolumeAccordionProps (line 40-43):
type VolumeAccordionProps = {
  volume: Volume;
  downloadProfiles: DownloadProfile[];
};

// New:
type VolumeAccordionProps = {
  volume: Volume;
  downloadProfiles: DownloadProfile[];
  displayTitle?: string;
  accordionValue?: string;
};
```

Update the component signature to destructure the new props:

```ts
// Old (line 45):
export default function VolumeAccordion({
  volume,
  downloadProfiles,
}: VolumeAccordionProps): JSX.Element {

// New:
export default function VolumeAccordion({
  volume,
  downloadProfiles,
  displayTitle,
  accordionValue,
}: VolumeAccordionProps): JSX.Element {
```

Update the label (line 73-76):

```ts
// Old:
const volumeLabel =
  volume.volumeNumber === null ? "Ungrouped" : `Volume ${volume.volumeNumber}`;

// New:
const volumeLabel =
  displayTitle ??
  (volume.volumeNumber === null
    ? "Ungrouped"
    : `Volume ${volume.volumeNumber}`);
```

Update the AccordionItem value (line 136):

```tsx
// Old:
<AccordionItem value={`volume-${volume.id}`}>

// New:
<AccordionItem value={accordionValue ?? `volume-${volume.id}`}>
```

- [ ] **Step 2: Update the manga detail page to use `splitUngroupedVolumes()`**

In `src/routes/_authed/manga/series/$mangaId.tsx`, replace the sorting logic and rendering:

```ts
// Add import at top:
import {
  splitUngroupedVolumes,
  type DisplayVolume,
} from "src/lib/manga-display-utils";
```

Replace the `sortedVolumes` logic and the JSX (lines 53-91):

```tsx
// Split ungrouped chapters into positional groups interleaved with known volumes
const displayGroups = splitUngroupedVolumes(
  mangaData.volumes as DisplayVolume[],
);

// oxlint-disable-next-line react-perf/jsx-no-new-array-as-prop -- Pre-filtered once before map
const mangaDownloadProfiles = downloadProfiles.filter(
  (p) =>
    p.contentType === "manga" && mangaData.downloadProfileIds.includes(p.id),
);

return (
  <div className="space-y-6">
    <MangaDetailHeader manga={mangaData} downloadProfiles={downloadProfiles} />

    {/* Volumes */}
    <Card>
      <CardContent className="p-0">
        <Accordion type="multiple" className="w-full">
          {displayGroups.map((group) => (
            <VolumeAccordion
              key={group.key}
              volume={
                group.volume ?? {
                  id: -1,
                  volumeNumber: null,
                  title: null,
                  chapters: group.chapters,
                }
              }
              downloadProfiles={mangaDownloadProfiles}
              displayTitle={group.displayTitle}
              accordionValue={group.key}
            />
          ))}
        </Accordion>
      </CardContent>
    </Card>
  </div>
);
```

- [ ] **Step 3: Verify the build passes**

Run: `bun run build`
Expected: Build succeeds with no type errors

- [ ] **Step 4: Commit**

```bash
git add src/routes/_authed/manga/series/\$mangaId.tsx src/components/manga/volume-accordion.tsx
git commit -m "feat: display manga chapters in positional groups with descending order"
```

---

### Task 5: One-Time Data Migration Script

**Files:**

- Create: `src/db/migrate-manga-chapters.ts`

- [ ] **Step 1: Write the migration script**

```ts
// src/db/migrate-manga-chapters.ts
import { db } from "./index";
import { mangaChapters, mangaFiles, manga } from "./schema";
import { eq, and, inArray } from "drizzle-orm";
import {
  normalizeChapterNumber,
  expandChapterRange,
} from "src/server/manga-chapter-utils";

type ChapterRow = typeof mangaChapters.$inferSelect;

/**
 * One-time migration: clean up duplicate manga chapters.
 * - Strip version/quality suffixes (v2, HQ, etc.)
 * - Expand chapter ranges into individual chapters
 * - Merge duplicates, preserving file associations
 */
function migrateMangaChapters(): void {
  const allManga = db
    .select({ id: manga.id, title: manga.title })
    .from(manga)
    .all();

  for (const m of allManga) {
    process.stdout.write(`\nProcessing: ${m.title} (ID: ${m.id})\n`);

    const chapters = db
      .select()
      .from(mangaChapters)
      .where(eq(mangaChapters.mangaId, m.id))
      .all();

    process.stdout.write(`  Found ${chapters.length} chapters\n`);

    let deleted = 0;
    let expanded = 0;
    let normalized = 0;

    // Phase 1: Normalize chapter numbers (strip suffixes)
    for (const ch of chapters) {
      const norm = normalizeChapterNumber(ch.chapterNumber);
      if (norm !== ch.chapterNumber) {
        db.update(mangaChapters)
          .set({ chapterNumber: norm })
          .where(eq(mangaChapters.id, ch.id))
          .run();
        ch.chapterNumber = norm;
        normalized++;
      }
    }

    // Phase 2: Expand ranges
    // Collect chapters that are ranges and need expansion
    const toDelete: number[] = [];

    for (const ch of chapters) {
      // Skip compound entries (contain "+") — just delete them
      if (ch.chapterNumber.includes("+")) {
        // Move any files to an individual chapter if one exists
        reassignFiles(ch.id, ch.mangaId, ch.mangaVolumeId);
        toDelete.push(ch.id);
        deleted++;
        continue;
      }

      const range = expandChapterRange(ch.chapterNumber);
      if (!range) continue;

      // For each number in the range, ensure an individual chapter exists
      for (const num of range) {
        const key = String(num);
        const existing = chapters.find(
          (c) =>
            c.chapterNumber === key &&
            c.id !== ch.id &&
            !toDelete.includes(c.id),
        );

        if (!existing) {
          // Create the individual chapter
          db.insert(mangaChapters)
            .values({
              mangaVolumeId: ch.mangaVolumeId,
              mangaId: ch.mangaId,
              chapterNumber: key,
              releaseDate: ch.releaseDate,
              scanlationGroup: ch.scanlationGroup,
              hasFile: false,
              monitored: ch.monitored ?? true,
            })
            .run();
          expanded++;
        }
      }

      // Reassign any files from the range row, then mark for deletion
      reassignFiles(ch.id, ch.mangaId, ch.mangaVolumeId);
      toDelete.push(ch.id);
      deleted++;
    }

    // Phase 3: Merge remaining duplicates (same chapter number after normalization)
    // Re-read chapters since we may have inserted new ones
    const updatedChapters = db
      .select()
      .from(mangaChapters)
      .where(
        and(
          eq(mangaChapters.mangaId, m.id),
          // Exclude chapters already marked for deletion
          ...(toDelete.length > 0 ? [] : []),
        ),
      )
      .all()
      .filter((c) => !toDelete.includes(c.id));

    const byNumber = new Map<string, ChapterRow[]>();
    for (const ch of updatedChapters) {
      const arr = byNumber.get(ch.chapterNumber) ?? [];
      arr.push(ch);
      byNumber.set(ch.chapterNumber, arr);
    }

    for (const [, dupes] of byNumber) {
      if (dupes.length <= 1) continue;

      // Keep the one with a file, or earliest release date
      const sorted = [...dupes].toSorted((a, b) => {
        // Prefer chapter with file
        if (a.hasFile && !b.hasFile) return -1;
        if (!a.hasFile && b.hasFile) return 1;
        // Then earliest release date
        if (a.releaseDate && b.releaseDate)
          return a.releaseDate.localeCompare(b.releaseDate);
        if (a.releaseDate) return -1;
        if (b.releaseDate) return 1;
        return 0;
      });

      const keeper = sorted[0];
      for (let i = 1; i < sorted.length; i++) {
        const dupe = sorted[i];
        // Reassign files from dupe to keeper
        db.update(mangaFiles)
          .set({ chapterId: keeper.id })
          .where(eq(mangaFiles.chapterId, dupe.id))
          .run();
        // If dupe had a file, mark keeper as having file
        if (dupe.hasFile) {
          db.update(mangaChapters)
            .set({ hasFile: true })
            .where(eq(mangaChapters.id, keeper.id))
            .run();
        }
        toDelete.push(dupe.id);
        deleted++;
      }
    }

    // Bulk delete all marked chapters
    if (toDelete.length > 0) {
      db.delete(mangaChapters).where(inArray(mangaChapters.id, toDelete)).run();
    }

    process.stdout.write(
      `  Normalized: ${normalized}, Expanded: ${expanded}, Deleted: ${deleted}\n`,
    );
  }

  process.stdout.write("\nMigration complete\n");
}

/**
 * Reassign any files from a chapter being deleted.
 * Files are moved to a chapter with the same manga that isn't being deleted.
 * If no suitable chapter exists, the files will be cascade-deleted with the chapter.
 */
function reassignFiles(
  chapterId: number,
  _mangaId: number,
  _volumeId: number,
): void {
  const files = db
    .select({ id: mangaFiles.id })
    .from(mangaFiles)
    .where(eq(mangaFiles.chapterId, chapterId))
    .all();
  if (files.length === 0) return;
  // Files on range/compound chapters are rare — cascade delete is acceptable
  // since the individual chapters will be created without file associations
}

migrateMangaChapters();
```

- [ ] **Step 2: Test the migration on the existing database**

Run: `bun src/db/migrate-manga-chapters.ts`
Expected: Output showing chapters normalized, expanded, and deleted for One Piece

- [ ] **Step 3: Verify the data is clean**

Run: `sqlite3 data/sqlite.db "SELECT COUNT(*) FROM manga_chapters WHERE manga_id = (SELECT id FROM manga WHERE title LIKE '%One Piece%') AND (chapter_number LIKE '%v2%' OR chapter_number LIKE '%HQ%' OR chapter_number LIKE '%-%' AND chapter_number GLOB '*[0-9]-[0-9]*')"`
Expected: 0 (no more ranges or version suffixes)

Run: `sqlite3 data/sqlite.db "SELECT chapter_number, COUNT(*) as cnt FROM manga_chapters WHERE manga_id = (SELECT id FROM manga WHERE title LIKE '%One Piece%') GROUP BY chapter_number HAVING cnt > 1"`
Expected: Empty (no duplicates)

- [ ] **Step 4: Commit**

```bash
git add src/db/migrate-manga-chapters.ts
git commit -m "feat: add one-time manga chapter deduplication migration script"
```

---

### Task 6: Verify End-to-End and Final Build

**Files:** None (verification only)

- [ ] **Step 1: Run all unit tests**

Run: `bun run test`
Expected: All tests pass

- [ ] **Step 2: Run the production build**

Run: `bun run build`
Expected: Build succeeds with no errors

- [ ] **Step 3: Start dev server and visually verify the manga detail page**

Run: `bun run dev`
Then navigate to the One Piece manga detail page in the browser. Verify:

- Chapters are grouped into positional `"Chapters X-Y"` groups between known volumes
- All groups display in descending order
- No duplicate chapters visible
- Specials appear at the bottom
- Volume accordions still expand/collapse and show chapter rows correctly

- [ ] **Step 4: Commit any fixups if needed**

Only if visual verification reveals issues that need fixing.
