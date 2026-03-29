# Command Queue Progress Toasts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate show/movie add operations to the command queue and add detailed progress messages ("Action N of M: Item Name") to all command handlers.

**Architecture:** Extract `addShowFn`/`addMovieFn` handler logic into `CommandHandler` functions, thread `updateProgress` callbacks through internal functions, and add per-item progress calls inside existing loops.

**Tech Stack:** TanStack Start server functions, Sonner toast, SSE event bus, Drizzle ORM

---

### Task 1: Migrate `addShowFn` to command queue

**Files:**

- Modify: `src/server/shows.ts:444-629`
- Modify: `src/hooks/mutations/shows.ts:20-31`
- Modify: `src/hooks/use-server-events.ts:13-71`

- [ ] **Step 1: Create `addShowHandler` in `src/server/shows.ts`**

Add the import for `submitCommand` and `CommandHandler` at the top of the file, then extract the handler logic from `addShowFn`. The handler receives `body` and `updateProgress`, contains all the existing logic, and returns a result object.

Add to imports:

```typescript
import { submitCommand, type CommandHandler } from "./commands";
```

Create the handler just above the current `addShowFn` (before line 444):

```typescript
const addShowHandler: CommandHandler = async (body, updateProgress) => {
  const data = body as ReturnType<typeof addShowSchema.parse>;

  // Check if show already exists
  const existing = db
    .select({ id: shows.id })
    .from(shows)
    .where(eq(shows.tmdbId, data.tmdbId))
    .get();

  if (existing) {
    throw new Error("Show already exists");
  }

  // Fetch show detail from TMDB
  updateProgress("Fetching show details...");
  const raw = await tmdbFetch<TmdbShowDetail>(`/tv/${data.tmdbId}`, {
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
  const fanartUrl = transformImagePath(raw.backdrop_path, "w1280") ?? "";
  const imdbId = raw.external_ids?.imdb_id ?? null;

  // Pre-fetch all TMDB data before the transaction
  let groupDetail: TmdbEpisodeGroupDetail | null = null;
  const seasonDetails: Array<{
    summary: (typeof raw.seasons)[0];
    detail: TmdbSeasonDetail;
  }> = [];

  if (data.episodeGroupId) {
    updateProgress("Fetching episode group...");
    groupDetail = await tmdbFetch<TmdbEpisodeGroupDetail>(
      `/tv/episode_group/${data.episodeGroupId}`,
    );
  } else {
    const totalSeasons = raw.seasons.length;
    for (const [index, seasonSummary] of raw.seasons.entries()) {
      updateProgress(`Fetching season ${index + 1} of ${totalSeasons}...`);
      const detail = await tmdbFetch<TmdbSeasonDetail>(
        `/tv/${data.tmdbId}/season/${seasonSummary.season_number}`,
      );
      seasonDetails.push({ summary: seasonSummary, detail });
    }
  }

  // All DB writes in a single transaction
  updateProgress("Saving show and episodes...");
  const show = db.transaction((tx) => {
    // ... (entire existing transaction body unchanged, lines 500-618)
    const showRow = tx
      .insert(shows)
      .values({
        title,
        sortTitle,
        overview: raw.overview,
        tmdbId: data.tmdbId,
        imdbId,
        status,
        seriesType: data.seriesType,
        useSeasonFolder: data.useSeasonFolder ? 1 : 0,
        network,
        year,
        runtime,
        genres,
        posterUrl,
        fanartUrl,
        episodeGroupId: data.episodeGroupId,
      })
      .returning()
      .get();

    for (const profileId of data.downloadProfileIds) {
      tx.insert(showDownloadProfiles)
        .values({ showId: showRow.id, downloadProfileId: profileId })
        .run();
    }

    if (groupDetail) {
      const sortedGroups = groupDetail.groups.toSorted(
        (a, b) => a.order - b.order,
      );
      for (const group of sortedGroups) {
        const season = tx
          .insert(seasons)
          .values({
            showId: showRow.id,
            seasonNumber: group.order,
            overview: null,
            posterUrl: null,
          })
          .returning()
          .get();

        if (group.episodes.length > 0) {
          tx.insert(episodes)
            .values(
              group.episodes
                .toSorted((a, b) => a.order - b.order)
                .map((ep) => ({
                  showId: showRow.id,
                  seasonId: season.id,
                  episodeNumber: ep.order + 1,
                  title: ep.name,
                  overview: ep.overview || null,
                  airDate: ep.air_date,
                  runtime: ep.runtime,
                  tmdbId: ep.id,
                  hasFile: false,
                })),
            )
            .run();
        }
      }
    } else {
      for (const { summary, detail } of seasonDetails) {
        const season = tx
          .insert(seasons)
          .values({
            showId: showRow.id,
            seasonNumber: summary.season_number,
            overview: summary.overview || null,
            posterUrl: transformImagePath(summary.poster_path, "w500"),
          })
          .returning()
          .get();

        if (detail.episodes.length > 0) {
          tx.insert(episodes)
            .values(
              detail.episodes.map((ep) => ({
                showId: showRow.id,
                seasonId: season.id,
                episodeNumber: ep.episode_number,
                title: ep.name,
                overview: ep.overview || null,
                airDate: ep.air_date,
                runtime: ep.runtime,
                tmdbId: ep.id,
                hasFile: false,
              })),
            )
            .run();
        }
      }
    }

    applyMonitoringOption(
      showRow.id,
      data.monitorOption,
      data.downloadProfileIds,
    );

    computeAbsoluteNumbers(showRow.id);

    tx.insert(history)
      .values({
        eventType: "showAdded",
        showId: showRow.id,
        data: { title },
      })
      .run();

    return showRow;
  });

  // Fire-and-forget search if requested (outside transaction)
  if (data.searchOnAdd || data.searchCutoffUnmet) {
    updateProgress("Searching for available releases...");
    void searchForShow(show.id, data.searchCutoffUnmet).catch((error) =>
      console.error("Search after add failed:", error),
    );
  }

  return {
    showId: show.id,
    title: show.title,
    seasonCount: seasonDetails.length || (groupDetail?.groups.length ?? 0),
  } as unknown as Record<string, unknown>;
};
```

