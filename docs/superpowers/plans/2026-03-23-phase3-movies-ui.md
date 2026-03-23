# Phase 3: Movies UI + Features Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the complete Movies UI — list page, add/search page, detail page, calendar, sidebar navigation, and Activity history integration — following existing Bookshelf patterns.

**Architecture:** Movies routes live under `/movies/` matching the pattern of `/bookshelf/`. Components go in `src/components/movies/`. Query/mutation hooks follow the existing `src/lib/queries/` + `src/hooks/mutations/` pattern. The sidebar gets a new "Movies" nav group between "Books" (renamed from "Bookshelf") and "Activity". Also rename "Bookshelf" to "Books" in the sidebar to match the spec's navigation structure.

**Tech Stack:** TanStack Start (React SSR), TanStack Router (file-based), TanStack Query, shadcn/ui, Tailwind CSS v4, Zod

**Spec:** `docs/superpowers/specs/2026-03-23-multi-media-support-design.md` (Section 10)

---

## File Map

### Files to Create

**Routes:**

| File                                     | Responsibility                                              |
| ---------------------------------------- | ----------------------------------------------------------- |
| `src/routes/_authed/movies/index.tsx`    | Movie list page (poster grid/table toggle, search, filters) |
| `src/routes/_authed/movies/add.tsx`      | TMDB movie search + add page                                |
| `src/routes/_authed/movies/$movieId.tsx` | Movie detail page                                           |
| `src/routes/_authed/movies/calendar.tsx` | Upcoming movie releases calendar                            |

**Components:**

| File                                            | Responsibility                                   |
| ----------------------------------------------- | ------------------------------------------------ |
| `src/components/movies/movie-card.tsx`          | Poster card for grid view                        |
| `src/components/movies/movie-table.tsx`         | Table view for movie list                        |
| `src/components/movies/movie-poster.tsx`        | Movie poster image with fallback                 |
| `src/components/movies/tmdb-movie-search.tsx`   | TMDB search results + preview modal              |
| `src/components/movies/movie-detail-header.tsx` | Detail page header (poster + metadata + actions) |
| `src/components/movies/movie-files-tab.tsx`     | Files tab in detail page                         |

**Query/Mutation hooks:**

| File                            | Responsibility                                           |
| ------------------------------- | -------------------------------------------------------- |
| `src/lib/queries/movies.ts`     | Query options for movies (list, detail, existence check) |
| `src/lib/queries/tmdb.ts`       | Query options for TMDB search                            |
| `src/hooks/mutations/movies.ts` | Mutation hooks (add, update, delete)                     |

### Files to Modify

| File                                      | What Changes                                                                                 |
| ----------------------------------------- | -------------------------------------------------------------------------------------------- |
| `src/components/layout/app-sidebar.tsx`   | Add Movies nav group, rename Bookshelf to Books, add TV Shows nav group (placeholder routes) |
| `src/lib/query-keys.ts`                   | Add `movies` and `tmdb` query key factories                                                  |
| `src/components/activity/history-tab.tsx` | Add movie/show event types to labels and badge variants                                      |

---

## Tasks

### Task 1: Query Keys, Queries, and Mutations

**Files:**

- Modify: `src/lib/query-keys.ts`
- Create: `src/lib/queries/movies.ts`
- Create: `src/lib/queries/tmdb.ts`
- Create: `src/hooks/mutations/movies.ts`

- [ ] **Step 1: Add query keys**

Add to `src/lib/query-keys.ts` after the `books` section:

```typescript
// ─── Movies ──────────────────────────────────────────────────────────────
movies: {
  all: ["movies"] as const,
  lists: () => ["movies", "list"] as const,
  detail: (id: number) => ["movies", "detail", id] as const,
  existence: (tmdbId: number) => ["movies", "existence", tmdbId] as const,
},

// ─── TMDB ────────────────────────────────────────────────────────────────
tmdb: {
  all: ["tmdb"] as const,
  searchMovies: (query: string) => ["tmdb", "searchMovies", query] as const,
  searchShows: (query: string) => ["tmdb", "searchShows", query] as const,
  searchMulti: (query: string) => ["tmdb", "searchMulti", query] as const,
},
```

- [ ] **Step 2: Create movie queries**

Create `src/lib/queries/movies.ts` following the pattern in `src/lib/queries/authors.ts`:

- `moviesListQuery()` — calls `getMoviesFn()`, returns queryOptions
- `movieDetailQuery(id)` — calls `getMovieDetailFn({ data: { id } })`
- `movieExistenceQuery(tmdbId)` — calls `checkMovieExistsFn({ data: { tmdbId } })`

- [ ] **Step 3: Create TMDB queries**

Create `src/lib/queries/tmdb.ts`:

- `tmdbSearchMoviesQuery(query)` — calls `searchTmdbMoviesFn({ data: { query } })`, enabled only when query length >= 2
- `tmdbSearchShowsQuery(query)` — calls `searchTmdbShowsFn({ data: { query } })`, same
- `tmdbSearchMultiQuery(query)` — calls `searchTmdbFn({ data: { query } })`, same

- [ ] **Step 4: Create movie mutations**

