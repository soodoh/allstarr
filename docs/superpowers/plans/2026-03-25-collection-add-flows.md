# Collection Add Flows Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace navigation-based add flow for missing collection movies with modal-based flows (single and bulk), propagate add-time settings to the parent collection, and add monitoring explanatory copy.

**Architecture:** Reuse the existing `MoviePreviewModal` for single-movie adds by extracting it from `tmdb-movie-search.tsx` and making its post-add behavior configurable. Create a new `AddMissingMoviesDialog` for bulk adds. Modify server functions to always propagate settings to the collection on movie add.

**Tech Stack:** React, TanStack Query/Router, Drizzle ORM, Zod, shadcn/ui

---

## File Map

| File                                                  | Action | Responsibility                                                                                  |
| ----------------------------------------------------- | ------ | ----------------------------------------------------------------------------------------------- |
| `src/lib/tmdb-validators.ts`                          | Modify | Expand `addMissingCollectionMoviesSchema` with settings fields                                  |
| `src/server/movies.ts`                                | Modify | Propagate settings to collection on every add, set `minimumAvailability` on collection creation |
| `src/server/movie-collections.ts`                     | Modify | Accept and apply user-chosen settings in `addMissingCollectionMoviesFn`                         |
| `src/hooks/mutations/movie-collections.ts`            | Modify | Update mutation type for new schema                                                             |
| `src/components/movies/tmdb-movie-search.tsx`         | Modify | Export `MoviePreviewModal`, add optional `onAdded` callback prop to skip navigation             |
| `src/components/movies/collection-movie-poster.tsx`   | Modify | Change `onAddMovie` prop to pass full movie object                                              |
| `src/components/movies/collection-card.tsx`           | Modify | Change `onAddMovie` and `onAddMissing` prop signatures                                          |
| `src/components/movies/add-missing-movies-dialog.tsx` | Create | Bulk add dialog with settings form                                                              |
| `src/components/movies/edit-collection-dialog.tsx`    | Modify | Add monitoring explanatory copy                                                                 |
| `src/routes/_authed/movies/collections.tsx`           | Modify | Wire up new modals, replace navigation with modal state                                         |

---

### Task 1: Expand `addMissingCollectionMoviesSchema`

**Files:**

- Modify: `src/lib/tmdb-validators.ts:108-110`

- [ ] **Step 1: Update the schema**

In `src/lib/tmdb-validators.ts`, replace the `addMissingCollectionMoviesSchema`:

```typescript
export const addMissingCollectionMoviesSchema = z.object({
  collectionId: z.number(),
  downloadProfileIds: z.array(z.number()),
  minimumAvailability: z
    .enum(["announced", "inCinemas", "released"])
    .default("released"),
  monitorOption: z
    .enum(["movieOnly", "movieAndCollection", "none"])
    .default("movieAndCollection"),
  searchOnAdd: z.boolean().default(false),
});
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/tmdb-validators.ts
git commit -m "feat: expand addMissingCollectionMoviesSchema with settings fields"
```

---

### Task 2: Propagate settings to collection in `addMovieFn`

**Files:**

- Modify: `src/server/movies.ts:90-195`

- [ ] **Step 1: Set `minimumAvailability` on collection creation**

In `src/server/movies.ts`, in the `else` branch where a new collection is inserted (around line 113), add `minimumAvailability` from the movie data:

```typescript
      } else {
        const inserted = db
          .insert(movieCollections)
          .values({
            title: col.name,
            sortTitle: generateSortTitle(col.name),
            tmdbId: col.id,
            posterUrl: transformImagePath(col.poster_path, "w500"),
            fanartUrl: transformImagePath(col.backdrop_path, "original"),
            minimumAvailability: data.minimumAvailability,
          })
          .returning()
          .get();
        collectionId = inserted.id;
      }
```

- [ ] **Step 2: Always propagate settings to existing collections on add**

Replace the existing "movieAndCollection" block (lines 176-194) with logic that always updates collection settings on add, and additionally sets `monitored: true` for "movieAndCollection":

