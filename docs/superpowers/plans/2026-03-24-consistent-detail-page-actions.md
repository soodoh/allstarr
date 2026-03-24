# Consistent Detail Page Actions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unify author, TV show, and movie detail pages with a consistent connected button group (icon-only + tooltips) and add TMDB metadata refresh for movies/TV shows.

**Architecture:** Create a shared `ActionButtonGroup` component that renders a connected row of icon-only buttons with shadcn tooltips. Add `refreshMovieMetadataFn` and `refreshShowMetadataFn` server functions that re-fetch from TMDB and update the local DB. Wire everything together in the three detail header components.

**Tech Stack:** React, TanStack Start (createServerFn), shadcn/ui (Button, Tooltip), Tailwind CSS v4, Drizzle ORM, lucide-react icons

**Spec:** `docs/superpowers/specs/2026-03-24-consistent-detail-page-actions-design.md`

---

## File Structure

| File                                            | Action | Responsibility                                         |
| ----------------------------------------------- | ------ | ------------------------------------------------------ |
| `src/lib/tmdb-validators.ts`                    | Modify | Add `refreshMovieSchema` and `refreshShowSchema`       |
| `src/server/movies.ts`                          | Modify | Add `refreshMovieMetadataFn`                           |
| `src/server/shows.ts`                           | Modify | Add `refreshShowMetadataFn`                            |
| `src/hooks/mutations/movies.ts`                 | Modify | Add `useRefreshMovieMetadata` hook                     |
| `src/hooks/mutations/shows.ts`                  | Modify | Add `useRefreshShowMetadata` hook                      |
| `src/components/shared/action-button-group.tsx` | Create | Shared connected button group with tooltips            |
| `src/components/movies/movie-detail-header.tsx` | Modify | Use `ActionButtonGroup`, add metadata refresh          |
| `src/components/tv/show-detail-header.tsx`      | Modify | Use `ActionButtonGroup`, add metadata refresh          |
| `src/routes/_authed/authors/$authorId.tsx`      | Modify | Move buttons to back-link row, use `ActionButtonGroup` |

---

### Task 1: Add Validator Schemas

**Files:**

- Modify: `src/lib/tmdb-validators.ts:48` (after `deleteMovieSchema`)

- [ ] **Step 1: Add refresh schemas to tmdb-validators.ts**

Add at end of file (before the closing newline):

```typescript
export const refreshMovieSchema = z.object({
  movieId: z.number(),
});

export const refreshShowSchema = z.object({
  showId: z.number(),
});
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/tmdb-validators.ts
git commit -m "feat: add refresh metadata validator schemas for movies and shows"
```

---

### Task 2: Add refreshMovieMetadataFn Server Function

**Files:**

- Modify: `src/server/movies.ts:276` (append after `checkMovieExistsFn`)

- [ ] **Step 1: Add refreshMovieMetadataFn**

Import the new schema at the top of the file — add `refreshMovieSchema` to the existing import from `src/lib/tmdb-validators`:

```typescript
import {
  addMovieSchema,
  updateMovieSchema,
  deleteMovieSchema,
  refreshMovieSchema,
} from "src/lib/tmdb-validators";
```

Append after the last export (`checkMovieExistsFn`) at line 276:

```typescript
export const refreshMovieMetadataFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => refreshMovieSchema.parse(d))
  .handler(async ({ data }) => {
    await requireAuth();

    const movie = db
      .select({ id: movies.id, tmdbId: movies.tmdbId })
      .from(movies)
      .where(eq(movies.id, data.movieId))
      .get();

    if (!movie) {
      throw new Error("Movie not found");
    }

    const raw = await tmdbFetch<TmdbMovieDetail>(`/movie/${movie.tmdbId}`);

    const title = raw.title;
    const sortTitle = generateSortTitle(title);
    const status = mapMovieStatus(raw.status);
    const studio = raw.production_companies[0]?.name ?? "";
    const year = raw.release_date
      ? Number.parseInt(raw.release_date.split("-")[0], 10)
      : 0;
    const runtime = raw.runtime ?? 0;
    const genres = raw.genres.map((g) => g.name);
    const posterUrl = transformImagePath(raw.poster_path, "w500") ?? "";
    const fanartUrl = transformImagePath(raw.backdrop_path, "original") ?? "";
    const imdbId = raw.imdb_id ?? null;

    db.update(movies)
      .set({
        title,
        sortTitle,
        overview: raw.overview,
        imdbId,
        status,
        studio,
        year,
        runtime,
        genres,
        posterUrl,
        fanartUrl,
      })
      .where(eq(movies.id, data.movieId))
      .run();

    return { success: true };
  });
```

This reuses the same field mapping logic from `addMovieFn` (lines 66-80) but does an UPDATE instead of INSERT.

- [ ] **Step 2: Verify build**

Run: `bun run build`
Expected: No type errors

- [ ] **Step 3: Commit**

```bash
git add src/server/movies.ts
git commit -m "feat: add refreshMovieMetadataFn to re-fetch movie data from TMDB"
```

---

### Task 3: Add refreshShowMetadataFn Server Function

**Files:**

- Modify: `src/server/shows.ts:634` (append after `bulkUnmonitorEpisodeProfileFn`)

- [ ] **Step 1: Add refreshShowMetadataFn**

Import the new schema — add `refreshShowSchema` to the existing import from `src/lib/tmdb-validators`:

```typescript
import {
  addShowSchema,
  updateShowSchema,
  deleteShowSchema,
  monitorEpisodeProfileSchema,
  unmonitorEpisodeProfileSchema,
  bulkMonitorEpisodeProfileSchema,
  bulkUnmonitorEpisodeProfileSchema,
  refreshShowSchema,
} from "src/lib/tmdb-validators";
```

Append after the last export at line 634:

```typescript
export const refreshShowMetadataFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => refreshShowSchema.parse(d))
  .handler(async ({ data }) => {
    await requireAuth();

    const show = db
      .select({ id: shows.id, tmdbId: shows.tmdbId })
      .from(shows)
      .where(eq(shows.id, data.showId))
      .get();

    if (!show) {
      throw new Error("Show not found");
    }

    // Fetch updated show detail from TMDB
    const raw = await tmdbFetch<TmdbShowDetail>(`/tv/${show.tmdbId}`, {
      append_to_response: "external_ids",
    });

    const title = raw.name;
    const sortTitle = generateSortTitle(title);
    const status = mapShowStatus(raw.status);
    const network = raw.networks[0]?.name ?? "";
    const year = raw.first_air_date
      ? Number.parseInt(raw.first_air_date.split("-")[0], 10)
      : 0;
    const runtime = raw.episode_run_time[0] ?? 0;
    const genres = raw.genres.map((g) => g.name);
    const posterUrl = transformImagePath(raw.poster_path, "w500") ?? "";
    const fanartUrl = transformImagePath(raw.backdrop_path, "original") ?? "";
    const imdbId = raw.external_ids?.imdb_id ?? null;

    // Update show metadata
    db.update(shows)
      .set({
        title,
        sortTitle,
        overview: raw.overview,
        imdbId,
        status,
        network,
        year,
        runtime,
        genres,
        posterUrl,
        fanartUrl,
      })
      .where(eq(shows.id, data.showId))
      .run();

    // Refresh seasons and episodes
    for (const seasonSummary of raw.seasons) {
      const seasonDetail = await tmdbFetch<TmdbSeasonDetail>(
        `/tv/${show.tmdbId}/season/${seasonSummary.season_number}`,
      );

      // Check if season already exists
      const existingSeason = db
        .select({ id: seasons.id })
        .from(seasons)
        .where(
          and(
            eq(seasons.showId, show.id),
            eq(seasons.seasonNumber, seasonSummary.season_number),
          ),
        )
        .get();

      let seasonId: number;

      if (existingSeason) {
        // Update existing season metadata
        db.update(seasons)
          .set({
            overview: seasonSummary.overview || null,
            posterUrl: transformImagePath(seasonSummary.poster_path, "w500"),
          })
          .where(eq(seasons.id, existingSeason.id))
          .run();
        seasonId = existingSeason.id;
      } else {
        // Insert new season
        const newSeason = db
          .insert(seasons)
          .values({
            showId: show.id,
            seasonNumber: seasonSummary.season_number,
            overview: seasonSummary.overview || null,
            posterUrl: transformImagePath(seasonSummary.poster_path, "w500"),
          })
          .returning()
          .get();
        seasonId = newSeason.id;
      }

      // Process episodes
      for (const ep of seasonDetail.episodes) {
        const existingEpisode = db
          .select({ id: episodes.id })
          .from(episodes)
          .where(
            and(
              eq(episodes.seasonId, seasonId),
              eq(episodes.episodeNumber, ep.episode_number),
            ),
          )
          .get();

        if (existingEpisode) {
          // Update existing episode metadata
          db.update(episodes)
            .set({
              title: ep.name,
              overview: ep.overview || null,
              airDate: ep.air_date,
              runtime: ep.runtime,
              tmdbId: ep.id,
            })
            .where(eq(episodes.id, existingEpisode.id))
            .run();
        } else {
          // Insert new episode
          db.insert(episodes)
            .values({
              showId: show.id,
              seasonId,
              episodeNumber: ep.episode_number,
              title: ep.name,
              overview: ep.overview || null,
              airDate: ep.air_date,
              runtime: ep.runtime,
              tmdbId: ep.id,
              hasFile: false,
            })
            .run();
        }
      }
    }

    return { success: true };
  });
```