- [ ] **Step 2: Replace `addShowFn` handler with `submitCommand` wrapper**

Replace the entire `addShowFn` handler (lines 444-629) with:

```typescript
export const addShowFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => addShowSchema.parse(d))
  .handler(async ({ data }) => {
    await requireAuth();
    return submitCommand({
      commandType: "addShow",
      name: `Add show: ${data.tmdbId}`,
      body: data as unknown as Record<string, unknown>,
      dedupeKey: "tmdbId",
      handler: addShowHandler,
    });
  });
```

- [ ] **Step 3: Update `useAddShow` in `src/hooks/mutations/shows.ts`**

Replace the `useAddShow` function (lines 20-32) with the command queue pattern:

```typescript
export function useAddShow() {
  return useMutation({
    mutationFn: (data: z.infer<typeof addShowSchema>) => addShowFn({ data }),
    onMutate: () => {
      const toastId = toast.loading("Starting show import...", {
        id: "submit-add-show",
      });
      return { toastId };
    },
    onSuccess: (_result, _vars, context) => {
      toast.dismiss(context?.toastId);
    },
    onError: (error, _vars, context) =>
      toast.error(
        error instanceof Error ? error.message : "Failed to add show",
        { id: context?.toastId },
      ),
  });
}
```

Remove the `useQueryClient` import and `queryClient` usage from `useAddShow` since SSE handles invalidation now. Keep the `useQueryClient` import since other hooks in the file still use it.

- [ ] **Step 4: Add `addShow` to `formatCommandResult` in `src/hooks/use-server-events.ts`**

Add the case in the switch statement after the `importManga` case (around line 28):

```typescript
    case "addShow": {
      const r = result as { seasonCount?: number };
      return `Show added with ${r.seasonCount ?? 0} seasons`;
    }
```

- [ ] **Step 5: Add `addShow` to `invalidateForCommand` in `src/hooks/use-server-events.ts`**

Add the case in the switch statement (around line 44):

```typescript
    case "addShow": {
      queryClient.invalidateQueries({ queryKey: queryKeys.shows.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.history.all });
      break;
    }
```

- [ ] **Step 6: Build and verify**

Run: `bun run build`
Expected: Clean build with no errors

- [ ] **Step 7: Commit**

```bash
git add src/server/shows.ts src/hooks/mutations/shows.ts src/hooks/use-server-events.ts
git commit -m "feat: migrate addShowFn to command queue with progress toasts"
```