```typescript
// Propagate settings to collection on every add
if (collectionId) {
  const collectionUpdates: Record<string, unknown> = {
    minimumAvailability: data.minimumAvailability,
    updatedAt: new Date(),
  };
  if (data.monitorOption === "movieAndCollection") {
    collectionUpdates.monitored = true;
  }
  db.update(movieCollections)
    .set(collectionUpdates)
    .where(eq(movieCollections.id, collectionId))
    .run();

  // Always update collection download profiles to match
  db.delete(movieCollectionDownloadProfiles)
    .where(eq(movieCollectionDownloadProfiles.collectionId, collectionId))
    .run();
  for (const profileId of data.downloadProfileIds) {
    db.insert(movieCollectionDownloadProfiles)
      .values({ collectionId, downloadProfileId: profileId })
      .run();
  }
}
```

- [ ] **Step 3: Verify build passes**

Run: `bun run build`
Expected: Build succeeds

- [ ] **Step 4: Commit**

```bash
git add src/server/movies.ts
git commit -m "feat: propagate add-time settings to collection on every movie add"
```

---

### Task 3: Update `addMissingCollectionMoviesFn` to accept and apply settings

**Files:**

- Modify: `src/server/movie-collections.ts:142-181`

- [ ] **Step 1: Import `searchForMovie`**

At the top of `src/server/movie-collections.ts`, add:

```typescript
import { searchForMovie } from "./auto-search";
```

- [ ] **Step 2: Replace `addMissingCollectionMoviesFn` handler**

Replace the existing handler (lines 144-181) with:

```typescript
export const addMissingCollectionMoviesFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => addMissingCollectionMoviesSchema.parse(d))
  .handler(async ({ data }) => {
    await requireAuth();

    const collection = db
      .select()
      .from(movieCollections)
      .where(eq(movieCollections.id, data.collectionId))
      .get();

    if (!collection) {
      throw new Error("Collection not found");
    }

    // Update collection settings from user choices
    const collectionUpdates: Record<string, unknown> = {
      minimumAvailability: data.minimumAvailability,
      updatedAt: new Date(),
    };
    if (data.monitorOption === "movieAndCollection") {
      collectionUpdates.monitored = true;
    }
    db.update(movieCollections)
      .set(collectionUpdates)
      .where(eq(movieCollections.id, collection.id))
      .run();

    // Update collection download profiles
    db.delete(movieCollectionDownloadProfiles)
      .where(eq(movieCollectionDownloadProfiles.collectionId, collection.id))
      .run();
    for (const profileId of data.downloadProfileIds) {
      db.insert(movieCollectionDownloadProfiles)
        .values({
          collectionId: collection.id,
          downloadProfileId: profileId,
        })
        .run();
    }

    // Get missing movies
    const excludedTmdbIds = new Set(
      db
        .select({ tmdbId: movieImportListExclusions.tmdbId })
        .from(movieImportListExclusions)
        .all()
        .map((r) => r.tmdbId),
    );
    const existingTmdbIds = new Set(
      db
        .select({ tmdbId: movies.tmdbId })
        .from(movies)
        .all()
        .map((r) => r.tmdbId),
    );

    const collectionMoviesList = db
      .select()
      .from(movieCollectionMovies)
      .where(eq(movieCollectionMovies.collectionId, collection.id))
      .all();

    let added = 0;
    for (const cm of collectionMoviesList) {
      if (existingTmdbIds.has(cm.tmdbId)) continue;
      if (excludedTmdbIds.has(cm.tmdbId)) continue;

      const detail = await tmdbFetch<TmdbMovieDetail>(`/movie/${cm.tmdbId}`);

      const title = detail.title;
      const sortTitle = generateSortTitle(title);
      const status = mapMovieStatus(detail.status);
      const studio = detail.production_companies[0]?.name ?? "";
      const year = detail.release_date
        ? Number.parseInt(detail.release_date.split("-")[0], 10)
        : 0;
      const runtime = detail.runtime ?? 0;
      const genres = detail.genres.map((g) => g.name);
      const posterUrl = transformImagePath(detail.poster_path, "w500") ?? "";
      const fanartUrl =
        transformImagePath(detail.backdrop_path, "original") ?? "";
      const imdbId = detail.imdb_id ?? null;

      const movie = db
        .insert(movies)
        .values({
          title,
          sortTitle,
          overview: detail.overview,
          tmdbId: cm.tmdbId,
          imdbId,
          status,
          studio,
          year,
          runtime,
          genres,
          posterUrl,
          fanartUrl,
          minimumAvailability: data.minimumAvailability,
          collectionId: collection.id,
        })
        .returning()
        .get();

      if (data.monitorOption !== "none") {
        for (const profileId of data.downloadProfileIds) {
          db.insert(movieDownloadProfiles)
            .values({ movieId: movie.id, downloadProfileId: profileId })
            .run();
        }
      }

      db.insert(history)
        .values({
          eventType: "movieAdded",
          movieId: movie.id,
          data: { title },
        })
        .run();

      if (data.searchOnAdd && data.monitorOption !== "none") {
        void searchForMovie(movie.id).catch((error) =>
          console.error("Search after bulk add failed:", error),
        );
      }

      existingTmdbIds.add(cm.tmdbId);
      added += 1;
    }

    return { added };
  });
```

