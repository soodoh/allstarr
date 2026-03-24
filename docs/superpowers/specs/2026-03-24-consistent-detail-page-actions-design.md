# Consistent Detail Page Actions

## Problem

The author, TV show, and movie detail pages have inconsistent action buttons — different order, different placement, and missing functionality. Movies and TV shows lack an "Update Metadata" button, and button styling varies across pages.

## Solution

Unify all three detail pages with a consistent connected button group (icon-only buttons with tooltips), consistent placement, and add TMDB metadata refresh for movies and TV shows.

## UI Design

### Button Group Component

Create a shared `ActionButtonGroup` component used by all three detail header components.

**Button order (left to right):**

1. **Update Metadata** — `RefreshCw` icon, tooltip: "Update Metadata". Swaps to spinning `Loader2` while pending.
2. **Edit** — `Pencil` icon, tooltip: "Edit" (generic — authors open author form, TV/movies open profiles editor)
3. **Delete** — `Trash2` icon, tooltip: "Delete". Uses `text-destructive` color.
4. **External Link** — `ExternalLink` icon, tooltip: "Open in Hardcover" (authors) or "Open in TMDB" (movies/TV)

**Styling:**

- Connected button group — buttons share borders with no gaps
- Implemented via Tailwind classes: `inline-flex` wrapper, child buttons with `rounded-none`, first child gets `rounded-l-md`, last child gets `rounded-r-md`, inner dividers via `border-r`
- Uses shadcn `Button` component with `variant="outline"` and `size="icon"`
- Wrapped in `TooltipProvider` with `Tooltip`/`TooltipTrigger`/`TooltipContent` around each button

### Placement

All three pages place the button group in the **back-link row**, right-aligned — matching the current TV show and movie layout pattern.

**Changes per page:**

- **Authors** (`$authorId.tsx`): Move buttons out of `PageHeader` `actions` prop into a new back-link row above `PageHeader`. Add back-link row matching TV/movie pattern.
- **TV Shows** (`show-detail-header.tsx`): Replace existing `<div className="flex gap-2">` with `ActionButtonGroup`. Add Update Metadata button.
- **Movies** (`movie-detail-header.tsx`): Replace existing `<div className="flex gap-2">` with `ActionButtonGroup`. Add Update Metadata button.

### Component Props

```typescript
type ActionButtonGroupProps = {
  onRefreshMetadata: () => void;
  isRefreshing: boolean;
  onEdit: () => void;
  onDelete: () => void;
  externalUrl: string | null; // null hides the button (e.g. author without Hardcover slug)
  externalLabel: string; // "Open in Hardcover" or "Open in TMDB"
};
```

## Backend Changes

### New Server Functions

**`refreshMovieMetadataFn`** in `src/server/movies.ts`:

- Input: `{ movieId: number }`
- Fetches fresh data from TMDB via existing `tmdbFetch<TmdbMovieDetail>(`/movie/${tmdbId}`)`
- Updates movie record fields: title, sortTitle, overview, tmdbId, imdbId, status, studio, year, runtime, genres, posterUrl, fanartUrl
- Reuses existing field mapping logic from `addMovieFn`
- Returns updated movie

**`refreshShowMetadataFn`** in `src/server/shows.ts`:

- Input: `{ showId: number }`
- Fetches fresh show data from TMDB
- Updates show record fields: title, sortTitle, overview, status, network, year, runtime, genres, posterUrl, fanartUrl
- Iterates seasons via TMDB season detail endpoint:
  - Adds new seasons/episodes not yet in DB
  - Updates existing season/episode metadata (title, overview, airDate, runtime, etc.)
- Returns updated show

### New Mutation Hooks

**`useRefreshMovieMetadata`** in `src/hooks/mutations/movies.ts`:

- Calls `refreshMovieMetadataFn`
- On success: invalidates `movieDetailQuery`, shows success toast

**`useRefreshShowMetadata`** in `src/hooks/mutations/shows.ts`:

- Calls `refreshShowMetadataFn`
- On success: invalidates `showDetailQuery`, shows success toast

### No Schema Changes

All necessary DB columns already exist. Only new server functions and mutation hooks are needed.

## Files Changed

| File                                            | Change                                                         |
| ----------------------------------------------- | -------------------------------------------------------------- |
| `src/components/shared/action-button-group.tsx` | New shared component                                           |
| `src/server/movies.ts`                          | Add `refreshMovieMetadataFn`                                   |
| `src/server/shows.ts`                           | Add `refreshShowMetadataFn`                                    |
| `src/hooks/mutations/movies.ts`                 | Add `useRefreshMovieMetadata` hook                             |
| `src/hooks/mutations/shows.ts`                  | Add `useRefreshShowMetadata` hook                              |
| `src/routes/_authed/authors/$authorId.tsx`      | Move buttons to back-link row, use `ActionButtonGroup`         |
| `src/components/tv/show-detail-header.tsx`      | Replace buttons with `ActionButtonGroup`, add metadata refresh |
| `src/components/movies/movie-detail-header.tsx` | Replace buttons with `ActionButtonGroup`, add metadata refresh |
