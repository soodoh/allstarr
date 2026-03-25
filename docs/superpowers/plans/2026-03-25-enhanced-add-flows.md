# Enhanced Add/Import Flows Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enhance all add/import flows with monitoring options, search-after-add, and refactor per-profile monitoring to per-entity.

**Architecture:** Three-phase approach: (1) schema migration moving monitorNewSeasons/monitorNewBooks to entity level, (2) server function + validator updates for enhanced add flows with fire-and-forget search, (3) UI form enhancements. Auto-search extended for movies and episodes.

**Tech Stack:** Drizzle ORM (SQLite), TanStack Start server functions, TanStack Query, React, shadcn/ui, Zod, TMDB API

**Spec:** `docs/superpowers/specs/2026-03-25-enhanced-add-flows-design.md`

---

## File Map

### New Files

| File                                  | Responsibility                                                                      |
| ------------------------------------- | ----------------------------------------------------------------------------------- |
| `src/db/migrate-monitor-to-entity.ts` | One-time data migration script: copy monitorNew\* from join tables to entity tables |

### Modified Files

| File                                                          | Changes                                                                                             |
| ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `src/db/schema/shows.ts`                                      | Add `monitorNewSeasons` column                                                                      |
| `src/db/schema/authors.ts`                                    | Add `monitorNewBooks` column                                                                        |
| `src/db/schema/show-download-profiles.ts`                     | Remove `monitorNewSeasons` column                                                                   |
| `src/db/schema/author-download-profiles.ts`                   | Remove `monitorNewBooks` column                                                                     |
| `src/lib/tmdb-validators.ts`                                  | Update `addMovieSchema`, `addShowSchema`; add show `monitorNewSeasons` to show schemas              |
| `src/lib/validators.ts`                                       | Update `updateAuthorSchema`                                                                         |
| `src/server/movies.ts`                                        | Enhance `addMovieFn` with monitor option + collection monitoring                                    |
| `src/server/shows.ts`                                         | Update `addShowFn`, `updateShowFn`, `getShowDetailFn` for entity-level monitoring                   |
| `src/server/import.ts`                                        | Add monitor options to author/book import functions                                                 |
| `src/server/auto-search.ts`                                   | Add `getWantedMovies()`, `getWantedEpisodes()`, per-entity search functions, extend `runAutoSearch` |
| `src/hooks/mutations/import.ts`                               | Update `ImportAuthorData`, `ImportBookData` types                                                   |
| `src/hooks/mutations/shows.ts`                                | Update `useAddShow` and `useUpdateShow` for new schemas                                             |
| `src/components/movies/tmdb-movie-search.tsx`                 | Add monitor dropdown + search checkbox                                                              |
| `src/components/tv/tmdb-show-search.tsx`                      | Add season folder + search checkboxes                                                               |
| `src/components/tv/show-detail-header.tsx`                    | Refactor EditShowDialog to entity-level monitorNewSeasons                                           |
| `src/components/bookshelf/hardcover/author-preview-modal.tsx` | Add monitor + monitorNewBooks + search                                                              |
| `src/components/bookshelf/hardcover/book-preview-modal.tsx`   | Add monitor + monitorNewBooks + search + adaptive form                                              |
| `src/components/bookshelf/authors/author-form.tsx`            | Refactor to entity-level monitorNewBooks                                                            |
| `src/components/tv/show-bulk-bar.tsx`                         | Update to use flat `downloadProfileIds` (remove `monitorNewSeasons` per-profile objects)            |
| `src/routes/_authed/authors/$authorId.tsx`                    | Update author update calls to use flat `downloadProfileIds` + entity-level `monitorNewBooks`        |
| `src/server/authors.ts`                                       | Update `updateAuthorFn` and `getAuthorDetailFn` response shape for entity-level monitoring          |

---

## Task 1: Schema — Add Entity-Level Monitor Columns

**Files:**

- Modify: `src/db/schema/shows.ts`
- Modify: `src/db/schema/authors.ts`

This is step 1 of a two-step migration. We add the new columns first, then migrate data, then remove old columns.

- [ ] **Step 1: Add `monitorNewSeasons` to shows table**

In `src/db/schema/shows.ts`, add after the `useSeasonFolder` column:

```typescript
    monitorNewSeasons: text("monitor_new_seasons").notNull().default("all"),
```

- [ ] **Step 2: Add `monitorNewBooks` to authors table**

In `src/db/schema/authors.ts`, add after the `monitored` column:

```typescript
    monitorNewBooks: text("monitor_new_books").notNull().default("all"),
```

- [ ] **Step 3: Generate migration**

```bash
bun run db:generate
```

- [ ] **Step 4: Apply migration**

```bash
bun run db:migrate
```

- [ ] **Step 5: Commit**

```bash
git add src/db/schema/shows.ts src/db/schema/authors.ts drizzle/
git commit -m "feat: add monitorNewSeasons and monitorNewBooks columns to entity tables"
```

---

## Task 2: Data Migration Script

**Files:**

- Create: `src/db/migrate-monitor-to-entity.ts`

- [ ] **Step 1: Create migration script**

```typescript
// src/db/migrate-monitor-to-entity.ts
// One-time script: copies monitorNewSeasons/monitorNewBooks from join tables to entity tables
// Run with: bun src/db/migrate-monitor-to-entity.ts

import { db } from "./index";
import {
  shows,
  showDownloadProfiles,
  authors,
  authorDownloadProfiles,
} from "./schema";
import { eq } from "drizzle-orm";

function migrateShows(): void {
  const allShows = db.select({ id: shows.id }).from(shows).all();

  for (const show of allShows) {
    const profiles = db
      .select({ monitorNewSeasons: showDownloadProfiles.monitorNewSeasons })
      .from(showDownloadProfiles)
      .where(eq(showDownloadProfiles.showId, show.id))
      .all();

    if (profiles.length === 0) continue; // column default "all" applies

    // If all profiles agree, use that value. Otherwise default to "all".
    const values = new Set(profiles.map((p) => p.monitorNewSeasons));
    const value = values.size === 1 ? [...values][0] : "all";

    db.update(shows)
      .set({ monitorNewSeasons: value })
      .where(eq(shows.id, show.id))
      .run();
  }

  console.log(`Migrated monitorNewSeasons for ${allShows.length} shows`);
}

function migrateAuthors(): void {
  const allAuthors = db.select({ id: authors.id }).from(authors).all();

  for (const author of allAuthors) {
    const profiles = db
      .select({ monitorNewBooks: authorDownloadProfiles.monitorNewBooks })
      .from(authorDownloadProfiles)
      .where(eq(authorDownloadProfiles.authorId, author.id))
      .all();

    if (profiles.length === 0) continue;

    const values = new Set(profiles.map((p) => p.monitorNewBooks));
    const value = values.size === 1 ? [...values][0] : "all";

    db.update(authors)
      .set({ monitorNewBooks: value })
      .where(eq(authors.id, author.id))
      .run();
  }

  console.log(`Migrated monitorNewBooks for ${allAuthors.length} authors`);
}

migrateShows();
migrateAuthors();
console.log("Migration complete");
```

- [ ] **Step 2: Run the migration**

```bash
bun src/db/migrate-monitor-to-entity.ts
```

- [ ] **Step 3: Commit**

```bash
git add src/db/migrate-monitor-to-entity.ts
git commit -m "chore: data migration script for monitor columns"
```

---

## Task 3: Schema — Remove Per-Profile Monitor Columns

**Files:**

- Modify: `src/db/schema/show-download-profiles.ts`
- Modify: `src/db/schema/author-download-profiles.ts`

- [ ] **Step 1: Remove `monitorNewSeasons` from show-download-profiles**

In `src/db/schema/show-download-profiles.ts`, remove the `monitorNewSeasons` column entirely. The table should only have `id`, `showId`, `downloadProfileId`.

```typescript
import { sqliteTable, integer, unique } from "drizzle-orm/sqlite-core";
import { shows } from "./shows";
import { downloadProfiles } from "./download-profiles";

export const showDownloadProfiles = sqliteTable(
  "show_download_profiles",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    showId: integer("show_id")
      .notNull()
      .references(() => shows.id, { onDelete: "cascade" }),
    downloadProfileId: integer("download_profile_id")
      .notNull()
      .references(() => downloadProfiles.id, { onDelete: "cascade" }),
  },
  (t) => [unique().on(t.showId, t.downloadProfileId)],
);
```

- [ ] **Step 2: Remove `monitorNewBooks` from author-download-profiles**

In `src/db/schema/author-download-profiles.ts`, remove the `monitorNewBooks` column entirely. The table should only have `id`, `authorId`, `downloadProfileId`.

