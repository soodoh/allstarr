# Home Dashboard Design

## Overview

Replace the home page redirect (`/` → `/books`) with a dashboard showing library stats, content type breakdowns, and recent activity. Move `/library/unmapped-files` to `/unmapped-files` and integrate unmapped files into the system health check.

## Routing Changes

### Move unmapped files route

- Rename `src/routes/_authed/library/unmapped-files.tsx` → `src/routes/_authed/unmapped-files.tsx`
- Delete the `src/routes/_authed/library/` directory
- Update sidebar paths from `/library/unmapped-files` to `/unmapped-files`
- Update `matchPrefixes` from `["/library"]` to `["/unmapped-files"]`
- Sidebar remains visually identical — same "Library" group, same icon, same badge

### Dashboard as home page

- Replace redirect logic in `src/routes/_authed/index.tsx` with dashboard page component
- Requesters still redirect to `/requests` (preserve existing role-based behavior)

## Dashboard Layout

### Summary Row (4 cards)

| Card | Value | Detail | Links to |
|------|-------|--------|----------|
| Total Items | Aggregate count | Per-type breakdown (e.g., "42 books · 8 shows · 15 movies") | — |
| Files on Disk | Total file count | Per-type breakdown | — |
| Disk Usage | Total size | "of X TB across N root folders" | — |
| System Health | Green/yellow/red dot | "All systems healthy" or "N issues detected" | `/system/status` |

Health card shows yellow when any health check fails, including the new unmapped files check.

### Content Type Cards (3 cards)

One card per content type (books, TV shows, movies). Each card contains:

- **Header**: icon, title, "View all →" link
- **Counts row**: 3 key stats (varies by type — total/monitored/authors for books, series/episodes/on-disk for shows, etc.)
- **Quality bar**: horizontal stacked bar showing format/quality distribution with legend
- **Storage bar**: usage bar with "X GB / Y TB" label
- **Recently added**: last 3 items with relative timestamps

**Empty state**: content types with no data show a muted card with dashed border at 50% opacity. CTA button "Search [type] →" links to the search page.

**Card links**: "View all →" goes to `/books`, `/shows/series`, or `/movies`.

### Activity Feed

- Last 5 history events
- Each event: colored dot (green=added, blue=downloaded, yellow=updated), item name, timestamp, content type label
- "View all activity →" footer links to `/activity/history`

## Data Layer

### New server functions (`src/server/dashboard.ts`)

**`getDashboardContentStatsFn()`**
- Returns per-content-type counts: total items, monitored count, file count, related counts (authors for books, episodes for shows)
- Queries `books`, `shows`, `movies`, `authors`, `episodes`, `bookFiles`, `episodeFiles`, `movieFiles`

**`getDashboardQualityBreakdownFn()`**
- Returns file format/quality distribution per content type
- Books: grouped by format (EPUB, PDF, MOBI, AZW3, etc.)
- TV/Movies: grouped by resolution quality (1080p, 720p, 480p, etc.)
- Queries file tables grouped by the appropriate quality/format field per type

**`getDashboardStorageStatsFn()`**
- Returns disk usage per root folder and per content type
- Leverages existing disk space logic from system status

**`getDashboardRecentActivityFn()`**
- Returns last 5 history events with associated item names
- Queries `history` table joined to books/movies/episodes

### Unmapped files health check

Add unmapped files check to the existing system status health checks in `src/server/system-status.ts`:
- When unmapped file count > 0: warning level (not error), message includes count
- Links to `/unmapped-files`
- This surfaces on both the system status page and the dashboard health card

### Query keys

Expand existing `dashboard` key factory in `src/lib/query-keys.ts`:

```
dashboard.contentStats
dashboard.qualityBreakdown
dashboard.storage
dashboard.recentActivity
```

### Query functions

New file `src/lib/queries/dashboard.ts` with query option factories wrapping each server function.

## UI Components

### `src/routes/_authed/index.tsx` (Dashboard page)

- Uses `PageHeader` with title "Dashboard", subtitle "Overview of your library"
- Calls all 4 dashboard queries in route loader
- Renders SummaryRow, ContentTypeCards, ActivityFeed

### `src/components/dashboard/summary-row.tsx`

- 4-column grid of stat cards
- Health card uses system status data, shows dot + text + link

### `src/components/dashboard/content-type-card.tsx`

- Reusable card component
- Props: content type, stats, quality breakdown, storage info, recent items
- Handles both populated and empty states
- Quality bar with legend, storage bar, recent items list

### `src/components/dashboard/activity-feed.tsx`

- Renders history events with colored indicator dots
- Footer link to full history page

## Design Notes

- All components use shadcn/ui primitives and Tailwind classes
- Zinc color palette, dark mode (matches existing app theme)
- Content type cards use distinct accent colors: indigo (books), purple (TV), pink (movies)
- Responsive: summary row and content cards collapse to single column on mobile
