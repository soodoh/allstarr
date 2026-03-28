# Manga Indexer Integration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire manga into the existing indexer/download pipeline so that monitored manga chapters are automatically searched, grabbed, and imported alongside books, movies, and TV episodes.

**Architecture:** Add `getWantedManga()` to detect monitored chapters without files, build manga-specific search queries, process them through existing indexer infrastructure, and handle completed download imports into `manga_files`. Follows the exact patterns established by `getWantedBooks()`, `processWantedBooks()`, and the book file import flow.

**Tech Stack:** Drizzle ORM (SQLite), Newznab/Torznab API, existing indexer infrastructure, download manager

**Spec:** `docs/superpowers/specs/2026-03-27-background-commands-design.md` (Workstream 4)

**Depends on:** Plan A (Background Commands) should be completed first. Can run in parallel with Plan B.

---

### Task 1: Add `lastSearchedAt` column to `manga_chapters`

**Files:**

- Modify: `src/db/schema/manga.ts`

- [ ] **Step 1: Add column**

In the `mangaChapters` table definition, add:

```typescript
lastSearchedAt: integer("last_searched_at"),
```

This follows the same pattern as `books.lastSearchedAt` used by `getWantedBooks()` and `sortBySearchPriority()`.

- [ ] **Step 2: Generate and apply migration**

Run: `bun run db:generate && bun run db:migrate`

- [ ] **Step 3: Commit**

```bash
git add src/db/schema/manga.ts drizzle/
git commit -m "feat: add lastSearchedAt column to manga_chapters"
```

---

### Task 2: Implement `getWantedManga()`

**Files:**

- Modify: `src/server/auto-search.ts`

- [ ] **Step 1: Add WantedMangaChapter type**

Add to the types section near the top of the file, after the existing `WantedEpisode` type:

```typescript
type WantedMangaChapter = {
  id: number;
  mangaId: number;
  mangaTitle: string;
  chapterNumber: string;
  volumeNumber: number | null;
  lastSearchedAt: number | null;
  profiles: ProfileInfo[];
  bestWeightByProfile: Map<number, number>;
};
```

- [ ] **Step 2: Add manga imports**

Add to the imports at the top of the file:

```typescript
import {
  manga,
  mangaChapters,
  mangaVolumes,
  mangaFiles,
  mangaDownloadProfiles,
} from "src/db/schema";
```

Some of these may already be imported — check and add only what's missing.

- [ ] **Step 3: Implement getMangaProfilesForChapter helper**

Add near the other `getEditionProfilesForBook` / `getMovieProfiles` helpers:

```typescript
function getMangaProfilesForChapter(mangaId: number): ProfileInfo[] {
  const rows = db
    .select({ profileId: mangaDownloadProfiles.downloadProfileId })
    .from(mangaDownloadProfiles)
    .where(eq(mangaDownloadProfiles.mangaId, mangaId))
    .all();

  if (rows.length === 0) return [];

  const profileIds = [...new Set(rows.map((r) => r.profileId))];
  return db
    .select()
    .from(downloadProfiles)
    .where(inArray(downloadProfiles.id, profileIds))
    .all()
    .map((p) => ({
      id: p.id,
      name: p.name,
      items: p.items,
      cutoff: p.cutoff,
      upgradeAllowed: p.upgradeAllowed,
      categories: p.categories,
      minCustomFormatScore: p.minCustomFormatScore,
      upgradeUntilCustomFormatScore: p.upgradeUntilCustomFormatScore,
    }));
}
```

- [ ] **Step 4: Implement getWantedManga**

Follow the exact pattern of `getWantedBooks()`:

```typescript
export function getWantedManga(chapterIds?: number[]): WantedMangaChapter[] {
  // Get all monitored chapters that have a download profile assigned to their parent manga
  const monitoredChapters = db
    .select({
      id: mangaChapters.id,
      mangaId: mangaChapters.mangaId,
      mangaTitle: manga.title,
      chapterNumber: mangaChapters.chapterNumber,
      volumeNumber: mangaVolumes.volumeNumber,
      hasFile: mangaChapters.hasFile,
      lastSearchedAt: mangaChapters.lastSearchedAt,
    })
    .from(mangaChapters)
    .innerJoin(manga, eq(manga.id, mangaChapters.mangaId))
    .leftJoin(mangaVolumes, eq(mangaVolumes.id, mangaChapters.mangaVolumeId))
    .where(
      and(
        eq(mangaChapters.monitored, true),
        sql`EXISTS (
          SELECT 1 FROM ${mangaDownloadProfiles}
          WHERE ${mangaDownloadProfiles.mangaId} = ${mangaChapters.mangaId}
        )`,
      ),
    )
    .all();

  const wanted: WantedMangaChapter[] = [];

  for (const chapter of monitoredChapters) {
    if (chapterIds) {
      const idSet = new Set(chapterIds);
      if (!idSet.has(chapter.id)) continue;
    }

    const profiles = getMangaProfilesForChapter(chapter.mangaId);
    if (profiles.length === 0) continue;

    // Exclude profiles with active tracked downloads
    const activeDownloads = db
      .select({ downloadProfileId: trackedDownloads.downloadProfileId })
      .from(trackedDownloads)
      .where(
        and(
          eq(trackedDownloads.mangaChapterId, chapter.id),
          inArray(trackedDownloads.state, [
            "queued",
            "downloading",
            "completed",
            "importPending",
          ]),
        ),
      )
      .all();

    const activeProfileIds = new Set(
      activeDownloads
        .map((d) => d.downloadProfileId)
        .filter((id): id is number => id !== null),
    );

    const availableProfiles = profiles.filter(
      (p) => !activeProfileIds.has(p.id),
    );
    if (availableProfiles.length === 0) continue;

    // Check existing files
    const existingFiles = db
      .select({ quality: mangaFiles.quality })
      .from(mangaFiles)
      .where(eq(mangaFiles.chapterId, chapter.id))
      .all();

    const bestWeightByProfile = new Map<number, number>();
    for (const profile of availableProfiles) {
      let best = 0;
      for (const file of existingFiles) {
        if (file.quality) {
          const qualityId =
            typeof file.quality === "object" &&
            "quality" in file.quality &&
            file.quality.quality
              ? file.quality.quality.id
              : 0;
          const weight = getProfileWeight(qualityId, profile.items);
          if (weight > best) best = weight;
        }
      }
      bestWeightByProfile.set(profile.id, best);
    }

    if (existingFiles.length === 0) {
      wanted.push({
        id: chapter.id,
        mangaId: chapter.mangaId,
        mangaTitle: chapter.mangaTitle,
        chapterNumber: chapter.chapterNumber,
        volumeNumber: chapter.volumeNumber,
        lastSearchedAt: chapter.lastSearchedAt,
        profiles: availableProfiles,
        bestWeightByProfile,
      });
      continue;
    }

    // Check if upgrade needed
    const upgradeNeeded = availableProfiles.some((profile) => {
      if (!profile.upgradeAllowed) return false;
      const cutoffWeight = getProfileWeight(profile.cutoff, profile.items);
      const bestWeight = bestWeightByProfile.get(profile.id) ?? 0;
      if (bestWeight < cutoffWeight) return true;
      if (profile.upgradeUntilCustomFormatScore > 0) return true;
      return false;
    });

    if (upgradeNeeded) {
      wanted.push({
        id: chapter.id,
        mangaId: chapter.mangaId,
        mangaTitle: chapter.mangaTitle,
        chapterNumber: chapter.chapterNumber,
        volumeNumber: chapter.volumeNumber,
        lastSearchedAt: chapter.lastSearchedAt,
        profiles: availableProfiles,
        bestWeightByProfile,
      });
    }
  }

  return wanted;
}
```

- [ ] **Step 5: Verify build**

Run: `bun run build`

- [ ] **Step 6: Commit**

```bash
git add src/server/auto-search.ts
git commit -m "feat: implement getWantedManga for manga chapter detection"
```

---

### Task 3: Implement manga search and grab

**Files:**

- Modify: `src/server/auto-search.ts`

