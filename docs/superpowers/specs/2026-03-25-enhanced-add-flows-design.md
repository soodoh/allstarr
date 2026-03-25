# Enhanced Add/Import Flows Design Specification

**Date:** 2026-03-25
**Status:** Approved

## Overview

Enhance add/import flows for all entity types (movies, TV shows, authors, books) with full monitoring options, search-after-add checkboxes, and proper monitoring logic. Refactor `monitorNewSeasons` and `monitorNewBooks` from per-profile to per-entity. Extend `runAutoSearch` to handle movies and TV shows in addition to books.

Cross-referenced with Sonarr, Radarr, and Readarr implementations for behavioral parity (adjusted for Allstarr's multi-download-profile data model).

## Schema Changes

### Move Monitoring to Entity Level

**Add column to `shows` table:**

| Column              | Type | Constraints             | Description            |
| ------------------- | ---- | ----------------------- | ---------------------- |
| `monitorNewSeasons` | text | NOT NULL, default "all" | "all" / "none" / "new" |

**Add column to `authors` table:**

| Column            | Type | Constraints             | Description            |
| ----------------- | ---- | ----------------------- | ---------------------- |
| `monitorNewBooks` | text | NOT NULL, default "all" | "all" / "none" / "new" |

**Remove column from `showDownloadProfiles`:**

- Drop `monitorNewSeasons`

**Remove column from `authorDownloadProfiles`:**

- Drop `monitorNewBooks`

**Migration strategy:** Before dropping the per-profile columns, read each entity's profile values. If values are mixed across profiles, default to "all". If an entity has zero profiles assigned (no join table rows), the new column default of "all" applies automatically. Set the new entity-level column, then drop the old columns. SQLite doesn't support `ALTER TABLE DROP COLUMN` in older versions — if Drizzle generates a table recreation migration, that's fine.

**Affected consumers of the removed columns:**

- `getShowDetailFn` in `src/server/shows.ts` — currently returns `downloadProfiles` array with `monitorNewSeasons` per profile. Must change to return `monitorNewSeasons` at the show level and a flat `downloadProfileIds` array.
- `updateShowFn` in `src/server/shows.ts` — currently accepts `downloadProfiles: [{downloadProfileId, monitorNewSeasons}]`. Must change to flat `downloadProfileIds` + entity-level `monitorNewSeasons`.
- `EditShowDialog` in `src/components/tv/show-detail-header.tsx` — per-profile dropdown becomes single top-level dropdown.
- `author-form.tsx` — per-profile `monitorNewBooks` dropdown becomes single top-level dropdown.
- Any other code reading `showDownloadProfiles.monitorNewSeasons` or `authorDownloadProfiles.monitorNewBooks`.

### No New Tables

All other data model needs are satisfied by existing tables.

## Add Flow Enhancements

### Movie Add (`src/components/movies/tmdb-movie-search.tsx`)

**Current fields:** Download profiles, Minimum availability

**New fields:**

- **Monitor** dropdown: Movie Only (default) / Movie & Collection / None
- **Start search for missing movie** checkbox (default unchecked)

**Schema change (`addMovieSchema`):**

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

**Behavior:**

- `movieOnly`: Movie gets the selected download profiles. Collection (if any) stays unmonitored.
- `movieAndCollection`: Movie gets profiles. Collection is set to monitored with same `downloadProfileIds` and `minimumAvailability`. Creates `movieCollectionDownloadProfiles` junctions. **If the movie has no TMDB collection**, falls through to `movieOnly` behavior silently.
- `none`: Movie is added with no download profiles assigned. Just tracked. The UI should allow submitting with `"none"` even when `downloadProfileIds` is empty — bypass any "must select at least one profile" validation when monitor is `"none"`.
- `searchOnAdd`: After successful add, trigger auto-search for this movie (fire-and-forget, see Search Execution Model below).

### TV Show Add (`src/components/tv/tmdb-show-search.tsx`)

**Current fields:** Download profiles, Monitor option, Series type

**New fields:**

- **Use Season Folder** toggle (default true)
- **Start search for missing episodes** checkbox (default unchecked)
- **Start search for cutoff unmet episodes** checkbox (default unchecked)

**Note:** Following Sonarr's pattern, "Monitor New Seasons" is NOT shown in the add dialog. It's only available in the edit dialog. The add flow uses `monitorOption` to set initial episode monitoring.

**Schema change (`addShowSchema`):**

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

**Bug fix:** The current `addShowFn` hardcodes `seriesType: "standard"` instead of using `data.seriesType`. Fix this to use the value from the form.

**Behavior:**

- `useSeasonFolder` stored on the show entity (already exists as column, currently only set via column default)
- `searchOnAdd`: After successful add, trigger auto-search for missing episodes (fire-and-forget)
- `searchCutoffUnmet`: After successful add, also search for cutoff unmet episodes (fire-and-forget)
- `"none"` monitor: bypass profile validation, add show without episode profiles

### Author Import (`src/components/bookshelf/hardcover/author-preview-modal.tsx`)

**Current fields:** Download profiles

**New fields:**

- **Monitor** dropdown: All Books (default) / Future Books / Missing Books / Existing Books / First Book / Latest Book / None
- **Monitor New Books** dropdown: All (default) / None / New
- **Start search for missing books** checkbox (default unchecked)

**Schema change (import function input):**

```typescript
{
  foreignAuthorId: z.number(),
  downloadProfileIds: z.array(z.number()),
  monitorOption: z.enum(["all", "future", "missing", "existing", "first", "latest", "none"]).default("all"),
  monitorNewBooks: z.enum(["all", "none", "new"]).default("all"),
  searchOnAdd: z.boolean().default(false),
}
```

**Behavior:**

- `monitorOption` determines which books get download profile links (edition-level monitoring)
- `monitorNewBooks` stored on the author entity
- `monitorOption` applies only to the primary author's books (not co-authors that may be cascade-imported)
- `searchOnAdd`: After successful import, trigger auto-search for missing books by this author (fire-and-forget)

### Book Import (`src/components/bookshelf/hardcover/book-preview-modal.tsx`)

**Current fields:** Download profiles

**New fields:**

- **Monitor** dropdown: All Books (default) / Future Books / Missing Books / Existing Books / First Book / Latest Book / None
- **Monitor New Books** dropdown: All (default) / None / New
- **Start search for new book** checkbox (default unchecked)

**Adaptive form:** If the book's author already exists in the library, only show "Start search for new book" checkbox (all other settings come from the existing author). If the author is new, show the full form.

**Schema change (import function input):**

```typescript
{
  foreignBookId: z.number(),
  downloadProfileIds: z.array(z.number()),
  monitorOption: z.enum(["all", "future", "missing", "existing", "first", "latest", "none"]).default("all"),
  monitorNewBooks: z.enum(["all", "none", "new"]).default("all"),
  searchOnAdd: z.boolean().default(false),
}
```

**Behavior:**

- The selected book is **always monitored** regardless of `monitorOption` (user explicitly chose this book)
- `monitorOption` controls which _other_ books by the primary author get monitored
- `monitorNewBooks` stored on the author entity
- `searchOnAdd`: After successful import, trigger auto-search for just this book (fire-and-forget)

## Edit Flow Updates

### Edit TV Show (`src/components/tv/show-detail-header.tsx`)

**Current fields:** Download profiles with per-profile `monitorNewSeasons`, Use Season Folder, Series Type

**Changes:**

- Remove per-profile `monitorNewSeasons` dropdowns from each profile checkbox
- Add single top-level **Monitor New Seasons** dropdown: All / None / New
- Keep Use Season Folder toggle and Series Type dropdown as-is

**Schema change (`updateShowSchema`):**

```typescript
export const updateShowSchema = z.object({
  id: z.number(),
  downloadProfileIds: z.array(z.number()).optional(),
  monitorNewSeasons: z.enum(["all", "none", "new"]).optional(),
  useSeasonFolder: z.boolean().optional(),
  seriesType: z.enum(["standard", "daily", "anime"]).optional(),
});
```

Note: The current `updateShowSchema` has `downloadProfiles` as an array of `{ downloadProfileId, monitorNewSeasons }` objects. This changes to a flat `downloadProfileIds` array since `monitorNewSeasons` moves to the entity level.

### Edit Author (`src/components/bookshelf/authors/author-form.tsx`)

**Current fields:** Download profiles with per-profile `monitorNewBooks`

**Changes:**

- Remove per-profile `monitorNewBooks` dropdowns
- Add single top-level **Monitor New Books** dropdown: All / None / New

**Schema change (`updateAuthorSchema` in `src/lib/validators.ts`):**

The current schema accepts per-profile `monitorNewBooks`. Update to:

```typescript
export const updateAuthorSchema = z.object({
  id: z.number(),
  downloadProfileIds: z.array(z.number()).optional(),
  monitorNewBooks: z.enum(["all", "none", "new"]).optional(),
});
```

### Edit Movie (`src/components/movies/movie-detail-header.tsx`)

No changes needed. Movies don't have `monitorNew*` fields.

### Edit Book (`src/components/bookshelf/books/book-edit-dialog.tsx`)

No changes needed. Auto-switch edition toggle stays as-is.

### Response Shape Changes

**`getShowDetailFn`:** Currently returns `downloadProfiles: Array<{downloadProfileId, monitorNewSeasons}>`. Change to return `downloadProfileIds: number[]` and `monitorNewSeasons: string` at the show level. Update the show detail page component to read from the new shape.

**Author detail response:** Same pattern — remove per-profile `monitorNewBooks`, add entity-level field.

## Search Execution Model

Following Sonarr/Radarr/Readarr's pattern, search-after-add is **fire-and-forget**:

1. The add/import server function persists the entity to the database and returns immediately.
2. If `searchOnAdd` is true, the server function calls the appropriate search function **without awaiting it** (fire-and-forget). The add response is not blocked.
3. The frontend mutation's `onSuccess` fires immediately with the created entity, shows a success toast, and navigates to the detail page.
4. Search runs in the background. If it finds and grabs a release, the user sees it appear in Activity > Queue.
5. Search errors do **not** propagate to the add flow. They are logged server-side and visible in system events. The add operation is always considered successful independently of the search.

**Implementation:** Use `void searchFn(args).catch(logError)` pattern in the server function to fire-and-forget without blocking the response.

## Auto-Search Extension

### Current State

`runAutoSearch` in `src/server/auto-search.ts` only handles books. It finds wanted books (with profiles assigned, no files or below cutoff), searches indexers, and auto-grabs the best release.

### Extend to Movies

**Wanted movies detection (`getWantedMovies`):**

- Movies with at least one download profile assigned (`movieDownloadProfiles`)
- No movie files, OR files below quality cutoff with upgrades allowed
- Build search query: `"{title}" {year}`
- Simpler than books — no edition abstraction layer, direct movie-to-profile join

### Extend to TV Show Episodes

**Wanted episodes detection (`getWantedEpisodes`):**

- Episodes with download profiles assigned (via `episodeDownloadProfiles`)
- No episode files, OR files below quality cutoff with upgrades allowed
- Build search query: `"{show name}" S{season}E{episode}` (standard), `"{show name}" {air date}` (daily), `"{show name}" {absolute number}` (anime)
- Simpler than books — direct episode-to-profile join

### Per-Entity Search Functions

New server functions for triggering search after add:

| Function                 | File                        | Input                                       | Description                                                              |
| ------------------------ | --------------------------- | ------------------------------------------- | ------------------------------------------------------------------------ |
| `searchForMovieFn`       | `src/server/auto-search.ts` | `{ movieId: number }`                       | Auto-search for a single movie                                           |
| `searchForShowFn`        | `src/server/auto-search.ts` | `{ showId: number, cutoffUnmet?: boolean }` | Auto-search for missing (and optionally cutoff unmet) episodes of a show |
| `searchForAuthorBooksFn` | `src/server/auto-search.ts` | `{ authorId: number }`                      | Auto-search for all missing books by an author                           |
| `searchForBookFn`        | `src/server/auto-search.ts` | `{ bookId: number }`                        | Auto-search for a single book                                            |

These reuse the core auto-search scoring and grab logic but scoped to a single entity. They return `{ searched: number, grabbed: number }` for logging. Since they run fire-and-forget, the return value is not surfaced to the UI — it's logged to system events.

### `runAutoSearch` Changes

The existing `runAutoSearch` function is extended to call `getWantedMovies()` and `getWantedEpisodes()` in addition to the existing `getWantedBooks()`. The overall flow remains the same: find wanted items → search indexers → score → grab best per profile. The rate-limit delay (2 seconds between items) applies across all entity types.

## Monitoring Logic on Add

### Movie Monitor Options

| Option               | Behavior                                                                                                                                                                                                                                        |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `movieOnly`          | Movie gets selected download profiles. Collection (if exists) stays unmonitored.                                                                                                                                                                |
| `movieAndCollection` | Movie gets profiles. Collection set to `monitored: true` with same `downloadProfileIds` and `minimumAvailability`. Creates `movieCollectionDownloadProfiles` junctions. If movie has no TMDB collection, falls through to `movieOnly` silently. |
| `none`               | Movie added with no download profiles. Just tracked in library.                                                                                                                                                                                 |

### TV Show Monitor Options

| Option        | Which episodes get download profiles                          |
| ------------- | ------------------------------------------------------------- |
| `all`         | All existing episodes across all seasons (excluding specials) |
| `future`      | Episodes with `airDate` after today                           |
| `missing`     | Episodes without episode files                                |
| `existing`    | Episodes that already have files                              |
| `pilot`       | Only S01E01                                                   |
| `firstSeason` | Only season 1 episodes                                        |
| `lastSeason`  | Only the latest season's episodes                             |
| `none`        | No episodes get profiles                                      |

### Author/Book Monitor Options

| Option     | Which books get edition-profile links     |
| ---------- | ----------------------------------------- |
| `all`      | All books by this author                  |
| `future`   | Books with release date after today       |
| `missing`  | Books without any book files              |
| `existing` | Books that already have files             |
| `first`    | Only the earliest book by release date    |
| `latest`   | Only the most recent book by release date |
| `none`     | No books get monitored                    |

**Book import special case:** The explicitly imported book is **always** monitored regardless of the monitor option. The option only controls the other books by the same author.

## Server Function Changes

### Modified: `src/server/movies.ts`

| Function     | Change                                                                                                                                                                                                                              |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `addMovieFn` | Accept `monitorOption` and `searchOnAdd`. Handle "none" (skip profile assignment), "movieAndCollection" (set collection monitored + profiles, fall through to movieOnly if no collection). Fire-and-forget search if `searchOnAdd`. |

### Modified: `src/server/shows.ts`

| Function          | Change                                                                                                                                                                                                                                                                                       |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `addShowFn`       | Accept `useSeasonFolder`, `searchOnAdd`, `searchCutoffUnmet`. Store `monitorNewSeasons` (default "all") and `useSeasonFolder` on show. Fix `seriesType` to use `data.seriesType` instead of hardcoded `"standard"`. Apply monitor option to episodes. Fire-and-forget searches if requested. |
| `updateShowFn`    | Change from `downloadProfiles: [{downloadProfileId, monitorNewSeasons}]` to flat `downloadProfileIds` + entity-level `monitorNewSeasons`.                                                                                                                                                    |
| `getShowDetailFn` | Change response from `downloadProfiles: [{downloadProfileId, monitorNewSeasons}]` to `downloadProfileIds: number[]` + `monitorNewSeasons: string`.                                                                                                                                           |

### Modified: `src/server/import.ts` (or author/book import functions)

| Function      | Change                                                                                                                                                                                                                                         |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Author import | Accept `monitorOption`, `monitorNewBooks`, `searchOnAdd`. Store `monitorNewBooks` on author. Apply monitor option to determine which books get edition-profile links (primary author only). Fire-and-forget search if requested.               |
| Book import   | Accept `monitorOption`, `monitorNewBooks`, `searchOnAdd`. Store `monitorNewBooks` on author (if new author). Always monitor the selected book. Apply monitor option to other books (primary author only). Fire-and-forget search if requested. |

### Modified: `src/lib/validators.ts`

| Schema               | Change                                                                                                   |
| -------------------- | -------------------------------------------------------------------------------------------------------- |
| `updateAuthorSchema` | Change from per-profile `monitorNewBooks` to flat `downloadProfileIds` + entity-level `monitorNewBooks`. |

### Modified: `src/hooks/mutations/import.ts`

| Type               | Change                                                                                     |
| ------------------ | ------------------------------------------------------------------------------------------ |
| `ImportAuthorData` | Add `monitorOption`, `monitorNewBooks`, `searchOnAdd` fields to the manually-defined type. |
| `ImportBookData`   | Add `monitorOption`, `monitorNewBooks`, `searchOnAdd` fields to the manually-defined type. |

### New/Modified: `src/server/auto-search.ts`

| Function                 | Change                                                                                                                                           |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `runAutoSearch`          | Extend to also search for wanted movies and wanted episodes (in addition to books). Add `getWantedMovies()` and `getWantedEpisodes()` functions. |
| `searchForMovieFn`       | New — auto-search for a single movie                                                                                                             |
| `searchForShowFn`        | New — auto-search for missing/cutoff-unmet episodes of a show                                                                                    |
| `searchForAuthorBooksFn` | New — auto-search for missing books by an author                                                                                                 |
| `searchForBookFn`        | New — auto-search for a single book                                                                                                              |

## Out of Scope

- Bulk add/import with monitoring options
- Per-profile monitoring granularity (explicitly removed in favor of entity-level)
- Scheduled collection refresh triggering auto-search (collections auto-add already handles this)
- Download client health checks before search (errors logged server-side)
- Sonarr's `recent` (last 90 days), `monitorSpecials`, `unmonitorSpecials` monitor options (can be added later)
- Tags (Sonarr/Radarr support tags at add time; not part of Allstarr's current model)
- Root folder selection at add time (Allstarr uses root folders from download profiles)
- Metadata profile selection at add time (Readarr has this; Allstarr handles it differently)
