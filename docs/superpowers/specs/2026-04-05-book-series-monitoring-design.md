# Book Series Monitoring Design Specification

**Date:** 2026-04-05
**Status:** Approved

## Overview

Add series-level monitoring for books, mirroring how movie collections work. Series become first-class monitored entities with their own download profiles. A new top-level Series page displays all series containing monitored books. Monitored series auto-add new books (and their authors if needed) during a dedicated scheduled refresh task.

## Data Model

### Modified Table: `series`

Add columns to the existing table:

| Column | Type | Default | Description |
|--------|------|---------|-------------|
| `monitored` | boolean | `false` | Whether to auto-add new books during series refresh |
| `updatedAt` | timestamp | NOT NULL | Auto-set on creation and update |

Existing columns unchanged: `id`, `title`, `slug`, `foreignSeriesId`, `description`, `isCompleted`, `metadataUpdatedAt`, `metadataSourceMissingSince`, `createdAt`.

### New Table: `seriesDownloadProfiles`

Join table linking series to download profiles (same pattern as `movieCollectionDownloadProfiles` and `authorDownloadProfiles`).

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | integer | PK, auto-increment |
| `seriesId` | integer | NOT NULL, FK → `series.id`, ON DELETE CASCADE |
| `downloadProfileId` | integer | NOT NULL, FK → `downloadProfiles.id`, ON DELETE CASCADE |

Composite unique constraint on `(seriesId, downloadProfileId)`.

### No New Cache Table

Unlike movie collections which need `movieCollectionMovies` to cache TMDB data, book series already have `seriesBookLinks` as the local relationship table. Hardcover series data is fetched on-demand via `fetchSeriesComplete()` and merged at query time (existing pattern in the author Series tab).

## Series Creation & Monitoring Triggers

### Series Record Creation (Existing Behavior, Unchanged)

Series records are auto-created during author import/refresh via `importAuthorInternal` and `refreshAuthorInternal`. Each book's `book_series` data from Hardcover triggers an `ensureSeries()` upsert + `seriesBookLinks` insertion. New series start with `monitored: false` and no download profiles.

### "Monitor Book & Series" Option (Book Add Flow)

This option appears in the book add flow only when the book has at least one series association. When selected:

1. The book is monitored normally (editions get download profiles)
2. For each series the book belongs to:
   - Set `monitored: true` on the series record
   - Copy the download profiles from the add context into `seriesDownloadProfiles` (if the series doesn't already have profiles)
   - Trigger an immediate series refresh for that series — fetch `fetchSeriesComplete()`, discover all books in the series, auto-add missing ones (importing authors as needed with only the series book monitored)

### Author Add Flow (Unchanged)

No change to the add-author flow. Series records get created as they do today. The "monitor book & series" option is on the book add flow only, not the author add flow, to avoid cascading for prolific authors (e.g., Stephen King).

### Unmonitoring Behavior

- Unmonitoring a series sets `monitored: false` — stops auto-adding new books on refresh. Does NOT unmonitor existing books.
- Unmonitoring individual books has no effect on series monitoring status.

## Series Refresh Task

### New Scheduled Task: `refreshSeriesMetadata`

Follows the existing long-running job pattern (like `refreshMetadata` in `src/server/scheduler/tasks/refresh-metadata.ts`).

**Flow:**

1. Query all series where `monitored = true`
2. For each monitored series with a `foreignSeriesId`:
   - Call `fetchSeriesComplete()` with the series' Hardcover ID, configured language codes, and no `excludeAuthorId` (fetch ALL authors' books)
   - Compare Hardcover books against existing `seriesBookLinks` to find new entries
   - For each new book discovered:
     - If the book's author exists locally → import the book under that author, monitor it with the series' download profiles
     - If the book's author doesn't exist locally → import the author (with `monitorNewBooks: "none"`, `monitored: false`) then monitor only the series book with the series' download profiles
   - Update series metadata (title, isCompleted, slug) from Hardcover response
   - Update `metadataUpdatedAt` timestamp
3. Log history events for each book added (`bookAdded` with series context in the `data` JSON)
4. Return aggregate stats (series refreshed, books added, authors imported, errors)

**Scheduling:** Registered in the scheduler with a default interval matching the existing metadata refresh cadence (12 hours). Appears in `/system/tasks` with start/stop controls and last-run status.

**Import Exclusions:** Respects the existing `bookImportListExclusions` table — if a book's Hardcover ID is excluded, skip it during series auto-add. Mirrors how movie collections respect `movieImportListExclusions`.

## Server Functions

### New: `src/server/series.ts`

| Function | Method | Input | Description |
|----------|--------|-------|-------------|
| `getSeriesListFn` | GET | none | All series that have at least one monitored book (for top-level Series page). Returns series with book counts, monitored status, download profiles. |
| `updateSeriesFn` | POST | `{ id, monitored?, downloadProfileIds? }` | Update series settings. When `downloadProfileIds` provided, delete/reinsert `seriesDownloadProfiles`. |
| `refreshSeriesFn` | POST | `{ seriesId?: number }` | Refresh a single series (manual trigger) or all monitored series (no arg). The scheduled task calls this without an argument. |

