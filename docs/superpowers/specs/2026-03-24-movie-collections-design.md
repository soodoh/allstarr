# Movie Collections Design Specification

**Date:** 2026-03-24
**Status:** Approved

## Overview

Add a Collections page under Movies with feature parity to Radarr's collections. Collections are auto-discovered from TMDB's `belongs_to_collection` metadata when movies are added or refreshed. Monitored collections auto-add new movies to the library.

## Data Model

### New Table: `movieCollections`

| Column                | Type                | Constraints                  | Description                                                                         |
| --------------------- | ------------------- | ---------------------------- | ----------------------------------------------------------------------------------- |
| `id`                  | integer             | PK, auto-increment           | Internal ID                                                                         |
| `title`               | text                | NOT NULL                     | Collection name (e.g., "The Lord of the Rings Collection")                          |
| `sortTitle`           | text                | NOT NULL                     | Title without leading articles for sorting                                          |
| `tmdbId`              | integer             | UNIQUE, NOT NULL             | TMDB collection ID                                                                  |
| `overview`            | text                |                              | Collection synopsis from TMDB                                                       |
| `posterUrl`           | text                | nullable                     | Full TMDB poster URL (w500)                                                         |
| `fanartUrl`           | text                | nullable                     | Full TMDB backdrop URL (original)                                                   |
| `monitored`           | integer             | NOT NULL, default 0          | Boolean — whether to auto-add new movies                                            |
| `minimumAvailability` | text                | NOT NULL, default "released" | Default availability for auto-added movies ("announced" / "inCinemas" / "released") |
| `lastInfoSync`        | integer (timestamp) | nullable                     | Last time collection was synced with TMDB                                           |
| `createdAt`           | integer (timestamp) | NOT NULL                     | Auto-set on creation                                                                |
| `updatedAt`           | integer (timestamp) | NOT NULL                     | Auto-set on creation and update                                                     |

### New Table: `movieCollectionDownloadProfiles`

Join table linking collections to download profiles (matches existing `movieDownloadProfiles` pattern).

| Column              | Type    | Constraints                                             | Description          |
| ------------------- | ------- | ------------------------------------------------------- | -------------------- |
| `id`                | integer | PK, auto-increment                                      | Internal ID          |
| `collectionId`      | integer | NOT NULL, FK → `movieCollections.id`, ON DELETE CASCADE | Collection reference |
| `downloadProfileId` | integer | NOT NULL, FK → `downloadProfiles.id`, ON DELETE CASCADE | Profile reference    |

Composite unique constraint on `(collectionId, downloadProfileId)`.

### New Table: `movieCollectionMovies`

Caches the list of movies that TMDB reports for each collection. Updated during collection refresh. Used to compute missing counts without calling TMDB on every page load.

| Column         | Type    | Constraints                                             | Description                             |
| -------------- | ------- | ------------------------------------------------------- | --------------------------------------- |
| `id`           | integer | PK, auto-increment                                      | Internal ID                             |
| `collectionId` | integer | NOT NULL, FK → `movieCollections.id`, ON DELETE CASCADE | Parent collection                       |
| `tmdbId`       | integer | NOT NULL                                                | TMDB movie ID                           |
| `title`        | text    | NOT NULL                                                | Movie title from TMDB                   |
| `overview`     | text    |                                                         | Movie overview from TMDB                |
| `posterUrl`    | text    | nullable                                                | Full TMDB poster URL (w500)             |
| `releaseDate`  | text    |                                                         | Release date string from TMDB           |
| `year`         | integer | nullable                                                | Extracted from release_date for display |

Composite unique constraint on `(collectionId, tmdbId)`.

### New Table: `movieImportListExclusions`

| Column      | Type                | Constraints        | Description          |
| ----------- | ------------------- | ------------------ | -------------------- |
| `id`        | integer             | PK, auto-increment | Internal ID          |
| `tmdbId`    | integer             | UNIQUE, NOT NULL   | TMDB movie ID        |
| `title`     | text                | NOT NULL           | For display          |
| `year`      | integer             | nullable           | For display          |
| `createdAt` | integer (timestamp) | NOT NULL           | Auto-set on creation |

### Modified Table: `movies`

| Column         | Type    | Constraints                                              | Description                   |
| -------------- | ------- | -------------------------------------------------------- | ----------------------------- |
| `collectionId` | integer | nullable, FK → `movieCollections.id`, ON DELETE SET NULL | Links movie to its collection |

Add an **index** on `movies.collectionId` for efficient "get all movies in collection X" queries.

**Drizzle FK note:** Define the FK reference in `src/db/schema/movies.ts` using Drizzle's table reference to `movieCollections`. The `movieCollections` table should be defined in its own schema file (`src/db/schema/movie-collections.ts`) and exported via `src/db/schema/index.ts`.