```typescript
import { sqliteTable, integer, unique } from "drizzle-orm/sqlite-core";
import { authors } from "./authors";
import { downloadProfiles } from "./download-profiles";

export const authorDownloadProfiles = sqliteTable(
  "author_download_profiles",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    authorId: integer("author_id")
      .notNull()
      .references(() => authors.id, { onDelete: "cascade" }),
    downloadProfileId: integer("download_profile_id")
      .notNull()
      .references(() => downloadProfiles.id, { onDelete: "cascade" }),
  },
  (t) => [unique().on(t.authorId, t.downloadProfileId)],
);
```

- [ ] **Step 3: Generate migration**

```bash
bun run db:generate
```

- [ ] **Step 4: Apply migration**

```bash
bun run db:migrate
```

- [ ] **Step 5: Commit**

```bash
git add src/db/schema/show-download-profiles.ts src/db/schema/author-download-profiles.ts drizzle/
git commit -m "feat: remove per-profile monitorNewSeasons and monitorNewBooks columns"
```

---

## Task 4: Update Validators

**Files:**

- Modify: `src/lib/tmdb-validators.ts`
- Modify: `src/lib/validators.ts`

- [ ] **Step 1: Update `addMovieSchema` in `tmdb-validators.ts`**

Add `monitorOption` and `searchOnAdd`:

```typescript
export const addMovieSchema = z.object({
  tmdbId: z.number(),
  downloadProfileIds: z.array(z.number()),
  minimumAvailability: z
    .enum(["announced", "inCinemas", "released"])
    .default("released"),
  monitorOption: z
    .enum(["movieOnly", "movieAndCollection", "none"])
    .default("movieOnly"),
  searchOnAdd: z.boolean().default(false),
});
```

- [ ] **Step 2: Update `addShowSchema` in `tmdb-validators.ts`**

Add `useSeasonFolder`, `searchOnAdd`, `searchCutoffUnmet`. Keep existing `seriesType` field:

```typescript
export const addShowSchema = z.object({
  tmdbId: z.number(),
  downloadProfileIds: z.array(z.number()),
  monitorOption: z.enum([
    "all",
    "future",
    "missing",
    "existing",
    "pilot",
    "firstSeason",
    "lastSeason",
    "none",
  ]),
  seriesType: z.enum(["standard", "daily", "anime"]).default("standard"),
  useSeasonFolder: z.boolean().default(true),
  searchOnAdd: z.boolean().default(false),
  searchCutoffUnmet: z.boolean().default(false),
});
```

- [ ] **Step 3: Update `updateShowSchema` in `tmdb-validators.ts`**

Change from per-profile `downloadProfiles` array to flat `downloadProfileIds` + entity-level `monitorNewSeasons`:

```typescript
export const updateShowSchema = z.object({
  id: z.number(),
  downloadProfileIds: z.array(z.number()).optional(),
  monitorNewSeasons: z.enum(["all", "none", "new"]).optional(),
  useSeasonFolder: z.boolean().optional(),
  seriesType: z.enum(["standard", "daily", "anime"]).optional(),
});
```

- [ ] **Step 4: Update `updateAuthorSchema` in `validators.ts`**

Change from per-profile `downloadProfiles` array to flat `downloadProfileIds` + entity-level `monitorNewBooks`:

```typescript
export const updateAuthorSchema = z.object({
  id: z.number(),
  downloadProfileIds: z.array(z.number()).optional(),
  monitorNewBooks: z.enum(["all", "none", "new"]).optional(),
});
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/tmdb-validators.ts src/lib/validators.ts
git commit -m "feat: update validators for enhanced add flows and entity-level monitoring"
```

---

## Task 5: Update Show Server Functions

**Files:**

- Modify: `src/server/shows.ts`

- [ ] **Step 1: Update `addShowFn`**

In `addShowFn`, change the show insert to use `data.seriesType` instead of hardcoded `"standard"`, and add `useSeasonFolder` from data:

```typescript
const show = db.insert(shows).values({
  title,
  sortTitle,
  // ... existing fields ...
  seriesType: data.seriesType,
  useSeasonFolder: data.useSeasonFolder ? 1 : 0,
});
```

The `monitorNewSeasons` is not in the add schema (following Sonarr pattern — add-time defaults to "all" via column default). No change needed for that.

After the existing `applyMonitoringOption` call and history insert, add fire-and-forget search:

```typescript
// Fire-and-forget search if requested
if (data.searchOnAdd || data.searchCutoffUnmet) {
  void searchForShow({
    showId: show.id,
    cutoffUnmet: data.searchCutoffUnmet,
  }).catch((err) => console.error("Search after add failed:", err));
}
```

