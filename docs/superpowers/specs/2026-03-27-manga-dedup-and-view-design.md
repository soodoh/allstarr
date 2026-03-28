# Manga Chapter Deduplication & View Improvements

**Date:** 2026-03-27
**Status:** Approved

## Problem

Imported manga data from MangaUpdates has three quality issues:

1. **Chapter ranges stored as atomic entries** — `"695-696"` exists alongside individual `"695"` and `"696"` rows, creating duplicates
2. **Version/quality suffixes create duplicates** — `"585v2"`, `"420-430 (HQ)"` are separate rows alongside base chapters
3. **Ungrouped chapters** — 62% of One Piece's chapters have no volume assignment, dumped into a single massive "Ungrouped" accordion

The current view also doesn't match the TV shows pattern (descending order with meaningful grouping).

## Approach

**Import-time dedup + DB migration + display-layer grouping:**

- Deduplication at the data source (import and refresh)
- One-time migration to clean existing data
- Frontend splits ungrouped chapters into positional groups interleaved with known volumes

No schema changes required.

## Design

### 1. Enhanced Deduplication Logic

The `deduplicateReleases()` function in `manga-import.ts` gains three capabilities, applied in this order:

**Step 1 — Suffix stripping:** Before any dedup, normalize chapter strings by removing version/quality suffixes. Patterns to strip:

- `v2`, `v3`, etc. (e.g., `"585v2"` → `"585"`)
- `(v2)`, `(HQ)`, etc. (e.g., `"420-430 (HQ)"` → `"420-430"`)
- Trailing ` v2`, ` HQ` with space (e.g., `"592 v2"` → `"592"`)

**Step 2 — Range expansion:** When a chapter string is a simple numeric range like `"695-696"`, parse into start and end numbers. For each number, create an individual chapter entry using the range's release date and scanlation group. Discard the range entry.

- Only applies to clean numeric ranges: `"695-696"`, `"1-6"`, `"33-34"`
- After suffix stripping, ranges like `"420-430"` (was `"420-430 (HQ)"`) also get expanded
- Compound entries like `"775v2 + 790-792"` are discarded — they're malformed and the individual chapters should already exist

**Step 3 — Deduplication:** Same as current logic — deduplicate by chapter number, keep earliest release date, fill in volume if missing.

**Non-numeric passthrough:** Chapters like `"Chopper Man"`, `"Special"`, `"Jingi-nai Time"` skip suffix stripping and range expansion. They deduplicate normally by their exact string.

### 2. One-Time Database Migration

A run-once data migration script (not a Drizzle schema migration) that processes all imported manga:

For each manga:

1. **Load all chapters** with their volume associations and file links
2. **Normalize chapter numbers** — apply the same suffix stripping as the import dedup
3. **Expand range chapters** — parse ranges into individual chapters. If the individual chapter already exists, delete the range row. If not, create individual rows inheriting the range's metadata (release date, scanlation group, volume association), then delete the range row.
4. **Merge true duplicates** — when multiple rows resolve to the same chapter number after normalization, keep the row that has a file association (`hasFile = true` or linked manga files). If no files, keep the one with the earliest release date. Delete the rest.
5. **Preserve file associations** — when deleting a duplicate that has linked manga files, re-link those files to the surviving chapter row before deleting.

Edge cases:

- Compound entries (`"775v2 + 790-792"`) — deleted outright (individual chapters exist)
- Purely non-numeric chapters (`"Special"`, `"Chopper Man"`) — left untouched
- Range rows where no individual chapters exist — expanded into individual rows before the range row is deleted

### 3. Display-Layer Ungrouped Splitting

The manga detail page splits ungrouped chapters into positional groups interleaved with known volumes:

**Algorithm:**

1. Separate volumes into known (have `volumeNumber`) and ungrouped (`volumeNumber = null`)
2. Collect all ungrouped chapters and parse their chapter numbers to numeric values
3. Sort known volumes descending by `volumeNumber` — these define boundary points
4. For each boundary gap (above highest volume, between consecutive volumes, below lowest volume), collect ungrouped chapters whose numeric value falls in that range
5. Each collection becomes a display group labeled `"Chapters X-Y"` (using the actual min/max chapter numbers in the group)
6. Non-numeric special chapters become a `"Specials"` group at the bottom
7. Interleave known volumes and ungrouped groups into a single descending list

**Example (One Piece):**

```
Chapters 1131-1177     ← ungrouped, above volume 72
Volume 72              ← chapters 712-721
Chapters 671-711       ← ungrouped, between vol 68 and vol 72
Volume 68              ← chapters 668-670
Volume 67
...
Volume 1
Chapters 1-54          ← ungrouped, below volume 1
Specials               ← "Chopper Man", "Special", etc.
```

A group with a single chapter is labeled `"Chapter X"` (singular).

This logic lives in a utility function consumed by the route component. The existing `VolumeAccordion` component renders each group — it just receives a display title override for ungrouped groups.

### 4. Refresh Metadata Integration

Both `importMangaFn()` and `refreshMangaInternal()` already call `deduplicateReleases()`. The enhanced version handles everything automatically.

During refresh, before inserting new chapters, existing chapter numbers are checked using normalized values — so a new release of `"585v2"` won't create a duplicate if `"585"` already exists.

No changes to volume assignment during import/refresh — MangaUpdates provides nullable volume info on releases, and chapters without volume info go to the ungrouped volume (`volumeNumber = null`). The display layer handles positional grouping.

## Files Affected

- `src/server/manga-import.ts` — enhanced `deduplicateReleases()`, updated import/refresh logic
- `src/routes/_authed/manga/series/$mangaId.tsx` — ungrouped splitting logic (or extracted to utility)
- `src/components/manga/volume-accordion.tsx` — accept display title override for ungrouped groups
- New: `src/db/migrate-manga-chapters.ts` — one-time migration script

## Out of Scope

- Fetching volume→chapter mappings from external APIs (MangaUpdates doesn't provide this)
- Changing the manga schema
- Assigning inferred volume numbers to ungrouped chapters