### Modified Type: `TmdbMovieDetail`

Add the `belongs_to_collection` field that TMDB returns on movie detail responses:

```typescript
belongs_to_collection: {
  id: number;
  name: string;
  poster_path: string | null;
  backdrop_path: string | null;
} | null;
```

## Collection Discovery

Collections are never manually created. They are auto-discovered:

1. **When adding a movie** (`addMovieFn`): After fetching TMDB movie detail, if `belongs_to_collection` is present, upsert the collection into `movieCollections` (insert or update metadata if already exists). Set the movie's `collectionId`. New collections start unmonitored.

2. **When refreshing movie metadata** (`refreshMovieMetadataFn`): Same upsert logic. If the movie's collection changed on TMDB, update accordingly.

## Collection Refresh (Auto-Add Flow)

### New TMDB Function: `getTmdbCollectionDetailFn`

- **File:** `src/server/tmdb/collections.ts`
- **Endpoint:** `GET /collection/{collectionId}`
- **Returns:** Collection metadata (name, overview, poster, backdrop) + array of movie parts (id, title, overview, poster_path, backdrop_path, release_date, adult)

### New Server Function: `refreshCollectionsFn`

- **File:** `src/server/movie-collections.ts`
- **Method:** POST
- **Flow:**
  1. Fetch all monitored collections from DB
  2. For each collection, call `getTmdbCollectionDetailFn` to get current TMDB movie list
  3. Update collection metadata (title, overview, images) from TMDB response
  4. Upsert `movieCollectionMovies` — insert new parts, update existing, delete parts no longer in TMDB response
  5. Load all `movieImportListExclusions` tmdbIds into a Set for exclusion checking
  6. Load all existing movie tmdbIds into a Set
  7. For each movie part in the TMDB response:
     - Skip if `tmdbId` is in existing movies Set
     - Skip if `tmdbId` is in exclusions Set
     - Otherwise, fetch full movie detail via `getTmdbMovieDetailFn(tmdbId)` (needed for genres, runtime, studio, imdb_id, status)
     - Create movie record with the collection's `minimumAvailability`, set `collectionId`
     - Create `movieDownloadProfiles` junctions from the collection's `movieCollectionDownloadProfiles`
     - Log `movieAdded` history event
  8. Update `lastInfoSync` timestamp on the collection
- **Movie `path` column:** Auto-added movies get `path: ""` (same as manual add via `addMovieFn`). The path is populated later during file import, not at add time.
- **Rate limiting:** TMDB calls are already rate-limited via the shared `tmdbFetch` client (40 req/10s). For large collections, this is sufficient.
- **TMDB data consistency:** If TMDB removes a movie from a collection response, delete the cached entry from `movieCollectionMovies` but do NOT clear `collectionId` on any existing movie that was already added. The movie retains its collection association even if TMDB temporarily delists it.

### New Server Function: `addMissingCollectionMoviesFn`

- **File:** `src/server/movie-collections.ts`
- **Method:** POST
- **Input:** `{ collectionId: number }`
- **Purpose:** Add all missing (non-excluded, non-existing) movies from a single collection. Same logic as `refreshCollectionsFn` step 4-7 but scoped to one collection. Does NOT require the collection to be monitored. Used by the "Add All Missing" button on collection cards.

## Server Functions

### New: `src/server/movie-collections.ts`

| Function                       | Method | Input                                                           | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ------------------------------ | ------ | --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `getMovieCollectionsFn`        | GET    | none                                                            | List all collections with their `movieCollectionMovies` entries. For each collection movie, annotate as `isExisting` (tmdbId matches a movie in library) or `isExcluded` (tmdbId in `movieImportListExclusions`). For existing movies, include the internal `movieId` (from joining `movieCollectionMovies.tmdbId` against `movies.tmdbId`) so the UI can build navigation links. Compute `missingMovies` count from these annotations. Also join `movieCollectionDownloadProfiles` to return profile IDs. |
| `updateMovieCollectionFn`      | POST   | `{ id, monitored?, downloadProfileIds?, minimumAvailability? }` | Update collection settings. When `downloadProfileIds` is provided, delete existing `movieCollectionDownloadProfiles` rows and insert new ones.                                                                                                                                                                                                                                                                                                                                                             |
| `refreshCollectionsFn`         | POST   | none                                                            | Sync all monitored collections with TMDB, update cached parts, auto-add missing movies                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `addMissingCollectionMoviesFn` | POST   | `{ collectionId: number }`                                      | Add all missing movies from a single collection                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `addMovieImportExclusionFn`    | POST   | `{ tmdbId: number, title: string, year?: number }`              | Manually exclude a TMDB movie (used from collections page to exclude a missing movie without adding it first)                                                                                                                                                                                                                                                                                                                                                                                              |