Import `searchForShow` from `./auto-search` (will be created in Task 9).

- [ ] **Step 2: Update `updateShowFn`**

The current function destructures `downloadProfiles` (array of objects). Change to destructure `downloadProfileIds` (flat array) and `monitorNewSeasons`:

```typescript
const {
  id,
  downloadProfileIds,
  monitorNewSeasons,
  useSeasonFolder,
  seriesType,
} = data;
```

Update the show-level fields to include `monitorNewSeasons`:

```typescript
if (monitorNewSeasons) {
  showUpdates.monitorNewSeasons = monitorNewSeasons;
}
```

Update the download profiles section to use flat `downloadProfileIds` instead of `downloadProfiles`:

```typescript
if (downloadProfileIds !== undefined) {
  // Find previous profiles
  const previousLinks = db
    .select({ downloadProfileId: showDownloadProfiles.downloadProfileId })
    .from(showDownloadProfiles)
    .where(eq(showDownloadProfiles.showId, id))
    .all();
  const previousProfileIds = previousLinks.map((l) => l.downloadProfileId);

  // Compute removed
  const newSet = new Set(downloadProfileIds);
  const removedProfileIds = previousProfileIds.filter(
    (pid) => !newSet.has(pid),
  );

  // Delete episode profiles for removed (keep existing cascade logic)
  // ... same cascade delete logic as current code ...

  // Replace show download profiles (without monitorNewSeasons)
  db.delete(showDownloadProfiles)
    .where(eq(showDownloadProfiles.showId, id))
    .run();
  for (const profileId of downloadProfileIds) {
    db.insert(showDownloadProfiles)
      .values({ showId: id, downloadProfileId: profileId })
      .run();
  }
}
```

- [ ] **Step 3: Update `getShowDetailFn`**

Change the profile links query to only select `downloadProfileId` (no `monitorNewSeasons`):

```typescript
const profileLinks = db
  .select({
    downloadProfileId: showDownloadProfiles.downloadProfileId,
  })
  .from(showDownloadProfiles)
  .where(eq(showDownloadProfiles.showId, data.id))
  .all();
const downloadProfileIds = profileLinks.map((l) => l.downloadProfileId);

return {
  ...show,
  downloadProfileIds,
  seasons: seasonsWithEpisodes,
};
```

Remove the `downloadProfiles: profileLinks` from the return — it's replaced by `downloadProfileIds` and `show.monitorNewSeasons` (from the show entity).

- [ ] **Step 4: Verify build**

```bash
bun run build
```

Note: Build may fail due to UI components still expecting old response shape. That's OK — UI updates come in later tasks.

- [ ] **Step 5: Commit**

```bash
git add src/server/shows.ts
git commit -m "feat: update show server functions for entity-level monitoring and search-on-add"
```

---

## Task 6: Update Movie Server Functions

**Files:**

- Modify: `src/server/movies.ts`

- [ ] **Step 1: Enhance `addMovieFn` with monitor option**

After the existing download profile insertion loop, add monitor option handling:

```typescript
// Handle monitor option
if (data.monitorOption === "none") {
  // Skip profile assignment — movie is just tracked
  // (profiles loop above already ran — need to move it inside the condition)
}
```

Actually, restructure: move the profile insertion loop inside a condition:

```typescript
// Assign download profiles based on monitor option
if (data.monitorOption !== "none") {
  for (const profileId of data.downloadProfileIds) {
    db.insert(movieDownloadProfiles)
      .values({ movieId: movie.id, downloadProfileId: profileId })
      .run();
  }
}

// Handle collection monitoring
if (data.monitorOption === "movieAndCollection" && collectionId) {
  db.update(movieCollections)
    .set({
      monitored: true,
      minimumAvailability: data.minimumAvailability,
      updatedAt: new Date(),
    })
    .where(eq(movieCollections.id, collectionId))
    .run();

  // Set collection download profiles
  db.delete(movieCollectionDownloadProfiles)
    .where(eq(movieCollectionDownloadProfiles.collectionId, collectionId))
    .run();
  for (const profileId of data.downloadProfileIds) {
    db.insert(movieCollectionDownloadProfiles)
      .values({ collectionId, downloadProfileId: profileId })
      .run();
  }
}

// Fire-and-forget search if requested
if (data.searchOnAdd && data.monitorOption !== "none") {
  void searchForMovie({ movieId: movie.id }).catch((err) =>
    console.error("Search after add failed:", err),
  );
}
```