- [ ] **Step 3: Verify build passes**

Run: `bun run build`
Expected: Build succeeds

- [ ] **Step 4: Commit**

```bash
git add src/server/movie-collections.ts
git commit -m "feat: add user-chosen settings to bulk add missing movies"
```

---

### Task 4: Update `useAddMissingCollectionMovies` mutation type

**Files:**

- Modify: `src/hooks/mutations/movie-collections.ts:52-71`

- [ ] **Step 1: Update the mutation hook**

The mutation type is already derived from the schema via `z.infer<typeof addMissingCollectionMoviesSchema>`, so the type will auto-update from Task 1. However, we need to also invalidate `movieCollections` queries on success so the collection card reflects updated settings. Verify the existing hook already does this — it does (line 63-65). No code change needed.

- [ ] **Step 2: Verify build passes**

Run: `bun run build`
Expected: Build succeeds

---

### Task 5: Export `MoviePreviewModal` and add `onAdded` callback

**Files:**

- Modify: `src/components/movies/tmdb-movie-search.tsx:43-120`

- [ ] **Step 1: Export `MoviePreviewModal` and `MoviePreviewModalProps`**

Add `onAdded` optional callback prop. When provided, call it instead of navigating. Update `MoviePreviewModalProps`:

```typescript
export type MoviePreviewModalProps = {
  movie: TmdbMovieResult;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdded?: () => void;
};
```

- [ ] **Step 2: Update `MoviePreviewModal` to use `onAdded`**

Change the function signature to export and accept `onAdded`:

```typescript
export function MoviePreviewModal({
  movie,
  open,
  onOpenChange,
  onAdded,
}: MoviePreviewModalProps): JSX.Element {
```

Update the `handleAdd` `onSuccess` callback:

```typescript
      {
        onSuccess: (result) => {
          onOpenChange(false);
          if (onAdded) {
            onAdded();
          } else {
            navigate({
              to: "/movies/$movieId",
              params: { movieId: String(result.id) },
            });
          }
        },
      },
```

- [ ] **Step 3: Verify build passes**

Run: `bun run build`
Expected: Build succeeds

- [ ] **Step 4: Commit**

```bash
git add src/components/movies/tmdb-movie-search.tsx
git commit -m "feat: export MoviePreviewModal with optional onAdded callback"
```

---

### Task 6: Update `CollectionMoviePoster` to pass full movie object

**Files:**

- Modify: `src/components/movies/collection-movie-poster.tsx:17-31, 106`

- [ ] **Step 1: Add `overview` to `CollectionMovie` type**

The server returns `overview` from the DB row spread but the client type doesn't declare it. Add it to the `CollectionMovie` type in `collection-movie-poster.tsx`:

