# Phase 4: TV Shows UI + Features Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the complete TV Shows UI — series list, add/search, show detail with seasons/episodes, calendar, and mass editor — following the patterns established in Phase 3 (Movies UI).

**Architecture:** TV Shows routes live under `/tv/` mirroring `/movies/`. The key difference from movies is the hierarchical data: shows contain seasons which contain episodes. The show detail page uses a seasons accordion with per-episode file status. Query/mutation hooks follow the same `src/lib/queries/` + `src/hooks/mutations/` pattern. TMDB search queries already exist from Phase 3.

**Tech Stack:** TanStack Start (React SSR), TanStack Router, TanStack Query, shadcn/ui, Tailwind CSS v4, Zod

**Spec:** `docs/superpowers/specs/2026-03-23-multi-media-support-design.md` (Section 10)

---

## File Map

### Files to Create

**Routes:**

| File                                       | Responsibility                                      |
| ------------------------------------------ | --------------------------------------------------- |
| `src/routes/_authed/tv/index.tsx`          | TV series list (poster grid/table, search, filters) |
| `src/routes/_authed/tv/add.tsx`            | TMDB show search + add page                         |
| `src/routes/_authed/tv/series/$showId.tsx` | Show detail with seasons/episodes                   |
| `src/routes/_authed/tv/calendar.tsx`       | Upcoming episodes calendar                          |

**Components:**

| File                                       | Responsibility                                           |
| ------------------------------------------ | -------------------------------------------------------- |
| `src/components/tv/show-card.tsx`          | Poster card for grid view                                |
| `src/components/tv/show-table.tsx`         | Table view for series list                               |
| `src/components/tv/show-poster.tsx`        | Show poster image with fallback                          |
| `src/components/tv/tmdb-show-search.tsx`   | TMDB show search + preview modal with monitoring options |
| `src/components/tv/show-detail-header.tsx` | Detail page header (poster + metadata + actions)         |
| `src/components/tv/season-accordion.tsx`   | Collapsible season with episode list                     |
| `src/components/tv/episode-row.tsx`        | Single episode row with file status, monitored toggle    |

**Query/Mutation hooks:**

| File                           | Responsibility                                    |
| ------------------------------ | ------------------------------------------------- |
| `src/lib/queries/shows.ts`     | Query options for shows (list, detail, existence) |
| `src/hooks/mutations/shows.ts` | Mutation hooks (add, update, delete)              |

### Files to Modify

| File                      | What Changes                                           |
| ------------------------- | ------------------------------------------------------ |
| `src/lib/query-keys.ts`   | Add `shows` query key factory                          |
| `src/lib/queries/tmdb.ts` | Already has `tmdbSearchShowsQuery` — no changes needed |

---

## Tasks

### Task 1: Query Keys, Queries, and Mutations

**Files:**

- Modify: `src/lib/query-keys.ts`
- Create: `src/lib/queries/shows.ts`
- Create: `src/hooks/mutations/shows.ts`

- [ ] **Step 1: Add show query keys**

Add to `src/lib/query-keys.ts` after the `movies` section:

```typescript
// ─── Shows ───────────────────────────────────────────────────────────────
shows: {
  all: ["shows"] as const,
  lists: () => ["shows", "list"] as const,
  detail: (id: number) => ["shows", "detail", id] as const,
  existence: (tmdbId: number) => ["shows", "existence", tmdbId] as const,
},
```

- [ ] **Step 2: Create show queries**

Create `src/lib/queries/shows.ts` following `src/lib/queries/movies.ts`:

- `showsListQuery()` — calls `getShowsFn()`
- `showDetailQuery(id)` — calls `getShowDetailFn({ data: { id } })`
- `showExistenceQuery(tmdbId)` — calls `checkShowExistsFn({ data: { tmdbId } })`, enabled when tmdbId > 0

- [ ] **Step 3: Create show mutations**

Create `src/hooks/mutations/shows.ts` following `src/hooks/mutations/movies.ts`:

- `useAddShow()` — calls `addShowFn`, invalidates `queryKeys.shows.all` + `dashboard.all` + `history.all`
- `useUpdateShow()` — calls `updateShowFn`, invalidates `queryKeys.shows.all`
- `useDeleteShow()` — calls `deleteShowFn`, invalidates `queryKeys.shows.all` + `dashboard.all` + `history.all`

Export from `src/hooks/mutations/index.ts` and `src/lib/queries/index.ts` barrel files.

- [ ] **Step 4: Commit**

```bash
git add src/lib/query-keys.ts src/lib/queries/shows.ts src/lib/queries/index.ts src/hooks/mutations/shows.ts src/hooks/mutations/index.ts
git commit -m "feat: add show query/mutation hooks"
```

---

### Task 2: Show List Page

**Files:**

- Create: `src/routes/_authed/tv/index.tsx`
- Create: `src/components/tv/show-card.tsx`
- Create: `src/components/tv/show-table.tsx`
- Create: `src/components/tv/show-poster.tsx`

