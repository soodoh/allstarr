# Manga Import Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce manga import time for large series (One Piece: 1-2 min → ~20-30 sec) by fixing an API pagination bug, adding early termination, and batching DB inserts.

**Architecture:** Three independent fixes in two files. The API client gets the `perpage` field name fixed and early termination logic. The import handler gets batch chapter inserts.

**Tech Stack:** TypeScript, Drizzle ORM, MangaUpdates REST API

---

## File Map

| File                          | Action | Responsibility                                                                  |
| ----------------------------- | ------ | ------------------------------------------------------------------------------- |
| `src/server/manga-updates.ts` | Modify | Fix `perpage` field, add early termination to pagination loop                   |
| `src/server/manga-import.ts`  | Modify | Batch chapter inserts in `insertVolumesAndChapters()` and `insertNewChapters()` |

---

### Task 1: Fix `perpage` field name in API request

**Files:**

- Modify: `src/server/manga-updates.ts:180-185`

- [ ] **Step 1: Fix the field name**

In `fetchReleasesPage()`, change the request body from:

```typescript
body: JSON.stringify({
  search: title,
  include_metadata: true,
  per_page: 100,
  page,
}),
```

to:

```typescript
body: JSON.stringify({
  search: title,
  include_metadata: true,
  perpage: 100,
  page,
}),
```

- [ ] **Step 2: Update the pagination increment**

In `getAllMangaUpdatesReleases()` at line 213, update the comment and increment value from 40 to 100:

```typescript
// Before
fetched += 40; // API returns max 40 per page regardless of per_page

// After
fetched += 100;
```

- [ ] **Step 3: Commit**

```bash
git add src/server/manga-updates.ts
git commit -m "fix: use correct perpage field name for MangaUpdates API"
```

---

### Task 2: Add early termination to pagination loop

**Files:**

- Modify: `src/server/manga-updates.ts:202-218`

- [ ] **Step 1: Add consecutive empty page tracking**

Replace the `getAllMangaUpdatesReleases` function body with:

```typescript
export async function getAllMangaUpdatesReleases(
  seriesId: number,
  title: string,
): Promise<MangaUpdatesRelease[]> {
  const allReleases: MangaUpdatesRelease[] = [];
  let page = 1;
  let fetched = 0;
  let totalHits = 0;
  let consecutiveEmpty = 0;
  do {
    const result = await fetchReleasesPage(title, seriesId, page);
    totalHits = result.totalHits;
    fetched += 100;
    allReleases.push(...result.results);
    consecutiveEmpty = result.results.length === 0 ? consecutiveEmpty + 1 : 0;
    page += 1;
  } while (fetched < totalHits && page <= 250 && consecutiveEmpty < 3);
  return allReleases;
}
```

The key change: track `consecutiveEmpty` — when 3 pages in a row return zero series matches after client-side filtering, stop. This avoids fetching dozens of tail pages that only contain releases for other series matching the title text.

- [ ] **Step 2: Commit**

```bash
git add src/server/manga-updates.ts
git commit -m "perf: early termination when paginating MangaUpdates releases"
```

---

### Task 3: Batch chapter inserts in `insertVolumesAndChapters`

**Files:**

- Modify: `src/server/manga-import.ts:210-240`

- [ ] **Step 1: Replace per-chapter inserts with batch insert**

Replace the inner loop in `insertVolumesAndChapters` (lines 226-239):

```typescript
// Before (individual inserts)
for (const chapter of volumeChapters) {
  tx.insert(mangaChapters)
    .values({
      mangaVolumeId: volumeRow.id,
      mangaId,
      chapterNumber: chapter.chapterNumber,
      releaseDate: chapter.releaseDate,
      scanlationGroup: chapter.scanlationGroup,
      hasFile: false,
      monitored: shouldMonitorChapter(monitorOption, chapter.releaseDate),
    })
    .run();
  chaptersAdded += 1;
}
```

with:

```typescript
// After (batch insert)
if (volumeChapters.length > 0) {
  tx.insert(mangaChapters)
    .values(
      volumeChapters.map((chapter) => ({
        mangaVolumeId: volumeRow.id,
        mangaId,
        chapterNumber: chapter.chapterNumber,
        releaseDate: chapter.releaseDate,
        scanlationGroup: chapter.scanlationGroup,
        hasFile: false,
        monitored: shouldMonitorChapter(monitorOption, chapter.releaseDate),
      })),
    )
    .run();
  chaptersAdded += volumeChapters.length;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/server/manga-import.ts
git commit -m "perf: batch chapter inserts in insertVolumesAndChapters"
```

---

### Task 4: Batch chapter inserts in `insertNewChapters`

**Files:**

- Modify: `src/server/manga-import.ts:534-547`

- [ ] **Step 1: Replace per-chapter inserts with batch insert**

Replace the inner loop in `insertNewChapters` (lines 534-547):

```typescript
// Before (individual inserts)
for (const chapter of volumeChapters) {
  db.insert(mangaChapters)
    .values({
      mangaVolumeId: volumeRow.id,
      mangaId,
      chapterNumber: chapter.chapterNumber,
      releaseDate: chapter.releaseDate,
      scanlationGroup: chapter.scanlationGroup,
      hasFile: false,
      monitored: shouldMonitorChapter(monitorOption, chapter.releaseDate),
    })
    .run();
  added += 1;
}
```

with:

```typescript
// After (batch insert)
if (volumeChapters.length > 0) {
  db.insert(mangaChapters)
    .values(
      volumeChapters.map((chapter) => ({
        mangaVolumeId: volumeRow.id,
        mangaId,
        chapterNumber: chapter.chapterNumber,
        releaseDate: chapter.releaseDate,
        scanlationGroup: chapter.scanlationGroup,
        hasFile: false,
        monitored: shouldMonitorChapter(monitorOption, chapter.releaseDate),
      })),
    )
    .run();
  added += volumeChapters.length;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/server/manga-import.ts
git commit -m "perf: batch chapter inserts in insertNewChapters"
```

---

### Task 5: Build verification

- [ ] **Step 1: Run build**

```bash
bun run build
```

Expected: Clean build with no type errors.

- [ ] **Step 2: Squash into single commit (optional)**

If all tasks were committed separately, optionally squash into a single commit:

```bash
git reset --soft HEAD~4
git commit -m "perf: optimize manga import for large series

- Fix perpage field name in MangaUpdates API request (was silently falling back to 40/page instead of 100)
- Add early termination after 3 consecutive empty pages during release pagination
- Batch chapter inserts instead of individual INSERT per chapter"
```