---

### Task 2: Migrate `addMovieFn` to command queue

**Files:**

- Modify: `src/server/movies.ts:73-220`
- Modify: `src/hooks/mutations/movies.ts:20-31`
- Modify: `src/hooks/use-server-events.ts`

- [ ] **Step 1: Create `addMovieHandler` in `src/server/movies.ts`**

Add the import for `submitCommand` and `CommandHandler`:

```typescript
import { submitCommand, type CommandHandler } from "./commands";
```

Create the handler just above the current `addMovieFn`:

```typescript
const addMovieHandler: CommandHandler = async (body, updateProgress) => {
  const data = body as ReturnType<typeof addMovieSchema.parse>;

  // Check if movie already exists
  const existing = db
    .select({ id: movies.id })
    .from(movies)
    .where(eq(movies.tmdbId, data.tmdbId))
    .get();

  if (existing) {
    throw new Error("Movie already exists");
  }

  // Fetch movie detail from TMDB
  updateProgress("Fetching movie details...");
  const raw = await tmdbFetch<TmdbMovieDetail>(`/movie/${data.tmdbId}`);

  // Upsert collection if movie belongs to one
  let collectionId: number | null = null;
  if (raw.belongs_to_collection) {
    const col = raw.belongs_to_collection;
    updateProgress(`Loading collection: ${col.name}`);

    const existing = db
      .select({ id: movieCollections.id })
      .from(movieCollections)
      .where(eq(movieCollections.tmdbId, col.id))
      .get();

    if (existing) {
      collectionId = existing.id;
      db.update(movieCollections)
        .set({
          title: col.name,
          sortTitle: generateSortTitle(col.name),
          posterUrl: transformImagePath(col.poster_path, "w500"),
          fanartUrl: transformImagePath(col.backdrop_path, "w1280"),
          updatedAt: new Date(),
        })
        .where(eq(movieCollections.id, existing.id))
        .run();
    } else {
      const inserted = db
        .insert(movieCollections)
        .values({
          title: col.name,
          sortTitle: generateSortTitle(col.name),
          tmdbId: col.id,
          posterUrl: transformImagePath(col.poster_path, "w500"),
          fanartUrl: transformImagePath(col.backdrop_path, "w1280"),
          minimumAvailability: data.minimumAvailability,
        })
        .returning()
        .get();
      collectionId = inserted.id;
    }

    // Populate the collection movies cache from TMDB
    await populateCollectionCache(collectionId, col.id);
  }

  updateProgress("Saving movie...");
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
  const fanartUrl = transformImagePath(raw.backdrop_path, "w1280") ?? "";
  const imdbId = raw.imdb_id ?? null;

  // Insert movie
  const movie = db
    .insert(movies)
    .values({
      title,
      sortTitle,
      overview: raw.overview,
      tmdbId: data.tmdbId,
      imdbId,
      status,
      studio,
      year,
      runtime,
      genres,
      posterUrl,
      fanartUrl,
      minimumAvailability: data.minimumAvailability,
      collectionId,
    })
    .returning()
    .get();

  // Assign download profiles based on monitor option
  if (data.monitorOption !== "none") {
    for (const profileId of data.downloadProfileIds) {
      db.insert(movieDownloadProfiles)
        .values({ movieId: movie.id, downloadProfileId: profileId })
        .run();
    }
  }

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

  // Fire-and-forget search if requested
  if (data.searchOnAdd && data.monitorOption !== "none") {
    updateProgress("Searching for available releases...");
    void searchForMovie(movie.id).catch((error) =>
      console.error("Search after add failed:", error),
    );
  }

  // Insert history event
  db.insert(history)
    .values({
      eventType: "movieAdded",
      movieId: movie.id,
      data: { title },
    })
    .run();

  return { movieId: movie.id, title: movie.title } as unknown as Record<
    string,
    unknown
  >;
};
```

- [ ] **Step 2: Replace `addMovieFn` handler with `submitCommand` wrapper**

Replace the entire `addMovieFn` (lines 73-220) with:

```typescript
export const addMovieFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => addMovieSchema.parse(d))
  .handler(async ({ data }) => {
    await requireAuth();
    return submitCommand({
      commandType: "addMovie",
      name: `Add movie: ${data.tmdbId}`,
      body: data as unknown as Record<string, unknown>,
      dedupeKey: "tmdbId",
      handler: addMovieHandler,
    });
  });
```