- [ ] **Step 1: Create ShowPoster component**

`src/components/tv/show-poster.tsx` — Mirror `src/components/movies/movie-poster.tsx` but use `Tv` icon as fallback instead of `Film`.

- [ ] **Step 2: Create ShowCard component**

`src/components/tv/show-card.tsx` — Mirror `src/components/movies/movie-card.tsx`:

- Props: show object (id, title, year, posterUrl, status, monitored, network, seasonCount, episodeCount, episodeFileCount)
- Link to `/tv/series/${show.id}`
- Overlay badges: monitored indicator, episode progress (e.g., "5/10" episodes with files)
- Status badge: continuing=green, ended=blue, upcoming=yellow, canceled=red

- [ ] **Step 3: Create ShowTable component**

`src/components/tv/show-table.tsx` — Mirror `src/components/movies/movie-table.tsx`:

- Columns: poster thumbnail, Title (link), Year, Network, Seasons, Episodes (fileCount/total), Status (badge), Monitored
- Row click navigates to `/tv/series/${show.id}`
- Status badge colors: continuing=green, ended=blue, upcoming=yellow, canceled=red

- [ ] **Step 4: Create TV series list route**

`src/routes/_authed/tv/index.tsx` — Mirror `src/routes/_authed/movies/index.tsx`:

- Route: `createFileRoute("/_authed/tv/")`
- Loader: prefetch `showsListQuery()`
- PageHeader: title="TV Shows", description="{count} series", actions=[Link to /tv/add]
- Grid/table toggle, search filter
- Grid: ShowCard in responsive grid
- Table: ShowTable
- EmptyState: Tv icon, "No TV shows yet"

- [ ] **Step 5: Verify page loads**

Run: `bun run dev`, navigate to `/tv`
Expected: Empty state page.

- [ ] **Step 6: Commit**

```bash
git add src/routes/_authed/tv/ src/components/tv/
git commit -m "feat: add TV series list page with grid/table views"
```

---

### Task 3: Show Add/Search Page

**Files:**

- Create: `src/routes/_authed/tv/add.tsx`
- Create: `src/components/tv/tmdb-show-search.tsx`

- [ ] **Step 1: Create TMDB show search component**

`src/components/tv/tmdb-show-search.tsx` — Similar to `src/components/movies/tmdb-movie-search.tsx` but with TV-specific fields:

- Uses `tmdbSearchShowsQuery(query)` (already exists in `src/lib/queries/tmdb.ts`)
- Result cards: poster, name (not title — TMDB TV uses `name`), first_air_date year, overview, vote_average, origin_country
- Preview modal shows:
  - Full poster, name + year
  - Overview, vote average, origin country
  - "Already in library" badge via `showExistenceQuery(tmdbId)`
  - Download Profile select (filter: `contentType === 'tv' && enabled`)
  - **Monitoring Option** select (unique to TV, not on movies):
    - All Seasons, Future Episodes, Missing Episodes, Existing Episodes, Pilot Only, First Season, Last Season, None
  - **Series Type** select: Standard, Daily, Anime
  - "Add Show" button → `useAddShow().mutate({ tmdbId, downloadProfileId, monitorOption })`
  - On success: close modal, toast, navigate to `/tv/series/${showId}`

- [ ] **Step 2: Create add route**

`src/routes/_authed/tv/add.tsx`:

- Route: `createFileRoute("/_authed/tv/add")`
- Back link to /tv, PageHeader "Add TV Show"
- Card wrapping TmdbShowSearch component

- [ ] **Step 3: Commit**

```bash
git add src/routes/_authed/tv/add.tsx src/components/tv/tmdb-show-search.tsx
git commit -m "feat: add TMDB show search and add page"
```

---

### Task 4: Show Detail Page with Seasons/Episodes

**Files:**

- Create: `src/routes/_authed/tv/series/$showId.tsx`
- Create: `src/components/tv/show-detail-header.tsx`
- Create: `src/components/tv/season-accordion.tsx`
- Create: `src/components/tv/episode-row.tsx`

This is the most complex task — the show detail page has a seasons/episodes hierarchy that doesn't exist in movies.

- [ ] **Step 1: Create show detail header**

`src/components/tv/show-detail-header.tsx` — Mirror `src/components/movies/movie-detail-header.tsx`:

- Three-column layout: poster + details card + description
- Details card: year, network, runtime, status badge, series type badge, genres, monitored toggle, download profile
- Episode progress: "X/Y episodes" with progress indicator
- Action buttons: back link, TMDB external link, delete with confirmation
- Series type displayed as badge: Standard, Daily, Anime

- [ ] **Step 2: Create episode row component**

`src/components/tv/episode-row.tsx`:

- Props: episode object (episodeNumber, absoluteNumber, title, airDate, runtime, hasFile, monitored)
- Layout: table row or flex row
- Columns: episode number (e.g., "E05" or "42" for absolute), title, air date (formatted), runtime, file status icon (check/x), monitored toggle
- Unaired episodes (airDate > today or null): show "TBA" or the future date, muted styling
- hasFile indicator: green check if file exists, gray dash if not
- Monitored toggle: small switch or checkbox

- [ ] **Step 3: Create season accordion component**

`src/components/tv/season-accordion.tsx`:

- Props: season object with episodes array, show seriesType
- Uses shadcn Accordion (collapsible)
- Accordion trigger: "Season {number}" (or "Specials" for season 0), episode count, file count progress
- Accordion content: list of EpisodeRow components
- Monitored indicator on the season level
- File progress: "3/10 episodes" with a small progress bar or fraction text

- [ ] **Step 4: Create detail route**

`src/routes/_authed/tv/series/$showId.tsx`:

- Route: `createFileRoute("/_authed/tv/series/$showId")`
- Loader: ensure `showDetailQuery(showId)` + `downloadProfilesListQuery()`
- Component:
  - ShowDetailHeader at top
  - Below: season list using SeasonAccordion components
  - Seasons sorted by seasonNumber (specials/season 0 at bottom or top — match Sonarr's convention of putting specials last)
  - Each season is an accordion item
- pendingComponent: loading skeleton

- [ ] **Step 5: Verify detail page**

Run: `bun run dev`
Expected: If a show has been added via the add page, detail page shows seasons accordion with episodes.

- [ ] **Step 6: Commit**

```bash
git add src/routes/_authed/tv/series/ src/components/tv/
git commit -m "feat: add show detail page with seasons and episodes"
```

---

### Task 5: TV Calendar Page

**Files:**

- Create: `src/routes/_authed/tv/calendar.tsx`

- [ ] **Step 1: Create calendar route**

`src/routes/_authed/tv/calendar.tsx` — Mirror `src/routes/_authed/movies/calendar.tsx` but for episodes:

- Route: `createFileRoute("/_authed/tv/calendar")`
- Loader: prefetch `showsListQuery()`
- Show upcoming episodes (episodes where airDate is in the future or recent past, e.g., last 7 days through next 30 days)
- Since `showsListQuery` returns shows with counts (not individual episodes), and `showDetailQuery` returns full episodes, we need to either:
  - Option A: Create a new server function `getUpcomingEpisodesFn()` that queries episodes with upcoming air dates
  - Option B: Use the existing data — show a simpler view of shows that are "continuing" status
- **Use Option B for now** (simpler): list continuing shows with their next episode air date info. A dedicated upcoming episodes endpoint can be added later when needed.
- Group by status: "Airing" (continuing) and "Upcoming" (upcoming status)
- EmptyState: Calendar icon, "No upcoming shows"

- [ ] **Step 2: Commit**

```bash
git add src/routes/_authed/tv/calendar.tsx
git commit -m "feat: add TV calendar page"
```

---

### Task 6: Mass Editor for Movies and TV

**Files:**

- Modify: `src/routes/_authed/movies/index.tsx`
- Modify: `src/routes/_authed/tv/index.tsx`

- [ ] **Step 1: Add mass editor mode to movie list**

Add to the movies list page (`src/routes/_authed/movies/index.tsx`):

- "Mass Editor" toggle button in PageHeader actions (next to Add Movie)
- When mass editor is active:
  - Table view is forced (no grid view in mass editor mode)
  - Each row gets a checkbox for selection
  - Select all checkbox in header
  - Bulk action bar appears at bottom with: Profile dropdown (change profile for selected), Monitored toggle, Minimum Availability dropdown, "Apply" button
  - "Apply" calls `useUpdateMovie().mutate()` for each selected movie
  - Cancel button exits mass editor mode

- [ ] **Step 2: Add mass editor mode to TV list**

Add to the TV list page (`src/routes/_authed/tv/index.tsx`):

- Same pattern as movies
- Bulk actions: Profile dropdown, Monitored toggle, Series Type dropdown (Standard/Daily/Anime)
- "Apply" calls `useUpdateShow().mutate()` for each selected show

- [ ] **Step 3: Commit**

```bash
git add src/routes/_authed/movies/index.tsx src/routes/_authed/tv/index.tsx
git commit -m "feat: add mass editor to movie and TV show list pages"
```

---

### Task 7: Build Verification

- [ ] **Step 1: Run build**

Run: `bun run build`
Expected: Clean build.

- [ ] **Step 2: Smoke test**

Run: `bun run dev`
Verify:

- `/tv` loads with empty state
- `/tv/add` loads with TMDB show search
- `/tv/calendar` loads
- `/movies` still works, mass editor toggle visible
- Sidebar TV Shows links all work
- Route tree generated correctly

- [ ] **Step 3: Commit any fixes**

```bash
git add -A
git commit -m "fix: Phase 4 integration fixes"
```