```typescript
type CollectionMovie = {
  tmdbId: number;
  title: string;
  overview: string;
  posterUrl: string | null;
  year: number | null;
  isExisting: boolean;
  isExcluded: boolean;
  movieId: number | null;
};
```

- [ ] **Step 2: Change `onAddMovie` prop type**

Update the `Props` type:

```typescript
type Props = {
  movie: CollectionMovie;
  onExclude?: (movie: CollectionMovie) => void;
  onAddMovie?: (movie: CollectionMovie) => void;
};
```

- [ ] **Step 2: Update click handler**

Change line 106 from:

```typescript
onClick={() => onAddMovie?.(movie.tmdbId)}
```

to:

```typescript
onClick={() => onAddMovie?.(movie)}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/movies/collection-movie-poster.tsx
git commit -m "refactor: pass full movie object from CollectionMoviePoster onAddMovie"
```

---

### Task 7: Update `CollectionCard` prop signatures

**Files:**

- Modify: `src/components/movies/collection-card.tsx:6-35, 93-103, 129-134`

- [ ] **Step 1: Add `overview` to `CollectionMovie` type**

Add `overview` to the `CollectionMovie` type in `collection-card.tsx` (same change as Task 6):

```typescript
type CollectionMovie = {
  tmdbId: number;
  title: string;
  overview: string;
  posterUrl: string | null;
  year: number | null;
  isExisting: boolean;
  isExcluded: boolean;
  movieId: number | null;
};
```

- [ ] **Step 2: Update prop types**

```typescript
type Props = {
  collection: Collection;
  onEdit: (collection: Collection) => void;
  onAddMissing: (collection: Collection) => void;
  onExcludeMovie: (movie: CollectionMovie) => void;
  onAddMovie: (movie: CollectionMovie) => void;
  onToggleMonitor: (collection: Collection) => void;
};
```

- [ ] **Step 2: Update "Add Missing" click handler**

Change line 98 from:

```typescript
onClick={() => onAddMissing(collection.id)}
```

to:

```typescript
onClick={() => onAddMissing(collection)}
```

- [ ] **Step 3: Verify build passes**

Run: `bun run build`
Expected: Build succeeds

- [ ] **Step 4: Commit**

```bash
git add src/components/movies/collection-card.tsx
git commit -m "refactor: update CollectionCard prop signatures for modal flows"
```

---

### Task 8: Create `AddMissingMoviesDialog`

**Files:**

- Create: `src/components/movies/add-missing-movies-dialog.tsx`

- [ ] **Step 1: Create the dialog component**