- [ ] **Step 1: Add MangaSearchDetail type to AutoSearchResult**

Extend the `AutoSearchResult` type:

```typescript
export type AutoSearchResult = {
  searched: number;
  grabbed: number;
  errors: number;
  details: SearchDetail[];
  movieDetails: MovieSearchDetail[];
  episodeDetails: EpisodeSearchDetail[];
  mangaDetails: MangaSearchDetail[]; // NEW
};
```

Add the type:

```typescript
type MangaSearchDetail = {
  chapterId: number;
  mangaTitle: string;
  chapterNumber: string;
  searched: boolean;
  grabbed: boolean;
  releaseTitle?: string;
  error?: string;
};
```

Update the result initialization in `runAutoSearch` to include `mangaDetails: []`.

- [ ] **Step 2: Build manga search query function**

```typescript
function buildMangaSearchQuery(chapter: WantedMangaChapter): string {
  const title = chapter.mangaTitle;
  const ch = chapter.chapterNumber;
  if (chapter.volumeNumber !== null) {
    return `${title} Vol ${chapter.volumeNumber} Ch ${ch}`;
  }
  return `${title} Chapter ${ch}`;
}
```

- [ ] **Step 3: Implement searchAndGrabForManga**

Follow the pattern of `searchAndGrabForBook` / `searchAndGrabForMovie`. This function:

1. Builds the search query
2. Calls `searchNewznab` for each indexer
3. Coalesces and deduplicates results
4. Enriches releases with format/quality info
5. Scores and filters by profile
6. Grabs the best release

```typescript
async function searchAndGrabForManga(
  chapter: WantedMangaChapter,
  ixs: EnabledIndexers,
): Promise<MangaSearchDetail> {
  const query = buildMangaSearchQuery(chapter);
  const detail: MangaSearchDetail = {
    chapterId: chapter.id,
    mangaTitle: chapter.mangaTitle,
    chapterNumber: chapter.chapterNumber,
    searched: false,
    grabbed: false,
  };

  // Get categories from profiles (manga categories)
  const categories = getCategoriesForProfiles(chapter.profiles);
  if (categories.length === 0) {
    return detail;
  }

  // Search all indexers
  const allResults = await searchAllIndexers(ixs, query, categories);
  detail.searched = true;

  if (allResults.length === 0) return detail;

  // Deduplicate, enrich, and score
  const deduped = dedupeAndScoreReleases(allResults, chapter.profiles);

  // Find best release for each profile
  for (const profile of chapter.profiles) {
    const bestWeight = chapter.bestWeightByProfile.get(profile.id) ?? 0;
    const best = findBestReleaseForProfile(
      deduped,
      profile,
      bestWeight,
      getBlocklistedTitles(),
      getGrabbedGuids(),
    );

    if (best) {
      const grabbed = await grabRelease(best, profile, {
        mangaId: chapter.mangaId,
        mangaChapterId: chapter.id,
      });
      if (grabbed) {
        detail.grabbed = true;
        detail.releaseTitle = best.title;
        break;
      }
    }
  }

  return detail;
}
```

Note: The exact helper functions (`searchAllIndexers`, `getBlocklistedTitles`, `getGrabbedGuids`, `grabRelease`) may have different names in the codebase. Match the patterns used by `searchAndGrabForBook`.

- [ ] **Step 4: Implement processWantedManga**

```typescript
async function processWantedManga(
  wantedManga: WantedMangaChapter[],
  ixs: EnabledIndexers,
  result: AutoSearchResult,
  delay: number,
): Promise<void> {
  for (let i = 0; i < wantedManga.length; i += 1) {
    if (
      !anyIndexerAvailable(
        ixs.manual.map((m) => m.id),
        ixs.synced.map((s) => s.id),
      )
    ) {
      break;
    }

    const chapter = wantedManga[i];

    try {
      const detail = await searchAndGrabForManga(chapter, ixs);
      if (detail.searched) result.searched += 1;
      if (detail.grabbed) result.grabbed += 1;
      result.mangaDetails.push(detail);

      db.update(mangaChapters)
        .set({ lastSearchedAt: Date.now() })
        .where(eq(mangaChapters.id, chapter.id))
        .run();
    } catch (error) {
      result.errors += 1;
      result.mangaDetails.push({
        chapterId: chapter.id,
        mangaTitle: chapter.mangaTitle,
        chapterNumber: chapter.chapterNumber,
        searched: true,
        grabbed: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }

    if (i < wantedManga.length - 1) {
      await sleep(delay);
    }
  }
}
```