### Modified: Book Add Handler

The book add handler gains a `monitorOption` parameter:

- `"bookOnly"` — existing behavior, monitor the book
- `"bookAndSeries"` — monitor the book + set series as monitored + copy download profiles to series + trigger immediate series refresh
- `"none"` — add without monitoring

### Modified: `src/server/authors.ts`

`getAuthorFn` — already returns `authorSeries`. No changes needed since the author Series tab is structurally the same, gaining UI controls for series monitoring that call `updateSeriesFn`.

### New: `src/server/scheduler/tasks/refresh-series-metadata.ts`

The scheduled task entry point that calls `refreshSeriesFn()` and is registered in the scheduler system.

## React Hooks & Queries

### New: `src/hooks/mutations/series.ts`

| Hook | Server Function | Cache Invalidation |
|------|----------------|-------------------|
| `useUpdateSeries` | `updateSeriesFn` | `["series"]`, `["authors"]` (since author page shows series) |
| `useRefreshSeries` | `refreshSeriesFn` | `["series"]`, `["books"]`, `["authors"]`, `["history"]` |

### New: `src/lib/queries/series.ts`

| Query | Server Function | Cache Key |
|-------|----------------|-----------|
| `seriesListQuery` | `getSeriesListFn` | `["series", "list"]` |

### Modified: `src/lib/query-keys.ts`

Add new key namespace:

```typescript
series: {
  all: ["series"],
  list: () => ["series", "list"],
}
```

### Modified: Book Add Mutations

Extend to pass the `monitorOption` parameter through to the server function.

## Validators

### New Schemas in `src/lib/validators.ts`

```typescript
export const updateSeriesSchema = z.object({
  id: z.number(),
  monitored: z.boolean().optional(),
  downloadProfileIds: z.array(z.number()).optional(),
});

export const refreshSeriesSchema = z.object({
  seriesId: z.number().optional(),
});
```

### Modified: Book Add Schema

Add `monitorOption: z.enum(["bookOnly", "bookAndSeries", "none"])`.

## UI Changes

### New Route: `/series` (`src/routes/_authed/series/index.tsx`)

- Same expandable series row pattern as the author Series tab
- Scoped to series containing at least one monitored book
- Each series row shows: title, monitored toggle, book count (local/total), completion status
- Expandable to show all books (merged local + Hardcover external), same as author tab
- Series-level actions: edit download profiles, toggle monitoring
- Filter/search by series name
- Language filter (same as author series tab)

### Modified: Author Series Tab (`src/routes/_authed/authors/$authorId.tsx`)

- Add monitoring toggle per series row (calls `updateSeriesFn`)
- Add edit button to manage series download profiles
- Otherwise same behavior as today — shows all author-associated series regardless of monitoring status

### Modified: Book Add Flow

When the book being added has series associations, show a monitor option selector:

- "Book only" (default)
- "Book and series" (for each associated series)
- "None"

Only visible when the book has `series` data from Hardcover.

### Sidebar Navigation (`app-sidebar.tsx`)

Add "Series" to the Books sidebar group:

```
Books
├── Add New
├── Authors
├── Series    ← NEW
└── (other existing items)
```

### System Tasks Page (`/system/tasks`)

New entry for "Refresh Series Metadata" with standard task controls (run now, last run time, interval, status).

## Key Design Decisions

1. **Series are independent entities** — one series record shared across multiple authors. Not scoped to a single author.
2. **Series records auto-created, monitoring opt-in** — importing an author creates series records (unmonitored). User explicitly opts into series monitoring via the book add flow ("book and series") or via the series page UI.
3. **"Monitor book & series" on book add only** — not on author add, to prevent cascading for prolific authors.
4. **Download profiles inherited then independent** — series inherits profiles from the add context at creation, but can be changed independently afterward.
5. **Separate refresh task** — author refresh only fetches that author's books (cannot discover new books by other authors in shared series). Series refresh calls `fetchSeriesComplete()` which returns all authors' books.
6. **New authors imported with monitoring disabled** — when series refresh discovers a book by a new author, the author is imported with `monitored: false` and `monitorNewBooks: "none"` to prevent cascading. Only the series book gets monitored.
7. **Top-level Series page shows series with monitored books** — not just monitored series. A series with one monitored book appears even if the series itself is unmonitored.

## Out of Scope

- Manual series creation (series are auto-discovered from Hardcover only)
- Series detail page (all interaction via the list page's expandable rows)
- Bulk edit of multiple series
- Import exclusions UI specific to series (uses existing `bookImportListExclusions`)
- Changes to the author add flow (no "monitor author & all series" option)
- Series-level `minimumAvailability` equivalent (not applicable to books)