Create `src/hooks/mutations/movies.ts` following `src/hooks/mutations/authors.ts`:

- `useAddMovie()` — calls `addMovieFn`, invalidates movies queries on success
- `useUpdateMovie()` — calls `updateMovieFn`, invalidates movies queries
- `useDeleteMovie()` — calls `deleteMovieFn`, invalidates movies queries

- [ ] **Step 5: Commit**

```bash
git add src/lib/query-keys.ts src/lib/queries/movies.ts src/lib/queries/tmdb.ts src/hooks/mutations/movies.ts
git commit -m "feat: add movie and TMDB query/mutation hooks"
```

---

### Task 2: Sidebar Navigation Update

**Files:**

- Modify: `src/components/layout/app-sidebar.tsx`

- [ ] **Step 1: Read the current sidebar**

Read `src/components/layout/app-sidebar.tsx` to understand the NavGroup structure.

- [ ] **Step 2: Rename Bookshelf to Books and add Movies + TV Shows groups**

Update the nav groups array:

1. Rename "Bookshelf" group to "Books", change `to` to "/books" (but keep `matchPrefixes` including both `/bookshelf` and `/books` for backwards compat during transition)
2. Add "TV Shows" group after Books:
   - title: "TV Shows", to: "/tv", matchPrefixes: ["/tv"]
   - Children: Add New (/tv/add, Plus icon), Series (/tv/series, Tv icon), Calendar (/tv/calendar, Calendar icon)
3. Add "Movies" group after TV Shows:
   - title: "Movies", to: "/movies", matchPrefixes: ["/movies"]
   - Children: Add New (/movies/add, Plus icon), Movies (/movies, Film icon), Calendar (/movies/calendar, Calendar icon)

Import needed icons: `Film`, `Tv`, `TvMinimal`, `Calendar`, `Clapperboard` from lucide-react.

Note: TV Shows routes don't exist yet (Phase 4) — the sidebar links are added now so the navigation structure is complete. They'll show empty pages until Phase 4.

- [ ] **Step 3: Commit**

```bash
git add src/components/layout/app-sidebar.tsx
git commit -m "feat: add Movies and TV Shows to sidebar navigation"
```

---

### Task 3: Movie List Page

**Files:**

- Create: `src/routes/_authed/movies/index.tsx`
- Create: `src/components/movies/movie-card.tsx`
- Create: `src/components/movies/movie-table.tsx`
- Create: `src/components/movies/movie-poster.tsx`

- [ ] **Step 1: Create MoviePoster component**

Create `src/components/movies/movie-poster.tsx`:

- Props: `posterUrl: string`, `title: string`, `className?: string`
- Renders an img tag with the poster URL, fallback to a Film icon placeholder
- Follow the pattern in any existing book cover/author photo component

- [ ] **Step 2: Create MovieCard component**

Create `src/components/movies/movie-card.tsx`:

- Props: movie object (id, title, year, posterUrl, status, monitored, hasFile)
- Card layout: poster image + overlay with title, year, status badge
- Monitored indicator (eye icon or similar)
- hasFile indicator (check icon or download icon)
- Click navigates to `/movies/${movie.id}`
- Follow the pattern in author-card.tsx

- [ ] **Step 3: Create MovieTable component**

Create `src/components/movies/movie-table.tsx`:

- Props: movies array, onSort callback
- Columns: Poster thumbnail (small), Title, Year, Studio, Status (badge), Profile, Has File, Monitored
- Row click navigates to detail
- Follow the pattern in author-table.tsx

- [ ] **Step 4: Create movie list route**

Create `src/routes/_authed/movies/index.tsx`:

- Loader: prefetch `moviesListQuery()`
- Component:
  - PageHeader with title "Movies", description with count
  - View toggle (grid/table) buttons
  - Search input for filtering
  - Grid view: MovieCard components in responsive grid
  - Table view: MovieTable component
  - EmptyState when no movies
  - Link to /movies/add in actions
- Follow the pattern in `src/routes/_authed/bookshelf/authors/index.tsx`

- [ ] **Step 5: Verify page loads**

Run: `bun run dev`, navigate to `/movies`
Expected: Empty state page with "No movies" message and link to add.

- [ ] **Step 6: Commit**

```bash
git add src/routes/_authed/movies/ src/components/movies/
git commit -m "feat: add movie list page with grid/table views"
```

---

### Task 4: Movie Add/Search Page

**Files:**

- Create: `src/routes/_authed/movies/add.tsx`
- Create: `src/components/movies/tmdb-movie-search.tsx`

- [ ] **Step 1: Create TMDB movie search component**

Create `src/components/movies/tmdb-movie-search.tsx`:

- Search input with debounce (300ms)
- Uses `tmdbSearchMoviesQuery(query)` for results
- Result cards: poster thumbnail, title, year, overview (truncated), vote average badge
- Each result has an "Add" button or click to open preview
- Preview modal shows: full poster, title, year, overview, genres, vote average, runtime
- Preview modal has: download profile dropdown (filtered to contentType="movie"), minimum availability dropdown, "Add Movie" button
- Check existence: use `movieExistenceQuery(tmdbId)` to show "Already added" badge
- Follow patterns from `src/routes/_authed/bookshelf/add.tsx`