```typescript
import type { JSX } from "react";
import { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "src/components/ui/dialog";
import { Button } from "src/components/ui/button";
import Label from "src/components/ui/label";
import Checkbox from "src/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "src/components/ui/select";
import ProfileCheckboxGroup from "src/components/shared/profile-checkbox-group";
import { downloadProfilesListQuery } from "src/lib/queries/download-profiles";
import { useAddMissingCollectionMovies } from "src/hooks/mutations/movie-collections";

type Collection = {
  id: number;
  title: string;
  missingMovies: number;
};

type Props = {
  collection: Collection | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export default function AddMissingMoviesDialog({
  collection,
  open,
  onOpenChange,
}: Props): JSX.Element {
  const addMissing = useAddMissingCollectionMovies();

  const { data: allProfiles = [] } = useQuery({
    ...downloadProfilesListQuery(),
    enabled: open,
  });

  const movieProfiles = useMemo(
    () => allProfiles.filter((p) => p.contentType === "movie"),
    [allProfiles],
  );

  const [downloadProfileIds, setDownloadProfileIds] = useState<number[]>([]);
  const [minimumAvailability, setMinimumAvailability] =
    useState<string>("released");
  const [monitorOption, setMonitorOption] = useState<
    "movieOnly" | "movieAndCollection" | "none"
  >("movieAndCollection");
  const [searchOnAdd, setSearchOnAdd] = useState(false);

  // Auto-select all profiles when profiles load
  useEffect(() => {
    if (movieProfiles.length > 0 && downloadProfileIds.length === 0) {
      setDownloadProfileIds(movieProfiles.map((p) => p.id));
    }
  }, [movieProfiles, downloadProfileIds.length]);

  const toggleProfile = (id: number) => {
    setDownloadProfileIds((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id],
    );
  };

  const handleAdd = () => {
    if (!collection) return;
    if (monitorOption !== "none" && downloadProfileIds.length === 0) return;

    addMissing.mutate(
      {
        collectionId: collection.id,
        downloadProfileIds,
        minimumAvailability: minimumAvailability as
          | "announced"
          | "inCinemas"
          | "released",
        monitorOption,
        searchOnAdd,
      },
      { onSuccess: () => onOpenChange(false) },
    );
  };

  const missingCount = collection?.missingMovies ?? 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Missing Movies</DialogTitle>
          {collection && (
            <p className="text-sm text-muted-foreground">
              Add {missingCount} missing movie{missingCount === 1 ? "" : "s"} to{" "}
              {collection.title}
            </p>
          )}
        </DialogHeader>

        <div className="space-y-4 rounded-lg border border-border bg-muted/30 p-4">
          <ProfileCheckboxGroup
            profiles={movieProfiles}
            selectedIds={downloadProfileIds}
            onToggle={toggleProfile}
          />

          <div className="space-y-2">
            <Label>Monitor</Label>
            <Select
              value={monitorOption}
              onValueChange={(v) =>
                setMonitorOption(
                  v as "movieOnly" | "movieAndCollection" | "none",
                )
              }
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="movieOnly">Movie Only</SelectItem>
                <SelectItem value="movieAndCollection">
                  Movie &amp; Collection
                </SelectItem>
                <SelectItem value="none">None</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              &ldquo;Movie &amp; Collection&rdquo; will automatically add future
              movies added to this collection on TMDB.
            </p>
          </div>

          <div className="space-y-2">
            <Label>Minimum Availability</Label>
            <Select
              value={minimumAvailability}
              onValueChange={setMinimumAvailability}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="announced">Announced</SelectItem>
                <SelectItem value="inCinemas">In Cinemas</SelectItem>
                <SelectItem value="released">Released</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2">
            <Checkbox
              id="bulk-search-on-add"
              checked={searchOnAdd}
              onCheckedChange={(checked) => setSearchOnAdd(checked === true)}
            />
            <Label htmlFor="bulk-search-on-add">
              Start search for missing movies
            </Label>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleAdd}
            disabled={
              (monitorOption !== "none" && downloadProfileIds.length === 0) ||
              addMissing.isPending ||
              movieProfiles.length === 0
            }
          >
            {addMissing.isPending
              ? "Adding..."
              : `Add ${missingCount} Movie${missingCount === 1 ? "" : "s"}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Verify build passes**

Run: `bun run build`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add src/components/movies/add-missing-movies-dialog.tsx
git commit -m "feat: create AddMissingMoviesDialog for bulk collection adds"
```

---

### Task 9: Add monitoring explanatory copy to `EditCollectionDialog`

**Files:**

- Modify: `src/components/movies/edit-collection-dialog.tsx:97-105`

- [ ] **Step 1: Add description text below the Monitored switch**

Replace the monitored section (lines 97-105) with:

```typescript
          <div>
            <div className="flex items-center justify-between">
              <Label htmlFor="monitored">Monitored</Label>
              <Switch
                id="monitored"
                checked={monitored}
                onCheckedChange={setMonitored}
              />
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              When monitored, new movies added to this collection on TMDB will
              be automatically added to your library.
            </p>
          </div>