Add imports for `movieCollectionDownloadProfiles` from schema and `searchForMovie` from `./auto-search`.

Note: `collectionId` is already defined earlier in `addMovieFn` from the collection upsert block (added in the movie collections feature). It will be `null` if the movie has no TMDB collection.

- [ ] **Step 2: Verify build**

```bash
bun run build
```

- [ ] **Step 3: Commit**

```bash
git add src/server/movies.ts
git commit -m "feat: enhance addMovieFn with monitor option and collection monitoring"
```

---

## Task 7: Update Import Server Functions

**Files:**

- Modify: `src/server/import.ts`

This is the most complex change. The import functions need to accept `monitorOption`, `monitorNewBooks`, and `searchOnAdd`.

- [ ] **Step 1: Update `importHardcoverAuthorFn` input handling**

Find `importHardcoverAuthorFn` and update its input validator to accept the new fields. The current function accepts `{ foreignAuthorId, downloadProfileIds }`. Add:

```typescript
  monitorOption: z.enum(["all", "future", "missing", "existing", "first", "latest", "none"]).default("all"),
  monitorNewBooks: z.enum(["all", "none", "new"]).default("all"),
  searchOnAdd: z.boolean().default(false),
```

After inserting the author, set `monitorNewBooks`:

```typescript
db.update(authors)
  .set({ monitorNewBooks: data.monitorNewBooks })
  .where(eq(authors.id, authorId))
  .run();
```

After the book/edition import loop, apply the monitor option to determine which books get edition-profile links. Currently, all imported books get profiles. Change to only assign profiles based on `monitorOption`:

- `"all"`: all books (current behavior)
- `"future"`: books with `releaseDate` > today
- `"missing"`: books without files (at import time, all are missing — same as "all")
- `"existing"`: books with files (at import time, none — same as "none")
- `"first"`: only the earliest book by release date
- `"latest"`: only the most recent book
- `"none"`: no books get profiles

After the import completes, fire-and-forget search:

```typescript
if (data.searchOnAdd) {
  void searchForAuthorBooks({ authorId }).catch((err) =>
    console.error("Search after import failed:", err),
  );
}
```

- [ ] **Step 2: Update `importHardcoverBookFn` input handling**

Same new fields. The selected book is always monitored regardless of `monitorOption`. Apply `monitorOption` to other books by the primary author. Set `monitorNewBooks` on the author.

After import, fire-and-forget search for just this book:

```typescript
if (data.searchOnAdd) {
  void searchForBook({ bookId }).catch((err) =>
    console.error("Search after import failed:", err),
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/server/import.ts
git commit -m "feat: add monitor options and search-on-add to author/book import"
```

---

## Task 8: Update Author Server Functions

**Files:**

- Modify: `src/server/authors.ts`
- Modify: `src/routes/_authed/authors/$authorId.tsx`
- Modify: `src/components/tv/show-bulk-bar.tsx`

- [ ] **Step 1: Update `updateAuthorFn` in `src/server/authors.ts`**

Change from per-profile `downloadProfiles` array to flat `downloadProfileIds` + entity-level `monitorNewBooks`. Follow the same pattern as the show update in Task 5:

- Accept `{ id, downloadProfileIds?, monitorNewBooks? }`
- Update `monitorNewBooks` on author entity
- Replace `authorDownloadProfiles` join rows (without `monitorNewBooks` column)

- [ ] **Step 2: Update `getAuthorDetailFn` in `src/server/authors.ts`**

Change the response shape to return `downloadProfileIds: number[]` (flat array) instead of `downloadProfiles: [{downloadProfileId, monitorNewBooks}]`. The `monitorNewBooks` value now comes from `author.monitorNewBooks` (entity level).

- [ ] **Step 3: Update `src/routes/_authed/authors/$authorId.tsx`**

This route constructs `downloadProfiles` objects with `monitorNewBooks` for the author update call. Update to use flat `downloadProfileIds` + entity-level `monitorNewBooks`.

- [ ] **Step 4: Update `src/components/tv/show-bulk-bar.tsx`**

This component constructs `downloadProfiles` array objects with `{ downloadProfileId, monitorNewSeasons }` for show bulk updates. Update to use flat `downloadProfileIds` (the `monitorNewSeasons` is now entity-level, not part of the bulk bar).

- [ ] **Step 5: Commit**

```bash
git add src/server/authors.ts src/routes/_authed/authors/\$authorId.tsx src/components/tv/show-bulk-bar.tsx
git commit -m "feat: update author/show consumers for entity-level monitoring"
```

