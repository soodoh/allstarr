# Movie Collection Add Flows

## Overview

Enhance the movie collections page so that clicking a missing movie opens an add-movie modal (reusing the existing `MoviePreviewModal`), and the "Add Missing" button opens a bulk-add dialog with user-configurable settings. Additionally, always propagate add-time settings to the parent collection, and add explanatory copy for collection monitoring.

## Flows

### Single Missing Movie Click

- Clicking a missing movie poster in a collection opens `MoviePreviewModal` (the same modal used in the TMDB search flow)
- The cached `CollectionMovie` data (`tmdbId`, `title`, `posterUrl`, `year`, `overview`) is mapped to the `TmdbMovieResult` shape expected by the modal
- Fields not available in the cache (`vote_average`, `popularity`) default to `0` — the modal already handles this gracefully (badges don't render for 0 values)
- After successful add, the modal closes and query invalidation refreshes the collection list
- No navigation occurs (previously this navigated to `/movies/add`)

### Bulk "Add Missing" Flow

- Clicking "Add Missing" on a collection card opens a new `AddMissingMoviesDialog`
- Dialog shows collection title and count (e.g., "Add 3 missing movies to The Dark Knight Collection")
- Contains the same settings form as `MoviePreviewModal`:
  - Download profiles (checkbox group, all selected by default)
  - Monitor option: "Movie Only" / "Movie & Collection" / "None" — **defaults to "Movie & Collection"** (unlike single-movie modal which defaults to "Movie Only")
  - Minimum availability: "Announced" / "In Cinemas" / "Released"
  - Search-on-add checkbox
- Confirm button text includes count: "Add 3 Movies"
- On confirm, calls the updated `addMissingCollectionMoviesFn` with user-chosen settings
- The server function adds each missing (non-excluded) movie, propagates settings to the collection, and fires search-on-add for each movie if enabled

### Explanatory copy for the monitor option:

- Below the monitor select in `AddMissingMoviesDialog`: _"'Movie & Collection' will automatically add future movies added to this collection on TMDB."_

## Server-Side Changes

### Collection Settings Propagation (`addMovieFn`)

When a movie is **added** to a collection (any monitor option):

- Update the collection's `minimumAvailability` to match the movie's setting
- Replace the collection's `downloadProfileIds` with the movie's profiles

When `monitorOption === "movieAndCollection"`:

- Additionally set `monitored: true` on the collection (existing behavior)

When a collection is **first created** (new insert during `addMovieFn`):

- Set `minimumAvailability` from the movie being added (currently defaults to "released")

**Editing** a movie (`updateMovieFn`) does **not** propagate settings to the collection.

### Bulk Add Function (`addMissingCollectionMoviesFn`)

Update the schema to accept: `collectionId`, `downloadProfileIds`, `minimumAvailability`, `monitorOption`, `searchOnAdd`.

Behavior:

1. Update the collection's settings (`minimumAvailability`, `downloadProfileIds`, and `monitored` if "movieAndCollection")
2. For each missing, non-excluded movie in the collection:
   - Fetch movie detail from TMDB
   - Insert movie with the provided settings
   - Assign download profiles (unless `monitorOption === "none"`)
   - Fire `searchForMovie` if `searchOnAdd` is true
   - Record history event

### Edit Collection Dialog

Add explanatory copy below the "Monitored" toggle: _"When monitored, new movies added to this collection on TMDB will be automatically added to your library."_

## Component Changes

### `collections.tsx`

- Replace `handleAddMovie` (navigates to `/movies/add`) with state to track a selected movie for `MoviePreviewModal`
- Replace direct `addMissing.mutate({ collectionId })` with state to open `AddMissingMoviesDialog`
- Render both `MoviePreviewModal` and `AddMissingMoviesDialog`

### `collection-card.tsx`

- `onAddMovie` prop: change from `(tmdbId: number) => void` to `(movie: CollectionMovie) => void`
- `onAddMissing` prop: change from `(collectionId: number) => void` to `(collection: Collection) => void`

### `collection-movie-poster.tsx`

- `onAddMovie` prop: change from `(tmdbId: number) => void` to `(movie: CollectionMovie) => void`
- Click handler passes full movie object instead of just tmdbId

### New: `add-missing-movies-dialog.tsx`

- Accepts collection (with missing movie count) and open/onOpenChange props
- Renders the settings form (download profiles, monitor, min availability, search-on-add)
- Defaults monitor option to "Movie & Collection"
- Calls updated `addMissingCollectionMoviesFn` mutation on confirm

### `edit-collection-dialog.tsx`

- Add description text below the Monitored switch

### `tmdb-validators.ts`

- Update `addMissingCollectionMoviesSchema` to include `downloadProfileIds`, `minimumAvailability`, `monitorOption`, `searchOnAdd`

### `hooks/mutations/movie-collections.ts`

- Update `useAddMissingCollectionMovies` mutation type to match new schema

## Out of Scope

- Checkbox selection of individual movies in the bulk flow (all non-excluded missing movies are added)
- Changes to movie editing propagating to collections
- Changes to the TMDB search page add flow (only collection page flows are affected)