- [ ] **Step 5: Add manga to runAutoSearch**

In `runAutoSearch()`, after the episodes section, add:

```typescript
// ── Manga Chapters ──────────────────────────────────────────────────
if (!bookIds) {
  if (wantedEpisodes.length > 0) {
    await sleep(delayBetweenBooks);
  }

  const wantedManga = sortBySearchPriority(
    getWantedManga(),
    (m) => m.lastSearchedAt,
  );
  await processWantedManga(wantedManga, ixs, result, delayBetweenBooks);
}
```

- [ ] **Step 6: Verify build**

Run: `bun run build`

- [ ] **Step 7: Commit**

```bash
git add src/server/auto-search.ts
git commit -m "feat: add manga search, grab, and auto-search integration"
```

---

### Task 4: Handle manga download imports

**Files:**

- Modify: `src/server/file-import.ts` (or wherever `importCompletedDownload` handles content-type routing)
- Modify: `src/server/download-manager.ts` (if manga needs explicit routing)

- [ ] **Step 1: Add manga content type handling to download import**

When a completed download has `mangaId` and `mangaChapterId` set on the tracked download, the import flow should:

1. Scan the download output path for manga file extensions (`.cbz`, `.cbr`, `.pdf`, `.epub`)
2. Determine the destination path from the manga's root folder + naming template
3. Move/copy files to destination
4. Insert `manga_files` record:

```typescript
db.insert(mangaFiles)
  .values({
    chapterId: trackedDownload.mangaChapterId,
    path: destinationPath,
    size: fileSize,
    format: fileExtension, // cbz, cbr, pdf, epub
    quality: qualityMetadata,
    dateAdded: new Date().toISOString(),
  })
  .run();
```

5. Update `mangaChapters.hasFile = true`:

```typescript
db.update(mangaChapters)
  .set({ hasFile: true })
  .where(eq(mangaChapters.id, trackedDownload.mangaChapterId))
  .run();
```

6. Record history event:

```typescript
db.insert(history)
  .values({
    eventType: "mangaChapterImported",
    mangaId: trackedDownload.mangaId,
    mangaChapterId: trackedDownload.mangaChapterId,
    data: { title: mangaTitle, chapter: chapterNumber, format: fileExtension },
  })
  .run();
```

The exact implementation depends on how `importCompletedDownload` is structured. Follow the existing pattern for books — the file import module likely routes based on which entity IDs are present on the tracked download.

- [ ] **Step 2: Add manga file extensions to scan configuration**

Ensure manga file extensions (`.cbz`, `.cbr`) are recognized by the file scanner. Check if `EBOOK_EXTENSIONS` already includes these or if a new `MANGA_EXTENSIONS` set is needed. The settings system already has `naming.manga.*` configured — verify the extension lists match.

- [ ] **Step 3: Verify build**

Run: `bun run build`

- [ ] **Step 4: Commit**

```bash
git add src/server/file-import.ts src/server/download-manager.ts
git commit -m "feat: handle manga download imports with file tracking and history"
```

---

### Task 5: Update Search for Missing task messaging

**Files:**

- Modify: `src/server/scheduler/tasks/search-missing.ts`

- [ ] **Step 1: Include manga in the summary**

Update the Search for Missing task (from Plan B) to include manga chapter counts:

```typescript
const mangaCount = result.mangaDetails.filter((d) => d.searched).length;
if (mangaCount > 0) parts.push(plural(mangaCount, "chapter"));
```

- [ ] **Step 2: Commit**

```bash
git add src/server/scheduler/tasks/search-missing.ts
git commit -m "feat: include manga chapters in Search for Missing summary"
```