---

## Task 9: Auto-Search Extension

**Files:**

- Modify: `src/server/auto-search.ts`

- [ ] **Step 1: Add `getWantedMovies()` function**

```typescript
type WantedMovie = {
  id: number;
  title: string;
  year: number;
  profiles: ProfileInfo[];
  bestWeightByProfile: Map<number, number>;
};

function getWantedMovies(movieIds?: number[]): WantedMovie[] {
  // Query movies with download profiles assigned
  // LEFT JOIN movieFiles to find movies without files (or below cutoff)
  // For each movie, load its profiles and compute best existing quality weight
  // Return array of WantedMovie
}
```

The movie wanted detection is simpler than books — direct `movieDownloadProfiles` join, no edition layer.

- [ ] **Step 2: Add `getWantedEpisodes()` function**

```typescript
type WantedEpisode = {
  id: number;
  showId: number;
  showTitle: string;
  seasonNumber: number;
  episodeNumber: number;
  seriesType: string;
  airDate: string | null;
  profiles: ProfileInfo[];
  bestWeightByProfile: Map<number, number>;
};

function getWantedEpisodes(
  showId?: number,
  cutoffUnmet?: boolean,
): WantedEpisode[] {
  // Query episodes with download profiles assigned (episodeDownloadProfiles)
  // JOIN shows for title and seriesType
  // JOIN seasons for seasonNumber
  // LEFT JOIN episodeFiles for missing/cutoff detection
  // If cutoffUnmet: include episodes with files below cutoff
  // Return array of WantedEpisode
}
```

- [ ] **Step 3: Add movie search query builder**

```typescript
function buildMovieSearchQuery(movie: WantedMovie): string {
  return `"${cleanSearchTerm(movie.title)}" ${movie.year}`;
}
```

- [ ] **Step 4: Add episode search query builder**

```typescript
function buildEpisodeSearchQuery(episode: WantedEpisode): string {
  const showName = cleanSearchTerm(episode.showTitle);
  switch (episode.seriesType) {
    case "daily":
      return `"${showName}" ${episode.airDate ?? ""}`;
    case "anime":
      return `"${showName}" ${episode.episodeNumber}`;
    default: // "standard"
      return `"${showName}" S${String(episode.seasonNumber).padStart(2, "0")}E${String(episode.episodeNumber).padStart(2, "0")}`;
  }
}
```

Use the existing `cleanSearchTerm` function if it exists, or create one matching the book search pattern.

- [ ] **Step 5: Add per-entity search server functions**

```typescript
import { createServerFn } from "@tanstack/react-start";
import { requireAuth } from "./middleware";

export async function searchForMovie(
  movieId: number,
): Promise<{ searched: number; grabbed: number }> {
  const wanted = getWantedMovies([movieId]);
  if (wanted.length === 0) return { searched: 0, grabbed: 0 };
  // Search and grab using same pattern as searchForBook
  // ...
}

export async function searchForShow(
  showId: number,
  cutoffUnmet = false,
): Promise<{ searched: number; grabbed: number }> {
  const wanted = getWantedEpisodes(showId, cutoffUnmet);
  if (wanted.length === 0) return { searched: 0, grabbed: 0 };
  // Search and grab each wanted episode
  // ...
}

export async function searchForAuthorBooks(
  authorId: number,
): Promise<{ searched: number; grabbed: number }> {
  // Get all book IDs for this author, then call existing book search logic
}

export async function searchForBook(
  bookId: number,
): Promise<{ searched: number; grabbed: number }> {
  // Use existing getWantedBooks logic with bookIds filter
  const result = await runAutoSearch({ bookIds: [bookId], maxBooks: 1 });
  return { searched: result.searched, grabbed: result.grabbed };
}
```

These are plain async functions (not server functions) called internally by add/import handlers via fire-and-forget.

- [ ] **Step 6: Extend `runAutoSearch` to handle movies and episodes**

Add movie and episode search loops after the existing book search loop:

```typescript
export async function runAutoSearch(
  options?: AutoSearchOptions,
): Promise<AutoSearchResult> {
  // ... existing book search logic ...

  // Movie search
  const wantedMovies = getWantedMovies();
  for (const movie of wantedMovies) {
    // Same pattern: search indexers, score, grab best per profile
  }

  // Episode search
  const wantedEpisodes = getWantedEpisodes();
  for (const episode of wantedEpisodes) {
    // Same pattern: search indexers, score, grab best per profile
  }

  return result;
}
```