```

- [ ] **Step 2: Commit**

```bash
git add src/components/movies/edit-collection-dialog.tsx
git commit -m "feat: add monitoring explanatory copy to edit collection dialog"
```

---

### Task 10: Wire up modals in `collections.tsx`

**Files:**

- Modify: `src/routes/_authed/movies/collections.tsx`

- [ ] **Step 1: Update imports**

Add imports for the new components and types:

```typescript
import { MoviePreviewModal } from "src/components/movies/tmdb-movie-search";
import AddMissingMoviesDialog from "src/components/movies/add-missing-movies-dialog";
import type { TmdbMovieResult } from "src/server/tmdb/types";
```

- [ ] **Step 2: Add state for modals**

In `CollectionsPage`, add state for the two new modals and remove `useAddMissingCollectionMovies`:

```typescript
const [previewMovie, setPreviewMovie] = useState<TmdbMovieResult | null>(null);
const [addMissingCollection, setAddMissingCollection] = useState<
  (typeof collections)[number] | null
>(null);
```

Remove the `addMissing` hook usage:

```typescript
// DELETE: const addMissing = useAddMissingCollectionMovies();
```

And remove `useAddMissingCollectionMovies` from the imports.

- [ ] **Step 3: Replace `handleAddMovie` with modal opener**

Replace the existing `handleAddMovie` callback:

```typescript
const handleAddMovie = useCallback(
  (movie: {
    tmdbId: number;
    title: string;
    posterUrl: string | null;
    year: number | null;
    overview?: string;
  }) => {
    setPreviewMovie({
      media_type: "movie",
      id: movie.tmdbId,
      title: movie.title,
      original_title: movie.title,
      overview: movie.overview,
      poster_path: movie.posterUrl,
      backdrop_path: null,
      release_date: movie.year ? `${String(movie.year)}-01-01` : "",
      genre_ids: [],
      popularity: 0,
      vote_average: 0,
      adult: false,
    });
  },
  [],
);
```

- [ ] **Step 4: Update `CollectionCard` props in JSX**

Update the `CollectionCard` rendering:

```typescript
              <CollectionCard
                key={collection.id}
                collection={collection}
                onEdit={setEditCollection}
                onAddMissing={setAddMissingCollection}
                onExcludeMovie={(movie) =>
                  excludeMovie.mutate({
                    tmdbId: movie.tmdbId,
                    title: movie.title,
                    year: movie.year ?? undefined,
                  })
                }
                onAddMovie={handleAddMovie}
                onToggleMonitor={handleToggleMonitor}
              />
```

- [ ] **Step 5: Add modal rendering**

After the `EditCollectionDialog`, add the two new modals:

```typescript
        {previewMovie && (
          <MoviePreviewModal
            movie={previewMovie}
            open={Boolean(previewMovie)}
            onOpenChange={(open) => {
              if (!open) setPreviewMovie(null);
            }}
            onAdded={() => setPreviewMovie(null)}
          />
        )}

        <AddMissingMoviesDialog
          collection={addMissingCollection}
          open={addMissingCollection !== null}
          onOpenChange={(open) => {
            if (!open) setAddMissingCollection(null);
          }}
        />
```

- [ ] **Step 6: Verify build passes**

Run: `bun run build`
Expected: Build succeeds

- [ ] **Step 7: Commit**

```bash
git add src/routes/_authed/movies/collections.tsx
git commit -m "feat: wire up single-movie and bulk-add modals on collections page"
```

---

### Task 11: Final verification

- [ ] **Step 1: Full build**

Run: `bun run build`
Expected: Build succeeds with no errors

- [ ] **Step 2: Manual smoke test**

Run: `bun run dev`

Test the following:

1. Navigate to Movies > Collections
2. Click a missing movie poster — verify `MoviePreviewModal` opens (not navigation to `/movies/add`)
3. In the modal, verify add form works with all options
4. Close modal — verify no navigation happened
5. Click "Add Missing" on a collection with missing movies — verify `AddMissingMoviesDialog` opens
6. Verify "Movie & Collection" is pre-selected as default
7. Verify explanatory copy appears below the Monitor select
8. Submit — verify movies are added and collection list refreshes
9. Open "Edit Collection" dialog — verify monitoring copy appears below the toggle
10. Add a movie via TMDB search that belongs to a collection — verify collection inherits settings

- [ ] **Step 3: Commit any fixes**

If any issues found during smoke testing, fix and commit.