- [ ] **Step 2: Create add route**

Create `src/routes/_authed/movies/add.tsx`:

- PageHeader with title "Add Movie", back link to /movies
- The TmdbMovieSearch component as the main content
- Card wrapper around search area

- [ ] **Step 3: Verify page works**

Run: `bun run dev`, navigate to `/movies/add`
Expected: Search page loads. If TMDB API key is configured, search returns results. If not, show helpful message about configuring TMDB in Settings > Metadata.

- [ ] **Step 4: Commit**

```bash
git add src/routes/_authed/movies/add.tsx src/components/movies/tmdb-movie-search.tsx
git commit -m "feat: add TMDB movie search and add page"
```

---

### Task 5: Movie Detail Page

**Files:**

- Create: `src/routes/_authed/movies/$movieId.tsx`
- Create: `src/components/movies/movie-detail-header.tsx`
- Create: `src/components/movies/movie-files-tab.tsx`

- [ ] **Step 1: Create movie detail header**

Create `src/components/movies/movie-detail-header.tsx`:

- Layout: poster (left) + details card (center) + description (right), same flex pattern as book detail
- Details card shows: year, studio, runtime, status badge, minimum availability, genres, monitored toggle, download profile
- Action buttons: Toggle Monitored, Delete (with confirmation dialog)
- Follow the three-column pattern in `bookshelf/books/$bookId.tsx`

- [ ] **Step 2: Create movie files tab**

Create `src/components/movies/movie-files-tab.tsx`:

- Shows list of movie files (usually 0 or 1)
- Each file: path, size (formatted), quality badge, codec, container, duration, date added
- "No files" empty state
- Delete file button (with confirmation)

- [ ] **Step 3: Create detail route**

Create `src/routes/_authed/movies/$movieId.tsx`:

- Loader: ensure `movieDetailQuery(movieId)` and `downloadProfilesListQuery()`
- Back link to /movies
- MovieDetailHeader component
- Tabs: Overview (description + metadata), Files (MovieFilesTab)
- Pending component: loading skeleton

- [ ] **Step 4: Verify detail page**

Run: `bun run dev`
Expected: If a movie has been added, navigating to `/movies/{id}` shows the detail page.

- [ ] **Step 5: Commit**

```bash
git add src/routes/_authed/movies/$movieId.tsx src/components/movies/
git commit -m "feat: add movie detail page with files tab"
```

---

### Task 6: Movie Calendar Page

**Files:**

- Create: `src/routes/_authed/movies/calendar.tsx`

- [ ] **Step 1: Create calendar route**

Create `src/routes/_authed/movies/calendar.tsx`:

- Simple calendar view showing upcoming movie releases
- Query movies with status "announced" or "inCinemas"
- Group by month
- Each entry shows: poster thumbnail, title, release date, status badge
- If no upcoming movies, show empty state
- This is a simple list-based calendar (not a full calendar widget) — group by month/week

Note: This doesn't need to be a complex calendar component. A simple chronological list grouped by month, similar to what Radarr shows, is sufficient for Phase 3.

- [ ] **Step 2: Commit**

```bash
git add src/routes/_authed/movies/calendar.tsx
git commit -m "feat: add movie calendar page"
```

---

### Task 7: Activity History Integration

**Files:**

- Modify: `src/components/activity/history-tab.tsx`

- [ ] **Step 1: Read the history tab component**

Read `src/components/activity/history-tab.tsx` to understand the event type labels, badge variants, and table structure.

- [ ] **Step 2: Add movie and show event types**

Add to the event type labels map:

```typescript
movieAdded: "Movie Added",
movieDeleted: "Movie Deleted",
movieFileImported: "Movie File Imported",
movieFileDeleted: "Movie File Deleted",
showAdded: "Show Added",
showDeleted: "Show Deleted",
episodeFileImported: "Episode File Imported",
episodeFileDeleted: "Episode File Deleted",
```

Add corresponding badge variants (use existing color patterns — "added" events use default, "deleted" use destructive, etc.).

Add movie/show columns to the table if the event has a showId or movieId — link to the detail page.

- [ ] **Step 3: Add content type filter to history**

Add a filter dropdown or tabs for content type: All / Books / TV / Movies. Filter events based on whether they have bookId, showId, or movieId set.

- [ ] **Step 4: Commit**

```bash
git add src/components/activity/history-tab.tsx
git commit -m "feat: add movie and show event types to activity history"
```

---

### Task 8: Build Verification

- [ ] **Step 1: Run build**

Run: `bun run build`
Expected: Clean build.

- [ ] **Step 2: Smoke test**

Run: `bun run dev`
Verify:

- Sidebar shows Books, TV Shows, Movies, Activity, Settings, System
- `/movies` loads with empty state
- `/movies/add` loads with search
- `/movies/calendar` loads
- Activity history page loads with new event type options
- Existing book pages still work
- Route tree was auto-generated correctly

- [ ] **Step 3: Commit any fixes**

```bash
git add -A
git commit -m "fix: Phase 3 integration fixes"
```