- [ ] **Step 7: Verify build**

```bash
bun run build
```

- [ ] **Step 8: Commit**

```bash
git add src/server/auto-search.ts
git commit -m "feat: extend auto-search for movies and TV episodes"
```

---

## Task 10: Update Mutation Hooks

**Files:**

- Modify: `src/hooks/mutations/import.ts`
- Modify: `src/hooks/mutations/shows.ts`

- [ ] **Step 1: Update import types**

In `src/hooks/mutations/import.ts`, update the manually-defined types:

```typescript
export type ImportAuthorData = {
  foreignAuthorId: number;
  downloadProfileIds: number[];
  monitorOption?:
    | "all"
    | "future"
    | "missing"
    | "existing"
    | "first"
    | "latest"
    | "none";
  monitorNewBooks?: "all" | "none" | "new";
  searchOnAdd?: boolean;
};

export type ImportBookData = {
  foreignBookId: number;
  downloadProfileIds: number[];
  monitorOption?:
    | "all"
    | "future"
    | "missing"
    | "existing"
    | "first"
    | "latest"
    | "none";
  monitorNewBooks?: "all" | "none" | "new";
  searchOnAdd?: boolean;
};
```

- [ ] **Step 2: Update show mutation hooks**

In `src/hooks/mutations/shows.ts`, the `useUpdateShow` hook's `mutationFn` type changes since `updateShowSchema` now uses flat `downloadProfileIds` instead of `downloadProfiles` array. Update the type import if needed.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/mutations/import.ts src/hooks/mutations/shows.ts
git commit -m "feat: update mutation hooks for enhanced add flow types"
```

---

## Task 11: Movie Add Form UI

**Files:**

- Modify: `src/components/movies/tmdb-movie-search.tsx`

- [ ] **Step 1: Add monitor dropdown and search checkbox**

In the preview modal's add form, add:

1. **Monitor dropdown** with options: Movie Only / Movie & Collection / None
   - Default: "movieOnly"
   - State: `const [monitorOption, setMonitorOption] = useState<"movieOnly" | "movieAndCollection" | "none">("movieOnly")`

2. **Start search for missing movie** checkbox
   - Default: unchecked
   - State: `const [searchOnAdd, setSearchOnAdd] = useState(false)`

3. When `monitorOption === "none"`, bypass the `downloadProfileIds.length === 0` guard (allow submitting with no profiles selected)

4. Pass both new fields to the mutation:
   ```typescript
   addMovie.mutate({
     tmdbId: movie.id,
     downloadProfileIds,
     minimumAvailability,
     monitorOption,
     searchOnAdd,
   });
   ```

Use `Select` component for the dropdown (same pattern as minimum availability). Use `Checkbox` component for the search toggle with a `Label`.

- [ ] **Step 2: Commit**

```bash
git add src/components/movies/tmdb-movie-search.tsx
git commit -m "feat: add monitor and search options to movie add form"
```

---

## Task 12: TV Show Add Form UI

**Files:**

- Modify: `src/components/tv/tmdb-show-search.tsx`

- [ ] **Step 1: Add new form fields**

In the preview modal's add form, add:

1. **Use Season Folder** toggle
   - Default: true
   - State: `const [useSeasonFolder, setSeasonFolder] = useState(true)`
   - Render as `Switch` component

2. **Start search for missing episodes** checkbox
   - State: `const [searchOnAdd, setSearchOnAdd] = useState(false)`

3. **Start search for cutoff unmet episodes** checkbox
   - State: `const [searchCutoffUnmet, setSearchCutoffUnmet] = useState(false)`

4. Pass all new fields to the mutation:
   ```typescript
   addShow.mutate({
     tmdbId: show.id,
     downloadProfileIds,
     monitorOption,
     seriesType, // already in form, now actually passed
     useSeasonFolder,
     searchOnAdd,
     searchCutoffUnmet,
   });
   ```

- [ ] **Step 2: Commit**

```bash
git add src/components/tv/tmdb-show-search.tsx
git commit -m "feat: add season folder and search options to show add form"
```

---

## Task 13: TV Show Edit Dialog UI

**Files:**

- Modify: `src/components/tv/show-detail-header.tsx`

- [ ] **Step 1: Refactor EditShowDialog**

In the `EditShowDialog` component:

1. Remove per-profile `monitorNewSeasons` dropdown from each profile checkbox
2. Add a single top-level **Monitor New Seasons** dropdown (before the profile list):
   - Options: All / None / New
   - State initialized from `show.monitorNewSeasons`

3. Change profile state from `Array<{downloadProfileId, monitorNewSeasons}>` to flat `number[]`

4. Update the save call to use new schema shape:
   ```typescript
   updateShow.mutate({
     id: show.id,
     downloadProfileIds: selectedProfileIds,
     monitorNewSeasons,
     useSeasonFolder,
     seriesType,
   });
   ```

- [ ] **Step 2: Commit**

```bash
git add src/components/tv/show-detail-header.tsx
git commit -m "feat: refactor show edit dialog to entity-level monitorNewSeasons"
```

---

## Task 14: Author Import Form UI

**Files:**

- Modify: `src/components/bookshelf/hardcover/author-preview-modal.tsx`

- [ ] **Step 1: Add monitor options to AddForm**

In the `AddForm` component inside the author preview modal:

1. **Monitor dropdown**: All Books / Future Books / Missing Books / Existing Books / First Book / Latest Book / None
   - Default: "all"
   - State: `const [monitorOption, setMonitorOption] = useState("all")`

2. **Monitor New Books dropdown**: All / None / New
   - Default: "all"
   - State: `const [monitorNewBooks, setMonitorNewBooks] = useState("all")`

3. **Start search for missing books** checkbox
   - State: `const [searchOnAdd, setSearchOnAdd] = useState(false)`

4. Pass to mutation:
   ```typescript
   importAuthor.mutate({
     foreignAuthorId: Number(fullAuthor.id),
     downloadProfileIds,
     monitorOption,
     monitorNewBooks,
     searchOnAdd,
   });
   ```

- [ ] **Step 2: Commit**

```bash
git add src/components/bookshelf/hardcover/author-preview-modal.tsx
git commit -m "feat: add monitor and search options to author import form"
```

---

## Task 15: Book Import Form UI

**Files:**

- Modify: `src/components/bookshelf/hardcover/book-preview-modal.tsx`

- [ ] **Step 1: Add monitor options with adaptive form**

In the `AddBookForm` component:

1. Check if the book's author already exists in the library (this check may already exist in the component)

2. If author is **new** (not in library): show full form with Monitor, Monitor New Books, Download Profiles, and Search checkbox

3. If author **exists**: only show "Start search for new book" checkbox (other settings come from existing author)

4. Pass to mutation:
   ```typescript
   importBook.mutate({
     foreignBookId: Number(book.id),
     downloadProfileIds,
     monitorOption,
     monitorNewBooks,
     searchOnAdd,
   });
   ```

The search checkbox label should say "Start search for new book" (not "missing books").

- [ ] **Step 2: Commit**

```bash
git add src/components/bookshelf/hardcover/book-preview-modal.tsx
git commit -m "feat: add monitor and search options to book import form"
```

---

## Task 16: Author Edit Form UI

**Files:**

- Modify: `src/components/bookshelf/authors/author-form.tsx`

- [ ] **Step 1: Refactor to entity-level monitorNewBooks**

1. Remove per-profile `monitorNewBooks` dropdowns from each profile checkbox
2. Add a single top-level **Monitor New Books** dropdown: All / None / New
3. Change profile state from `Array<{downloadProfileId, monitorNewBooks}>` to flat `number[]`
4. Update the form's onSave/onChange to pass flat `downloadProfileIds` + entity-level `monitorNewBooks`

- [ ] **Step 2: Commit**

```bash
git add src/components/bookshelf/authors/author-form.tsx
git commit -m "feat: refactor author form to entity-level monitorNewBooks"
```

---

## Task 17: Final Verification

- [ ] **Step 1: Build check**

```bash
bun run build
```

Expected: Clean build, no TypeScript errors.

- [ ] **Step 2: Verify end-to-end flows**

```bash
bun run dev
```

Test:

1. Add a movie with "Movie & Collection" monitor — verify collection gets monitored with same profiles
2. Add a movie with "None" — verify no profiles assigned
3. Add a TV show with "First Season" monitor + season folder on — verify only S01 episodes get profiles
4. Edit a TV show — verify single monitorNewSeasons dropdown (not per-profile)
5. Import an author with "Latest Book" monitor — verify only newest book monitored
6. Import a book with "None" monitor — verify the selected book is still monitored
7. Add with search checkbox checked — verify search fires (check Activity > Queue or system events)
8. Edit an author — verify single monitorNewBooks dropdown

- [ ] **Step 3: Final commit if any fixes needed**

```bash
git add -A
git commit -m "fix: address issues found during final verification"
```