This follows the same TMDB fetch + field mapping pattern from `addShowFn` (lines 200-281) but updates existing records and upserts seasons/episodes.

- [ ] **Step 2: Verify build**

Run: `bun run build`
Expected: No type errors

- [ ] **Step 3: Commit**

```bash
git add src/server/shows.ts
git commit -m "feat: add refreshShowMetadataFn to re-fetch show/season/episode data from TMDB"
```

---

### Task 4: Add Mutation Hooks

**Files:**

- Modify: `src/hooks/mutations/movies.ts:53` (append after `useDeleteMovie`)
- Modify: `src/hooks/mutations/shows.ts:53` (append after `useDeleteShow`)

- [ ] **Step 1: Add useRefreshMovieMetadata hook**

Add `refreshMovieMetadataFn` to the import from `src/server/movies`:

```typescript
import {
  addMovieFn,
  updateMovieFn,
  deleteMovieFn,
  refreshMovieMetadataFn,
} from "src/server/movies";
```

Append after `useDeleteMovie`:

```typescript
export function useRefreshMovieMetadata() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (movieId: number) =>
      refreshMovieMetadataFn({ data: { movieId } }),
    onSuccess: () => {
      toast.success("Movie metadata updated");
      queryClient.invalidateQueries({ queryKey: queryKeys.movies.all });
    },
    onError: () => toast.error("Failed to refresh movie metadata"),
  });
}
```

- [ ] **Step 2: Add useRefreshShowMetadata hook**

Add `refreshShowMetadataFn` to the import from `src/server/shows`:

```typescript
import {
  addShowFn,
  updateShowFn,
  deleteShowFn,
  refreshShowMetadataFn,
} from "src/server/shows";
```

Append after `useDeleteShow`:

```typescript
export function useRefreshShowMetadata() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (showId: number) => refreshShowMetadataFn({ data: { showId } }),
    onSuccess: () => {
      toast.success("Show metadata updated");
      queryClient.invalidateQueries({ queryKey: queryKeys.shows.all });
    },
    onError: () => toast.error("Failed to refresh show metadata"),
  });
}
```

- [ ] **Step 3: Verify build**