- [ ] **Step 3: Update `useAddMovie` in `src/hooks/mutations/movies.ts`**

Replace the `useAddMovie` function (lines 20-31) with:

```typescript
export function useAddMovie() {
  return useMutation({
    mutationFn: (data: z.infer<typeof addMovieSchema>) => addMovieFn({ data }),
    onMutate: () => {
      const toastId = toast.loading("Starting movie import...", {
        id: "submit-add-movie",
      });
      return { toastId };
    },
    onSuccess: (_result, _vars, context) => {
      toast.dismiss(context?.toastId);
    },
    onError: (error, _vars, context) =>
      toast.error(
        error instanceof Error ? error.message : "Failed to add movie",
        { id: context?.toastId },
      ),
  });
}
```

Remove `queryClient` usage from `useAddMovie`. Keep the `useQueryClient` import since other hooks still use it.

- [ ] **Step 4: Add `addMovie` to `formatCommandResult` in `src/hooks/use-server-events.ts`**

Add after the `addShow` case:

```typescript
    case "addMovie": {
      const r = result as { title?: string };
      return `Movie added: ${r.title ?? ""}`;
    }
```

- [ ] **Step 5: Add `addMovie` to `invalidateForCommand` in `src/hooks/use-server-events.ts`**

Add the case:

```typescript
    case "addMovie": {
      queryClient.invalidateQueries({ queryKey: queryKeys.movies.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.history.all });
      queryClient.invalidateQueries({
        queryKey: queryKeys.movieCollections.all,
      });
      break;
    }
```

- [ ] **Step 6: Build and verify**

Run: `bun run build`
Expected: Clean build with no errors

- [ ] **Step 7: Commit**

```bash
git add src/server/movies.ts src/hooks/mutations/movies.ts src/hooks/use-server-events.ts
git commit -m "feat: migrate addMovieFn to command queue with progress toasts"
```

---

### Task 3: Add progress messages to `importAuthorHandler` / `importAuthorInternal`

**Files:**

- Modify: `src/server/import.ts:439-859`

The `importAuthorInternal` function (line 439) is called from `importAuthorHandler` (line 844) and also from `importBookHandler` (lines 913, 960, 1120) for co-author imports. Thread `updateProgress` through it.

- [ ] **Step 1: Add `updateProgress` parameter to `importAuthorInternal`**