### Modified: `src/server/movies.ts`

| Function                 | Change                                                                                                                                                               |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `addMovieFn`             | After fetching TMDB detail, upsert collection from `belongs_to_collection` (insert into `movieCollections` or update metadata). Set `collectionId` on the new movie. |
| `refreshMovieMetadataFn` | Same upsert logic as `addMovieFn`                                                                                                                                    |
| `deleteMovieFn`          | Add optional `addImportExclusion` boolean input. When true, insert into `movieImportListExclusions` with the movie's `tmdbId`, `title`, and `year`.                  |

**Shared utilities:** Extract `mapMovieStatus`, `transformImagePath`, and `generateSortTitle` from `src/server/movies.ts` into a shared module (`src/server/utils/movie-helpers.ts`) so they can be reused by `movie-collections.ts` and `tmdb/movies.ts`. The canonical `mapMovieStatus` should be the version from `src/server/movies.ts` which includes `inCinemas` (needed by `minimumAvailability`). The `tmdb/movies.ts` version should be replaced to use the shared one. Canonical status values: `tba | announced | inCinemas | released | deleted | canceled`.

### Modified: `src/server/import-list-exclusions.ts`

| Function                       | Change                                                                                                                        |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| `getBookImportExclusionsFn`    | Rename from `getImportListExclusionsFn`. Returns only book exclusions with pagination `{ page, limit }` → `{ items, total }`. |
| `getMovieImportExclusionsFn`   | New function. Same pattern, queries `movieImportListExclusions`. Returns `{ items, total }`.                                  |
| `removeBookImportExclusionFn`  | Rename from `removeImportListExclusionFn`. Deletes from `bookImportListExclusions`.                                           |
| `removeMovieImportExclusionFn` | New function. Deletes from `movieImportListExclusions`.                                                                       |

**Rationale:** Separate functions per type is simpler than combining two differently-shaped tables with a type discriminator. The UI uses separate tabs anyway, so each tab queries its own function.

### New: `src/server/tmdb/collections.ts`

| Function                    | Method | Input                | Description                                                                           |
| --------------------------- | ------ | -------------------- | ------------------------------------------------------------------------------------- |
| `getTmdbCollectionDetailFn` | GET    | `{ tmdbId: number }` | Fetch `/collection/{collectionId}` from TMDB API. Transform image paths to full URLs. |

## New TMDB Type: `TmdbCollectionDetail`

**File:** `src/server/tmdb/types.ts`

```typescript
type TmdbCollectionDetail = {
  id: number;
  name: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  parts: Array<{
    id: number;
    title: string;
    overview: string;
    poster_path: string | null;
    backdrop_path: string | null;
    release_date: string;
    adult: boolean;
  }>;
};
```

## React Hooks

### New: `src/hooks/mutations/movie-collections.ts`

| Hook                            | Server Function                | Cache Invalidation                                  |
| ------------------------------- | ------------------------------ | --------------------------------------------------- |
| `useUpdateMovieCollection`      | `updateMovieCollectionFn`      | `["movieCollections"]`                              |
| `useRefreshCollections`         | `refreshCollectionsFn`         | `["movieCollections"]`, `["movies"]`                |
| `useAddMissingCollectionMovies` | `addMissingCollectionMoviesFn` | `["movieCollections"]`, `["movies"]`, `["history"]` |
| `useAddMovieImportExclusion`    | `addMovieImportExclusionFn`    | `["movieCollections"]`                              |

### New: `src/lib/queries/movie-collections.ts`

| Query                       | Server Function         | Cache Key                      |
| --------------------------- | ----------------------- | ------------------------------ |
| `movieCollectionsListQuery` | `getMovieCollectionsFn` | `["movieCollections", "list"]` |

### Modified: `src/lib/query-keys.ts`

Add new key namespace:

```typescript
movieCollections: {
  all: ["movieCollections"],
  list: () => ["movieCollections", "list"],
}
```

### Modified: `src/lib/queries/import-exclusions.ts` (rename from current query file)

Split existing query into two:

| Query                        | Server Function              | Cache Key                        |
| ---------------------------- | ---------------------------- | -------------------------------- |
| `bookImportExclusionsQuery`  | `getBookImportExclusionsFn`  | `["importExclusions", "books"]`  |
| `movieImportExclusionsQuery` | `getMovieImportExclusionsFn` | `["importExclusions", "movies"]` |

## Validators

### New Zod Schemas in `src/lib/tmdb-validators.ts`