Run: `bun run build`
Expected: No type errors

- [ ] **Step 4: Commit**

```bash
git add src/hooks/mutations/movies.ts src/hooks/mutations/shows.ts
git commit -m "feat: add useRefreshMovieMetadata and useRefreshShowMetadata mutation hooks"
```

---

### Task 5: Create ActionButtonGroup Component

**Files:**

- Create: `src/components/shared/action-button-group.tsx`

- [ ] **Step 1: Create the component**

```tsx
import type { JSX } from "react";
import { ExternalLink, Loader2, Pencil, RefreshCw, Trash2 } from "lucide-react";
import { Button } from "src/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "src/components/ui/tooltip";

type ActionButtonGroupProps = {
  onRefreshMetadata: () => void;
  isRefreshing: boolean;
  onEdit: () => void;
  onDelete: () => void;
  externalUrl: string | null;
  externalLabel: string;
};

export default function ActionButtonGroup({
  onRefreshMetadata,
  isRefreshing,
  onEdit,
  onDelete,
  externalUrl,
  externalLabel,
}: ActionButtonGroupProps): JSX.Element {
  return (
    <TooltipProvider>
      <div className="inline-flex -space-x-px">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              className="rounded-none first:rounded-l-md"
              onClick={onRefreshMetadata}
              disabled={isRefreshing}
            >
              {isRefreshing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent>Update Metadata</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              className="rounded-none"
              onClick={onEdit}
            >
              <Pencil className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Edit</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              className={`rounded-none ${externalUrl ? "" : "last:rounded-r-md"}`}
              onClick={onDelete}
            >
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Delete</TooltipContent>
        </Tooltip>

        {externalUrl && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                className="rounded-none last:rounded-r-md"
                asChild
              >
                <a href={externalUrl} target="_blank" rel="noreferrer">
                  <ExternalLink className="h-4 w-4" />
                </a>
              </Button>
            </TooltipTrigger>
            <TooltipContent>{externalLabel}</TooltipContent>
          </Tooltip>
        )}
      </div>
    </TooltipProvider>
  );
}
```

Key details:

- `-space-x-px` on the wrapper overlaps borders so they share 1px dividers
- `rounded-none` on all buttons, `first:rounded-l-md` on first, `last:rounded-r-md` on last
- When `externalUrl` is null, the delete button becomes the last button and gets `last:rounded-r-md`
- Delete button icon uses `text-destructive` class for red color on outline button

- [ ] **Step 2: Verify build**

Run: `bun run build`
Expected: No type errors (component is not yet imported anywhere)

- [ ] **Step 3: Commit**

```bash
git add src/components/shared/action-button-group.tsx
git commit -m "feat: create ActionButtonGroup shared component with connected icon buttons and tooltips"
```

---

### Task 6: Update Movie Detail Header

**Files:**

- Modify: `src/components/movies/movie-detail-header.tsx`

- [ ] **Step 1: Replace action buttons with ActionButtonGroup**

Replace the import line for lucide icons:

```typescript
// Old:
import { ArrowLeft, ExternalLink, Pencil, Trash2 } from "lucide-react";
// New:
import { ArrowLeft } from "lucide-react";
```

Add import for the new component and mutation hook:

```typescript
import ActionButtonGroup from "src/components/shared/action-button-group";
import { useRefreshMovieMetadata } from "src/hooks/mutations/movies";
```

Remove the `useDeleteMovie` import from `src/hooks/mutations/movies` — it stays, but add `useRefreshMovieMetadata` alongside it:

```typescript
import {
  useUpdateMovie,
  useDeleteMovie,
  useRefreshMovieMetadata,
} from "src/hooks/mutations/movies";
```

Inside the component, add the refresh mutation (after the existing `deleteMovie` line):

```typescript
const refreshMetadata = useRefreshMovieMetadata();
```

Add refresh handler (next to `handleDelete`):