Change the function signature at line 439. Add an optional `updateProgress` parameter with a no-op default so callers from batch tasks (and co-author imports where we don't want per-book noise) can omit it:

```typescript
async function importAuthorInternal(data: {
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
}, updateProgress: (message: string) => void = () => {}): Promise<{ authorId: number; booksAdded: number; editionsAdded: number }> {
```

- [ ] **Step 2: Add progress calls inside `importAuthorInternal`**

Add a progress call after the `fetchAuthorComplete` call (after line 463):

```typescript
const { author: rawAuthor, books: rawBooks } = await fetchAuthorComplete(
  data.foreignAuthorId,
);
updateProgress(`Fetching editions for ${rawBooks.length} books...`);
```

Add a progress call inside the book loop (at the start of the `for (const rawBook of rawBooks)` loop, after line 621):

```typescript
    for (const rawBook of rawBooks) {
      updateProgress(`Importing book ${booksAdded + 1} of ${rawBooks.length}: ${rawBook.title}`);
```

Note: `booksAdded` is incremented after a book is actually added (skipped books don't count), so the counter won't be perfectly accurate but gives the user a sense of progress. An alternative is to use the loop index. Use the loop index instead for accuracy:

Replace the loop with indexed iteration:

```typescript
    for (const [index, rawBook] of rawBooks.entries()) {
      updateProgress(`Importing book ${index + 1} of ${rawBooks.length}: ${rawBook.title}`);
```

- [ ] **Step 3: Update `importAuthorHandler` to pass `updateProgress`**

Update the handler at line 844 to pass `updateProgress` through:

```typescript
const importAuthorHandler: CommandHandler = async (body, updateProgress) => {
  const data = body as z.infer<typeof importAuthorSchema>;
  updateProgress("Fetching author details from Hardcover...");
  const result = await importAuthorInternal(data, updateProgress);

  if (data.searchOnAdd) {
    updateProgress("Searching for available releases...");
    void searchForAuthorBooks(result.authorId).catch((error) =>
      console.error("Search after import failed:", error),
    );
  }

  return result;
};
```

- [ ] **Step 4: Build and verify**

Run: `bun run build`
Expected: Clean build with no errors

- [ ] **Step 5: Commit**

```bash
git add src/server/import.ts
git commit -m "feat: add per-book progress messages to author import"
```

---

### Task 4: Add progress messages to `importBookHandler`

**Files:**

- Modify: `src/server/import.ts:877-1143`

- [ ] **Step 1: Add progress calls to `importBookHandler`**

The handler already has good progress calls at lines 891, 910, 953, 986. Enhance the co-author loop to show per-co-author progress.

In the first co-author loop (lines 958-968, the "already imported" path), replace:

```typescript
    updateProgress("Importing co-authors...");
    const coAuthorContribs = deriveAuthorContributions(
```

with:

```typescript
    const coAuthorContribs = deriveAuthorContributions(
```

And inside the loop, add progress before each `importAuthorInternal` call:

```typescript
    for (const [index, coAuthor] of coAuthorContribs.entries()) {
      updateProgress(`Importing co-author ${index + 1} of ${coAuthorContribs.length}: ${coAuthor.name}`);
```

Do the same for the second co-author loop (lines 1112-1128):

Replace:

```typescript
  updateProgress("Importing co-authors...");
  const coAuthorContribs = deriveAuthorContributions(
```

with:

```typescript
  const coAuthorContribs = deriveAuthorContributions(
```

And update the loop:

```typescript
  for (const [index, coAuthor] of coAuthorContribs.entries()) {
    updateProgress(`Importing co-author ${index + 1} of ${coAuthorContribs.length}: ${coAuthor.name}`);
```

The `coAuthor` object from `deriveAuthorContributions` has `{ foreignAuthorId: string; name: string }`, so `coAuthor.name` is available.

- [ ] **Step 2: Build and verify**

Run: `bun run build`
Expected: Clean build with no errors

- [ ] **Step 3: Commit**

```bash
git add src/server/import.ts
git commit -m "feat: add per-co-author progress messages to book import"
```

---

### Task 5: Add progress messages to `refreshAuthorInternal` / `refreshAuthorHandler`

**Files:**

- Modify: `src/server/import.ts:1160-1683`

- [ ] **Step 1: Add `updateProgress` parameter to `refreshAuthorInternal`**

Change the signature at line 1160:

```typescript
export async function refreshAuthorInternal(authorId: number, updateProgress: (message: string) => void = () => {}): Promise<{
  booksUpdated: number;
  booksAdded: number;
  editionsUpdated: number;
  editionsAdded: number;
}> {
```

- [ ] **Step 2: Add progress calls inside `refreshAuthorInternal`**

After the `fetchAuthorComplete` call (line 1181):

```typescript
const { author: rawAuthor, books: rawBooks } =
  await fetchAuthorComplete(foreignAuthorId);
updateProgress("Fetching editions...");
```

Inside the book loop (line 1228), add at the start:

```typescript
    for (const [index, rawBook] of rawBooks.entries()) {
      updateProgress(`Refreshing book ${index + 1} of ${rawBooks.length}: ${rawBook.title}`);
```

After the book loop, before orphan detection (around line 1603):

```typescript
updateProgress("Checking for removed entries...");
```

- [ ] **Step 3: Update `refreshAuthorHandler` to pass `updateProgress`**

Update at line 1678:

```typescript
const refreshAuthorHandler: CommandHandler = async (body, updateProgress) => {
  const data = body as { authorId: number };
  updateProgress("Fetching fresh data from Hardcover...");
  const result = await refreshAuthorInternal(data.authorId, updateProgress);
  return result;
};
```

- [ ] **Step 4: Build and verify**

Run: `bun run build`
Expected: Clean build with no errors. The batch task callers in `src/server/scheduler/tasks/refresh-metadata.ts` still call `refreshAuthorInternal(author.id)` without the second argument, which is fine since it defaults to the no-op.

- [ ] **Step 5: Commit**

```bash
git add src/server/import.ts
git commit -m "feat: add per-book progress messages to author metadata refresh"
```

---

### Task 6: Add progress messages to `refreshBookInternal` / `refreshBookHandler`

**Files:**

- Modify: `src/server/import.ts:1776-2104`

- [ ] **Step 1: Add `updateProgress` parameter to `refreshBookInternal`**

Change the signature at line 1776:

```typescript
export async function refreshBookInternal(bookId: number, updateProgress: (message: string) => void = () => {}): Promise<{
  booksUpdated: number;
  booksAdded: number;
  editionsUpdated: number;
  editionsAdded: number;
}> {
```

- [ ] **Step 2: Add progress calls inside `refreshBookInternal`**

After `fetchBookComplete` (line 1791):

```typescript
const result = await fetchBookComplete(foreignBookId);
updateProgress("Updating book information...");
```

Inside the editions loop (line 1898):

```typescript
    for (const [index, ed] of rawEditions.entries()) {
      updateProgress(`Processing edition ${index + 1} of ${rawEditions.length}: ${ed.title}`);
```

Before orphan detection (line 1990):

```typescript
updateProgress("Checking for removed editions...");
```

- [ ] **Step 3: Update `refreshBookHandler` to pass `updateProgress`**

Update at line 2099:

```typescript
const refreshBookHandler: CommandHandler = async (body, updateProgress) => {
  const data = body as { bookId: number };
  updateProgress("Fetching fresh data from Hardcover...");
  const result = await refreshBookInternal(data.bookId, updateProgress);
  return result;
};
```

- [ ] **Step 4: Build and verify**

Run: `bun run build`
Expected: Clean build with no errors

- [ ] **Step 5: Commit**

```bash
git add src/server/import.ts
git commit -m "feat: add per-edition progress messages to book metadata refresh"
```

---

### Task 7: Add progress messages to manga import and refresh handlers

**Files:**

- Modify: `src/server/manga-import.ts:203-666`

- [ ] **Step 1: Add `updateProgress` parameter to `insertVolumesAndChapters`**

Change the signature at line 203:

```typescript
function insertVolumesAndChapters(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  mangaId: number,
  volumeGroups: Map<number | null, DeduplicatedChapter[]>,
  monitorOption: "all" | "future" | "missing" | "none",
  updateProgress: (message: string) => void = () => {},
): { volumesAdded: number; chaptersAdded: number } {
```

Inside the volume loop (line 212), add:

```typescript
  const totalVolumes = volumeGroups.size;
  let volumeIndex = 0;
  for (const [volumeNumber, volumeChapters] of volumeGroups) {
    volumeIndex += 1;
    updateProgress(`Creating volume ${volumeIndex} of ${totalVolumes}...`);
```

- [ ] **Step 2: Pass `updateProgress` from `importMangaHandler`**

Update the call at line 339:

```typescript
const { volumesAdded, chaptersAdded } = insertVolumesAndChapters(
  tx,
  mangaRow.id,
  volumeGroups,
  data.monitorOption,
  updateProgress,
);
```

Note: `updateProgress` is called inside a transaction here. This is fine — it just writes to a different table and emits an SSE event.

- [ ] **Step 3: Add progress to `refreshMangaHandler`**

Update at line 652 to add a more detailed initial message and a post-refresh message:

```typescript
const refreshMangaHandler: CommandHandler = async (body, updateProgress) => {
  const data = body as { mangaId: number };

  const mangaRow = db
    .select({ title: manga.title })
    .from(manga)
    .where(eq(manga.id, data.mangaId))
    .get();

  updateProgress(`Fetching latest data for ${mangaRow?.title ?? "manga"}...`);
  const result = await refreshMangaInternal(data.mangaId);

  return { success: true, newChaptersAdded: result.newChaptersAdded };
};
```

- [ ] **Step 4: Build and verify**

Run: `bun run build`
Expected: Clean build with no errors

- [ ] **Step 5: Commit**

```bash
git add src/server/manga-import.ts
git commit -m "feat: add per-volume progress messages to manga import/refresh"
```

---

### Task 8: Final build verification

**Files:** None (verification only)

- [ ] **Step 1: Full build**

Run: `bun run build`
Expected: Clean build with no errors

- [ ] **Step 2: Verify dev server starts**

Run: `bun run dev` (check it starts without errors, then stop it)
Expected: Dev server starts and renders the app

- [ ] **Step 3: Commit if any fixes were needed**

Only commit if build/dev revealed issues that needed fixing.