```typescript
export const updateMovieCollectionSchema = z.object({
  id: z.number(),
  monitored: z.boolean().optional(),
  downloadProfileIds: z.array(z.number()).optional(),
  minimumAvailability: z
    .enum(["announced", "inCinemas", "released"])
    .optional(),
});

export const addMissingCollectionMoviesSchema = z.object({
  collectionId: z.number(),
});

export const addMovieImportExclusionSchema = z.object({
  tmdbId: z.number(),
  title: z.string(),
  year: z.number().optional(),
});
```

### Modified Zod Schema in `src/lib/tmdb-validators.ts`

```typescript
// Extend existing deleteMovieSchema
export const deleteMovieSchema = z.object({
  id: z.number(),
  deleteFiles: z.boolean().default(false),
  addImportExclusion: z.boolean().default(false), // NEW
});
```

### Modified Zod Schema in `src/lib/validators.ts`

The existing `removeImportListExclusionSchema` stays in `validators.ts`. Add a parallel one for movies:

```typescript
export const removeMovieImportExclusionSchema = z.object({
  id: z.number(),
});
```

## UI: Collections Page

### Route

- **Path:** `/movies/collections`
- **File:** `src/routes/_authed/movies/collections.tsx`

### Navigation

Add "Collections" to the Movies sidebar group in `app-sidebar.tsx`, between "Movies" and "Calendar". Import `FolderOpen` from `lucide-react`:

```typescript
// Movies children:
{ title: "Add New", to: "/movies/add", icon: Plus },
{ title: "Movies", to: "/movies", icon: Film },
{ title: "Collections", to: "/movies/collections", icon: FolderOpen }, // NEW
{ title: "Calendar", to: "/movies/calendar", icon: Calendar },
```

### Page Layout

1. **PageHeader:** Title "Collections", "Refresh All" button (triggers `refreshCollectionsFn`)
2. **Filter Bar:**
   - Quick filters: All / Missing / Complete
   - Text search by collection title
   - Sort dropdown: Title (A-Z) / Missing (desc)
3. **Collection Cards** — stacked vertically, one per collection:
   - **Left:** Collection poster thumbnail (80px wide)
   - **Right top:** Monitor toggle (green/gray dot) + collection title + "{n} movies · {m} missing" subtitle
   - **Right middle:** Truncated overview text
   - **Right bottom:** Horizontal row of mini movie posters:
     - Green border = in library (clickable → navigates to `/movies/{movieId}`)
     - Red border + dimmed = missing (clickable → opens add-movie dialog, passing `tmdbId` from `movieCollectionMovies`)
     - Strikethrough opacity = excluded (clickable → tooltip showing "Excluded from import")
   - **Card actions:**
     - Edit button → opens Edit Collection Modal
     - "Add All Missing" button → calls `addMissingCollectionMoviesFn` with collection ID
   - **Missing movie context menu:** Right-click or long-press on a missing movie poster shows option to "Exclude from import" (calls `addMovieImportExclusionFn`)
4. **Empty State:** "No collections found. Collections are automatically discovered when you add movies that belong to a TMDB collection."

### Edit Collection Modal

- Monitored toggle
- Download Profile multi-select (populated from download profiles with `contentType: "movie"`)
- Minimum Availability dropdown (Announced / In Cinemas / Released)
- Save / Cancel buttons

### New Components in `src/components/movies/`

| Component                     | Purpose                                                                                          |
| ----------------------------- | ------------------------------------------------------------------------------------------------ |
| `collection-card.tsx`         | Single collection overview card                                                                  |
| `collection-movie-poster.tsx` | Mini movie poster with status border (existing/missing/excluded) and click/context-menu behavior |
| `edit-collection-dialog.tsx`  | Modal for editing collection settings                                                            |

## UI: Import List Exclusions Updates

### Settings Page (`/settings/import-lists`)

- Add **tab navigation**: "Book Exclusions" / "Movie Exclusions"
- Each tab queries its own server function independently (`getBookImportExclusionsFn` / `getMovieImportExclusionsFn`)
- Movie exclusions table columns: Title, Year, Date Excluded, Remove button
- Same layout and interaction pattern as existing book exclusions tab

### Delete Movie Dialog

- Add "Prevent this movie from being re-added by collections" checkbox
- Only visible when the movie has a `collectionId` pointing to a monitored collection
- Maps to `addImportExclusion` flag in `deleteMovieFn`

## Out of Scope

- Manual collection creation/search (collections are auto-discovered only)
- Collection detail page (all interaction happens on the list page via cards and modals)
- Bulk edit of multiple collections (can be added later)
- Custom filter builder (quick filters + search + sort is sufficient)
- `searchOnAdd` flag (all monitored collections auto-add; users who don't want auto-add simply don't monitor)