```typescript
const handleRefreshMetadata = () => {
  refreshMetadata.mutate(movie.id, {
    onSuccess: () => router.invalidate(),
  });
};
```

Replace the existing action buttons section (lines 215-242):

```tsx
{
  /* Old: */
}
<div className="flex gap-2">
  <Button variant="outline" size="sm" asChild>
    <a href={tmdbUrl} target="_blank" rel="noreferrer">
      <ExternalLink className="h-4 w-4 mr-1" />
      TMDB
    </a>
  </Button>
  <Button
    variant="outline"
    size="sm"
    onClick={() => {
      setSelectedProfileIds(movie.downloadProfileIds);
      setEditProfilesOpen(true);
    }}
  >
    <Pencil className="h-4 w-4 mr-1" />
    Edit
  </Button>
  <Button variant="destructive" size="sm" onClick={() => setDeleteOpen(true)}>
    <Trash2 className="h-4 w-4 mr-1" />
    Delete
  </Button>
</div>;

{
  /* New: */
}
<ActionButtonGroup
  onRefreshMetadata={handleRefreshMetadata}
  isRefreshing={refreshMetadata.isPending}
  onEdit={() => {
    setSelectedProfileIds(movie.downloadProfileIds);
    setEditProfilesOpen(true);
  }}
  onDelete={() => setDeleteOpen(true)}
  externalUrl={tmdbUrl}
  externalLabel="Open in TMDB"
/>;
```

- [ ] **Step 2: Verify build**

Run: `bun run build`
Expected: No type errors

- [ ] **Step 3: Manual test**

Run: `bun run dev`
Navigate to a movie detail page. Verify:

- Connected button group appears in back-link row
- Tooltips show on hover: "Update Metadata", "Edit", "Delete", "Open in TMDB"
- Update Metadata shows spinner while pending
- Edit opens profiles dialog
- Delete opens confirmation dialog
- External link opens TMDB in new tab

- [ ] **Step 4: Commit**

```bash
git add src/components/movies/movie-detail-header.tsx
git commit -m "feat: replace movie detail buttons with ActionButtonGroup and add metadata refresh"
```

---

### Task 7: Update Show Detail Header

**Files:**

- Modify: `src/components/tv/show-detail-header.tsx`

- [ ] **Step 1: Replace action buttons with ActionButtonGroup**

Replace the import line for lucide icons:

```typescript
// Old:
import { ArrowLeft, ExternalLink, Pencil, Trash2 } from "lucide-react";
// New:
import { ArrowLeft } from "lucide-react";
```

Add imports:

```typescript
import ActionButtonGroup from "src/components/shared/action-button-group";
```

Update the mutations import:

```typescript
import {
  useUpdateShow,
  useDeleteShow,
  useRefreshShowMetadata,
} from "src/hooks/mutations/shows";
```

Note: The shows mutation hooks are imported from `src/hooks/mutations/shows`. Verify the file exports `useRefreshShowMetadata` — it was added in Task 4.

Inside the component, add the refresh mutation (after `deleteShow`):

```typescript
const refreshMetadata = useRefreshShowMetadata();
```

Add refresh handler:

```typescript
const handleRefreshMetadata = () => {
  refreshMetadata.mutate(show.id, {
    onSuccess: () => router.invalidate(),
  });
};
```

Replace the existing action buttons section (lines 212-238):

```tsx
{
  /* Old: */
}
<div className="flex gap-2">
  <Button variant="outline" size="sm" asChild>
    <a href={tmdbUrl} target="_blank" rel="noreferrer">
      <ExternalLink className="h-4 w-4 mr-1" />
      TMDB
    </a>
  </Button>
  <Button
    variant="outline"
    size="sm"
    onClick={() => {
      setSelectedProfileIds(show.downloadProfileIds);
      setEditProfilesOpen(true);
    }}
  >
    <Pencil className="h-4 w-4 mr-1" />
    Edit
  </Button>
  <Button variant="destructive" size="sm" onClick={() => setDeleteOpen(true)}>
    <Trash2 className="h-4 w-4 mr-1" />
    Delete
  </Button>
</div>;

{
  /* New: */
}
<ActionButtonGroup
  onRefreshMetadata={handleRefreshMetadata}
  isRefreshing={refreshMetadata.isPending}
  onEdit={() => {
    setSelectedProfileIds(show.downloadProfileIds);
    setEditProfilesOpen(true);
  }}
  onDelete={() => setDeleteOpen(true)}
  externalUrl={tmdbUrl}
  externalLabel="Open in TMDB"
/>;
```

- [ ] **Step 2: Verify build**

Run: `bun run build`
Expected: No type errors

- [ ] **Step 3: Commit**

```bash
git add src/components/tv/show-detail-header.tsx
git commit -m "feat: replace show detail buttons with ActionButtonGroup and add metadata refresh"
```

---

### Task 8: Update Author Detail Page

**Files:**

- Modify: `src/routes/_authed/authors/$authorId.tsx`

This is the most involved change since the author page has a different layout — buttons are currently in `PageHeader` actions prop, and there's no back-link row like TV/movies have.

- [ ] **Step 1: Add imports and remove unused icon imports**

Remove `ExternalLink`, `Pencil`, `Trash2` from the lucide-react import (keep `ArrowLeft`, `Loader2` can be removed too since `ActionButtonGroup` handles spinner internally). The exact set of icons to keep depends on other usage — `RefreshCw` and `Loader2` are no longer needed in this file.

Add import:

```typescript
import ActionButtonGroup from "src/components/shared/action-button-group";
```

- [ ] **Step 2: Restructure the back-link and buttons layout**

Current layout (lines 1366-1411):

```tsx
<div>
  <Button variant="ghost" size="sm" asChild>
    <Link to="/authors">
      <ArrowLeft className="mr-2 h-4 w-4" />
      Back to Authors
    </Link>
  </Button>
</div>

<PageHeader
  title={author.name}
  description={lifespan || null}
  actions={
    <div className="flex items-center gap-2">
      {/* ...4 buttons... */}
    </div>
  }
/>
```

Replace with:

```tsx
<div className="flex items-center justify-between">
  <Link
    to="/authors"
    className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
  >
    <ArrowLeft className="h-4 w-4" />
    Back to Authors
  </Link>
  <ActionButtonGroup
    onRefreshMetadata={handleRefreshMetadata}
    isRefreshing={refreshMetadata.isPending}
    onEdit={() => setEditOpen(true)}
    onDelete={() => setDeleteOpen(true)}
    externalUrl={hardcoverUrl}
    externalLabel="Open in Hardcover"
  />
</div>

<PageHeader
  title={author.name}
  description={lifespan || null}
/>
```

This matches the back-link row pattern from TV/movie pages. The `actions` prop is removed from `PageHeader`.

- [ ] **Step 3: Clean up unused imports**

After removing the inline buttons, the following icons are no longer needed in this file: `ExternalLink`, `Pencil`, `RefreshCw`, `Loader2`, `Trash2`. Remove them from the lucide-react import. Check that `ArrowLeft` is still used (for the back link). Also check if `Button` is still used elsewhere in the file (it is — for add book button etc.), so keep it.

- [ ] **Step 4: Verify build**

Run: `bun run build`
Expected: No type errors

- [ ] **Step 5: Manual test**

Run: `bun run dev`
Navigate to an author detail page. Verify:

- Back link and button group appear in same row (matching TV/movie layout)
- All 4 buttons work: Update Metadata (spins, refreshes from Hardcover), Edit (opens author form), Delete (opens confirmation), Hardcover link (opens in new tab)
- If author has no Hardcover slug, external link button is hidden

- [ ] **Step 6: Commit**

```bash
git add src/routes/_authed/authors/$authorId.tsx
git commit -m "feat: move author detail buttons to back-link row using ActionButtonGroup"
```
