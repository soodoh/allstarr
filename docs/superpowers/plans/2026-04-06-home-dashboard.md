# Home Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the home page redirect with a dashboard showing library stats, content type breakdowns, and recent activity. Move unmapped-files route to `/unmapped-files` and add unmapped files as a system health check.

**Architecture:** Multiple focused server functions (`src/server/dashboard.ts`) each return a specific slice of dashboard data. Query wrappers in `src/lib/queries/dashboard.ts` with granular cache keys. Dashboard UI composed of three sections: summary row, content type cards, and activity feed.

**Tech Stack:** TanStack Start, TanStack Router, React Query, Drizzle ORM (SQLite), shadcn/ui, Tailwind CSS v4, Lucide icons

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `src/routes/_authed/library/unmapped-files.tsx` | Delete | Old route location |
| `src/routes/_authed/unmapped-files.tsx` | Create | New unmapped files route (same content, new path) |
| `src/components/layout/app-sidebar.tsx` | Modify | Update Library nav group paths |
| `src/server/system-status.ts` | Modify | Add unmapped files health check |
| `src/server/dashboard.ts` | Create | Dashboard server functions |
| `src/lib/query-keys.ts` | Modify | Expand dashboard query keys |
| `src/lib/queries/dashboard.ts` | Create | Dashboard query wrappers |
| `src/lib/queries/index.ts` | Modify | Export dashboard queries |
| `src/routes/_authed/index.tsx` | Modify | Replace redirect with dashboard page |
| `src/components/dashboard/summary-row.tsx` | Create | Summary stat cards component |
| `src/components/dashboard/content-type-card.tsx` | Create | Content type detail card component |
| `src/components/dashboard/activity-feed.tsx` | Create | Recent activity feed component |

---

### Task 1: Move Unmapped Files Route

**Files:**
- Delete: `src/routes/_authed/library/unmapped-files.tsx`
- Create: `src/routes/_authed/unmapped-files.tsx`
- Modify: `src/components/layout/app-sidebar.tsx`

- [ ] **Step 1: Read the current unmapped files route**

Read `src/routes/_authed/library/unmapped-files.tsx` to confirm current content.

- [ ] **Step 2: Create the new route at the top-level path**

Create `src/routes/_authed/unmapped-files.tsx` with the same content but updated route path:

```tsx
import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Loader2, RefreshCw } from "lucide-react";
import { useState } from "react";
import PageHeader from "src/components/shared/page-header";
import UnmappedFilesTable from "src/components/unmapped-files/unmapped-files-table";
import { Button } from "src/components/ui/button";
import { unmappedFilesListQuery } from "src/lib/queries";
import { queryKeys } from "src/lib/query-keys";
import { rescanAllRootFoldersFn } from "src/server/unmapped-files";
import { toast } from "sonner";

export const Route = createFileRoute("/_authed/unmapped-files")({
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(unmappedFilesListQuery());
  },
  component: UnmappedFilesPage,
});

function UnmappedFilesPage() {
  const queryClient = useQueryClient();
  const [isRescanning, setIsRescanning] = useState(false);

  const handleRescanAll = async () => {
    setIsRescanning(true);
    try {
      await rescanAllRootFoldersFn();
      await queryClient.invalidateQueries({
        queryKey: queryKeys.unmappedFiles.all,
      });
      toast.success("All root folders rescanned");
    } catch (error) {
      toast.error("Failed to rescan root folders");
    } finally {
      setIsRescanning(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Unmapped Files"
        description="Files found in root folders that aren't matched to any items in your library."
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={handleRescanAll}
            disabled={isRescanning}
          >
            {isRescanning ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            Rescan All
          </Button>
        }
      />
      <UnmappedFilesTable />
    </>
  );
}
```

- [ ] **Step 3: Delete the old route file**

Delete `src/routes/_authed/library/unmapped-files.tsx`.

- [ ] **Step 4: Delete the library directory if empty**

Remove `src/routes/_authed/library/` directory if no other files remain.

- [ ] **Step 5: Update sidebar navigation paths**

In `src/components/layout/app-sidebar.tsx`, update the Library nav group (lines 57-69):

Replace:
```typescript
{
  title: "Library",
  to: "/library/unmapped-files",
  icon: FolderOpen,
  matchPrefixes: ["/library"],
  children: [
    {
      title: "Unmapped Files",
      to: "/library/unmapped-files",
      icon: FileQuestion,
    },
  ],
},
```

With:
```typescript
{
  title: "Library",
  to: "/unmapped-files",
  icon: FolderOpen,
  matchPrefixes: ["/unmapped-files"],
  children: [
    {
      title: "Unmapped Files",
      to: "/unmapped-files",
      icon: FileQuestion,
    },
  ],
},
```

- [ ] **Step 6: Verify the dev server starts without errors**

Run: `bun run dev`
Expected: Server starts on port 3000, no route errors in console.

- [ ] **Step 7: Commit**

```bash
git add src/routes/_authed/unmapped-files.tsx src/components/layout/app-sidebar.tsx
git rm src/routes/_authed/library/unmapped-files.tsx
git commit -m "refactor: move unmapped-files route from /library/ to top-level"
```

---

### Task 2: Add Unmapped Files Health Check

**Files:**
- Modify: `src/server/system-status.ts`

- [ ] **Step 1: Add unmapped files import and health check**

In `src/server/system-status.ts`, add the import at line 5:

```typescript
import { count, eq } from "drizzle-orm";
import { unmappedFiles } from "src/db/schema";
```

Then add the following check at the end of the `runHealthChecks()` function, after the FFmpeg check (before `return checks;` at line 123):

```typescript
// Check for unmapped files
const unmappedCount = db
  .select({ count: count() })
  .from(unmappedFiles)
  .where(eq(unmappedFiles.ignored, false))
  .get();
const unmappedTotal = unmappedCount?.count ?? 0;
if (unmappedTotal > 0) {
  checks.push({
    source: "UnmappedFilesCheck",
    type: "warning",
    message: `${unmappedTotal} unmapped ${unmappedTotal === 1 ? "file" : "files"} found in your root folders. Review and map or ignore them.`,
    wikiUrl: "/unmapped-files",
  });
}
```

- [ ] **Step 2: Verify the dev server starts and system status page shows the check**

Run: `bun run dev`
Navigate to `/system/status` — if unmapped files exist, the new check should appear.

- [ ] **Step 3: Commit**

```bash
git add src/server/system-status.ts
git commit -m "feat: add unmapped files health check to system status"
```

---

### Task 3: Dashboard Server Functions

**Files:**
- Create: `src/server/dashboard.ts`

- [ ] **Step 1: Create the dashboard server functions file**

Create `src/server/dashboard.ts`:

```typescript
import { createServerFn } from "@tanstack/react-start";
import { count, desc, eq, sql } from "drizzle-orm";
import { db } from "src/db";
import {
  authors,
  bookFiles,
  books,
  episodeFiles,
  episodes,
  history,
  movieFiles,
  movies,
  shows,
} from "src/db/schema";
import { requireAuth } from "./middleware";
import { getDiskSpace } from "./system-status";

type ContentTypeStat = {
  total: number;
  monitored: number;
  fileCount: number;
  extra: { label: string; value: number };
};

export type ContentTypeStats = {
  books: ContentTypeStat;
  shows: ContentTypeStat;
  movies: ContentTypeStat;
};

export const getDashboardContentStatsFn = createServerFn({
  method: "GET",
}).handler(async () => {
  await requireAuth();

  const bookCount = db.select({ count: count() }).from(books).get()?.count ?? 0;
  const authorCount =
    db.select({ count: count() }).from(authors).get()?.count ?? 0;
  const bookFileCount =
    db.select({ count: count() }).from(bookFiles).get()?.count ?? 0;

  const showCount = db.select({ count: count() }).from(shows).get()?.count ?? 0;
  const episodeCount =
    db.select({ count: count() }).from(episodes).get()?.count ?? 0;
  const episodeFileCount =
    db.select({ count: count() }).from(episodeFiles).get()?.count ?? 0;

  const movieCount =
    db.select({ count: count() }).from(movies).get()?.count ?? 0;
  const movieFileCount =
    db.select({ count: count() }).from(movieFiles).get()?.count ?? 0;

  return {
    books: {
      total: bookCount,
      monitored: bookCount,
      fileCount: bookFileCount,
      extra: { label: "Authors", value: authorCount },
    },
    shows: {
      total: showCount,
      monitored: showCount,
      fileCount: episodeFileCount,
      extra: { label: "Episodes", value: episodeCount },
    },
    movies: {
      total: movieCount,
      monitored: movieCount,
      fileCount: movieFileCount,
      extra: { label: "Collections", value: 0 },
    },
  } satisfies ContentTypeStats;
});

export type QualityBreakdownItem = {
  name: string;
  count: number;
};

export type QualityBreakdown = {
  books: QualityBreakdownItem[];
  shows: QualityBreakdownItem[];
  movies: QualityBreakdownItem[];
};

export const getDashboardQualityBreakdownFn = createServerFn({
  method: "GET",
}).handler(async () => {
  await requireAuth();

  // Book files: group by quality name from JSON
  const bookRows = db
    .select({
      quality: bookFiles.quality,
    })
    .from(bookFiles)
    .all();

  const bookQualityCounts = new Map<string, number>();
  for (const row of bookRows) {
    const name = row.quality?.quality?.name ?? "Unknown";
    bookQualityCounts.set(name, (bookQualityCounts.get(name) ?? 0) + 1);
  }
  const booksBreakdown = Array.from(bookQualityCounts.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);

  // Episode files: group by quality name from JSON
  const episodeRows = db
    .select({
      quality: episodeFiles.quality,
    })
    .from(episodeFiles)
    .all();

  const episodeQualityCounts = new Map<string, number>();
  for (const row of episodeRows) {
    const name = row.quality?.quality?.name ?? "Unknown";
    episodeQualityCounts.set(name, (episodeQualityCounts.get(name) ?? 0) + 1);
  }
  const showsBreakdown = Array.from(episodeQualityCounts.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);

  // Movie files: group by quality name from JSON
  const movieRows = db
    .select({
      quality: movieFiles.quality,
    })
    .from(movieFiles)
    .all();

  const movieQualityCounts = new Map<string, number>();
  for (const row of movieRows) {
    const name = row.quality?.quality?.name ?? "Unknown";
    movieQualityCounts.set(name, (movieQualityCounts.get(name) ?? 0) + 1);
  }
  const moviesBreakdown = Array.from(movieQualityCounts.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);

  return {
    books: booksBreakdown,
    shows: showsBreakdown,
    movies: moviesBreakdown,
  } satisfies QualityBreakdown;
});

export type StorageStat = {
  contentType: string;
  totalSize: number;
};

export type DashboardStorage = {
  byContentType: StorageStat[];
  totalUsed: number;
  totalCapacity: number;
  rootFolderCount: number;
};

export const getDashboardStorageStatsFn = createServerFn({
  method: "GET",
}).handler(async () => {
  await requireAuth();

  const bookSize =
    db
      .select({ total: sql<number>`coalesce(sum(${bookFiles.size}), 0)` })
      .from(bookFiles)
      .get()?.total ?? 0;

  const episodeSize =
    db
      .select({ total: sql<number>`coalesce(sum(${episodeFiles.size}), 0)` })
      .from(episodeFiles)
      .get()?.total ?? 0;

  const movieSize =
    db
      .select({ total: sql<number>`coalesce(sum(${movieFiles.size}), 0)` })
      .from(movieFiles)
      .get()?.total ?? 0;

  const diskEntries = getDiskSpace();
  const totalCapacity = diskEntries.reduce((sum, e) => sum + e.totalSpace, 0);

  return {
    byContentType: [
      { contentType: "Books", totalSize: bookSize },
      { contentType: "TV Shows", totalSize: episodeSize },
      { contentType: "Movies", totalSize: movieSize },
    ],
    totalUsed: bookSize + episodeSize + movieSize,
    totalCapacity,
    rootFolderCount: diskEntries.length,
  } satisfies DashboardStorage;
});

export type RecentActivityItem = {
  id: number;
  eventType: string;
  itemName: string | null;
  contentType: string;
  date: number;
};

export const getDashboardRecentActivityFn = createServerFn({
  method: "GET",
}).handler(async () => {
  await requireAuth();

  const items = db
    .select({
      id: history.id,
      eventType: history.eventType,
      bookTitle: books.title,
      movieTitle: movies.title,
      date: history.date,
      bookId: history.bookId,
      movieId: history.movieId,
      showId: history.showId,
      episodeId: history.episodeId,
    })
    .from(history)
    .leftJoin(books, eq(history.bookId, books.id))
    .leftJoin(movies, eq(history.movieId, movies.id))
    .orderBy(desc(history.date))
    .limit(5)
    .all();

  return items.map((item) => {
    let contentType = "Books";
    let itemName = item.bookTitle;
    if (item.movieId) {
      contentType = "Movies";
      itemName = item.movieTitle;
    } else if (item.showId || item.episodeId) {
      contentType = "TV Shows";
      itemName = null; // show/episode name would need extra join
    }
    return {
      id: item.id,
      eventType: item.eventType,
      itemName,
      contentType,
      date: item.date,
    } satisfies RecentActivityItem;
  });
});
```

- [ ] **Step 2: Export `getDiskSpace` from system-status**

The `getDiskSpace` function in `src/server/system-status.ts` is currently private. We need to export it so the storage stats function can use it. In `src/server/system-status.ts`, change line 126:

```typescript
function getDiskSpace(): DiskSpaceEntry[] {
```

To:

```typescript
export function getDiskSpace(): DiskSpaceEntry[] {
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `bunx tsc --noEmit`
Expected: No errors related to dashboard.ts

- [ ] **Step 4: Commit**

```bash
git add src/server/dashboard.ts src/server/system-status.ts
git commit -m "feat: add dashboard server functions for content stats, quality, storage, and activity"
```

---

### Task 4: Dashboard Query Keys and Query Wrappers

**Files:**
- Modify: `src/lib/query-keys.ts`
- Create: `src/lib/queries/dashboard.ts`
- Modify: `src/lib/queries/index.ts`

- [ ] **Step 1: Expand dashboard query keys**

In `src/lib/query-keys.ts`, replace the dashboard section (lines 120-123):

```typescript
// ─── Dashboard ──────────────────────────────────────────────────────────
dashboard: {
  all: ["dashboard"] as const,
},
```

With:

```typescript
// ─── Dashboard ──────────────────────────────────────────────────────────
dashboard: {
  all: ["dashboard"] as const,
  contentStats: () => [...queryKeys.dashboard.all, "contentStats"] as const,
  qualityBreakdown: () =>
    [...queryKeys.dashboard.all, "qualityBreakdown"] as const,
  storage: () => [...queryKeys.dashboard.all, "storage"] as const,
  recentActivity: () =>
    [...queryKeys.dashboard.all, "recentActivity"] as const,
},
```

- [ ] **Step 2: Create dashboard query wrappers**

Create `src/lib/queries/dashboard.ts`:

```typescript
import { queryOptions } from "@tanstack/react-query";
import {
  getDashboardContentStatsFn,
  getDashboardQualityBreakdownFn,
  getDashboardRecentActivityFn,
  getDashboardStorageStatsFn,
} from "src/server/dashboard";
import { queryKeys } from "../query-keys";

export type {
  ContentTypeStats,
  DashboardStorage,
  QualityBreakdown,
  QualityBreakdownItem,
  RecentActivityItem,
  StorageStat,
} from "src/server/dashboard";

export const dashboardContentStatsQuery = () =>
  queryOptions({
    queryKey: queryKeys.dashboard.contentStats(),
    queryFn: () => getDashboardContentStatsFn(),
  });

export const dashboardQualityBreakdownQuery = () =>
  queryOptions({
    queryKey: queryKeys.dashboard.qualityBreakdown(),
    queryFn: () => getDashboardQualityBreakdownFn(),
  });

export const dashboardStorageQuery = () =>
  queryOptions({
    queryKey: queryKeys.dashboard.storage(),
    queryFn: () => getDashboardStorageStatsFn(),
  });

export const dashboardRecentActivityQuery = () =>
  queryOptions({
    queryKey: queryKeys.dashboard.recentActivity(),
    queryFn: () => getDashboardRecentActivityFn(),
  });
```

- [ ] **Step 3: Add dashboard export to queries barrel**

In `src/lib/queries/index.ts`, add after the `"./books"` export:

```typescript
export * from "./dashboard";
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `bunx tsc --noEmit`
Expected: No errors related to dashboard queries.

- [ ] **Step 5: Commit**

```bash
git add src/lib/query-keys.ts src/lib/queries/dashboard.ts src/lib/queries/index.ts
git commit -m "feat: add dashboard query keys and query wrappers"
```

---

### Task 5: Summary Row Component

**Files:**
- Create: `src/components/dashboard/summary-row.tsx`

- [ ] **Step 1: Create the summary row component**

Create `src/components/dashboard/summary-row.tsx`:

```tsx
import { useSuspenseQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  dashboardContentStatsQuery,
  dashboardStorageQuery,
} from "src/lib/queries";
import { systemStatusQuery } from "src/lib/queries/system-status";
import { Card, CardContent } from "src/components/ui/card";

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB", "PB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / 1024 ** i).toFixed(i > 2 ? 1 : 0)} ${units[i]}`;
}

export default function SummaryRow() {
  const { data: contentStats } = useSuspenseQuery(
    dashboardContentStatsQuery(),
  );
  const { data: storage } = useSuspenseQuery(dashboardStorageQuery());
  const { data: systemStatus } = useSuspenseQuery(systemStatusQuery());

  const totalItems =
    contentStats.books.total +
    contentStats.shows.total +
    contentStats.movies.total;
  const totalFiles =
    contentStats.books.fileCount +
    contentStats.shows.fileCount +
    contentStats.movies.fileCount;

  const healthIssueCount = systemStatus.health.length;
  const hasIssues = healthIssueCount > 0;

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
      <Card>
        <CardContent className="p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Total Items
          </p>
          <p className="mt-2 text-3xl font-bold">{totalItems}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {contentStats.books.total} books &middot;{" "}
            {contentStats.shows.total} shows &middot;{" "}
            {contentStats.movies.total} movies
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Files on Disk
          </p>
          <p className="mt-2 text-3xl font-bold">{totalFiles}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {contentStats.books.fileCount} ebooks &middot;{" "}
            {contentStats.shows.fileCount} episodes &middot;{" "}
            {contentStats.movies.fileCount} movies
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Disk Usage
          </p>
          <p className="mt-2 text-3xl font-bold">
            {formatBytes(storage.totalUsed)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {storage.totalCapacity > 0
              ? `of ${formatBytes(storage.totalCapacity)} across ${storage.rootFolderCount} root ${storage.rootFolderCount === 1 ? "folder" : "folders"}`
              : "No root folders configured"}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-5">
          <Link to="/system/status" className="block">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              System Health
            </p>
            <div className="mt-2 flex items-center gap-2">
              <div
                className={`h-2.5 w-2.5 rounded-full ${
                  hasIssues
                    ? "bg-yellow-500 shadow-[0_0_6px_rgba(234,179,8,0.4)]"
                    : "bg-green-500 shadow-[0_0_6px_rgba(34,197,94,0.4)]"
                }`}
              />
              <span className="text-sm font-medium">
                {hasIssues
                  ? `${healthIssueCount} ${healthIssueCount === 1 ? "issue" : "issues"} detected`
                  : "All systems healthy"}
              </span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              View details &rarr;
            </p>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/dashboard/summary-row.tsx
git commit -m "feat: add dashboard summary row component"
```

---

### Task 6: Content Type Card Component

**Files:**
- Create: `src/components/dashboard/content-type-card.tsx`

- [ ] **Step 1: Create the content type card component**

Create `src/components/dashboard/content-type-card.tsx`:

```tsx
import { Link } from "@tanstack/react-router";
import { BookOpen, Film, Search, Tv } from "lucide-react";
import type { ComponentType, JSX } from "react";
import { Card, CardContent } from "src/components/ui/card";
import type {
  QualityBreakdownItem,
  RecentActivityItem,
} from "src/lib/queries";

type ContentTypeConfig = {
  key: "books" | "shows" | "movies";
  title: string;
  icon: ComponentType<{ className?: string }>;
  accentColor: string;
  accentBg: string;
  gradientFrom: string;
  gradientTo: string;
  listPath: string;
  searchPath: string;
  statLabels: [string, string, string];
};

const CONTENT_CONFIGS: ContentTypeConfig[] = [
  {
    key: "books",
    title: "Books",
    icon: BookOpen,
    accentColor: "text-indigo-400",
    accentBg: "bg-indigo-500/15",
    gradientFrom: "from-indigo-400",
    gradientTo: "to-indigo-600",
    listPath: "/books",
    searchPath: "/books/add",
    statLabels: ["Total", "Monitored", "Authors"],
  },
  {
    key: "shows",
    title: "TV Shows",
    icon: Tv,
    accentColor: "text-purple-400",
    accentBg: "bg-purple-500/15",
    gradientFrom: "from-purple-400",
    gradientTo: "to-purple-600",
    listPath: "/tv",
    searchPath: "/tv/add",
    statLabels: ["Series", "Episodes", "On Disk"],
  },
  {
    key: "movies",
    title: "Movies",
    icon: Film,
    accentColor: "text-pink-400",
    accentBg: "bg-pink-500/15",
    gradientFrom: "from-pink-400",
    gradientTo: "to-pink-600",
    listPath: "/movies",
    searchPath: "/movies/add",
    statLabels: ["Total", "On Disk", "Collections"],
  },
];

const QUALITY_COLORS = [
  "bg-green-500",
  "bg-blue-500",
  "bg-yellow-500",
  "bg-red-500",
  "bg-orange-500",
  "bg-cyan-500",
];

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB", "PB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / 1024 ** i).toFixed(i > 2 ? 1 : 0)} ${units[i]}`;
}

function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

type ContentTypeCardProps = {
  config: ContentTypeConfig;
  stats: {
    total: number;
    monitored: number;
    fileCount: number;
    extra: { label: string; value: number };
  };
  qualityBreakdown: QualityBreakdownItem[];
  storageBytes: number;
  storageTotalBytes: number;
  recentItems: RecentActivityItem[];
};

function ContentTypeCardInner({
  config,
  stats,
  qualityBreakdown,
  storageBytes,
  storageTotalBytes,
  recentItems,
}: ContentTypeCardProps): JSX.Element {
  const isEmpty = stats.total === 0;
  const Icon = config.icon;

  const statValues =
    config.key === "books"
      ? [stats.total, stats.monitored, stats.extra.value]
      : config.key === "shows"
        ? [stats.total, stats.extra.value, stats.fileCount]
        : [stats.total, stats.fileCount, stats.extra.value];

  if (isEmpty) {
    return (
      <Card className="border-dashed opacity-50">
        <CardContent className="p-6">
          <div className="flex items-center gap-3">
            <div className={`rounded-lg p-2 ${config.accentBg}`}>
              <Icon className={`h-5 w-5 ${config.accentColor}`} />
            </div>
            <h3 className="text-lg font-semibold">{config.title}</h3>
          </div>
          <div className="mt-8 flex flex-col items-center text-center">
            <p className="text-sm text-muted-foreground">
              No {config.title.toLowerCase()} in your library yet.
              <br />
              Search for {config.title.toLowerCase()} to get started.
            </p>
            <Link
              to={config.searchPath}
              className="mt-4 inline-flex items-center gap-2 rounded-md border border-border bg-background px-4 py-2 text-sm hover:bg-accent"
            >
              <Search className="h-4 w-4" />
              Search {config.title} &rarr;
            </Link>
          </div>
        </CardContent>
      </Card>
    );
  }

  const totalQualityFiles = qualityBreakdown.reduce(
    (sum, q) => sum + q.count,
    0,
  );
  const storagePercent =
    storageTotalBytes > 0
      ? Math.min((storageBytes / storageTotalBytes) * 100, 100)
      : 0;

  return (
    <Card>
      <CardContent className="p-6">
        {/* Header */}
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`rounded-lg p-2 ${config.accentBg}`}>
              <Icon className={`h-5 w-5 ${config.accentColor}`} />
            </div>
            <h3 className="text-lg font-semibold">{config.title}</h3>
          </div>
          <Link
            to={config.listPath}
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            View all &rarr;
          </Link>
        </div>

        {/* Counts Row */}
        <div className="mb-4 grid grid-cols-3 gap-3">
          {config.statLabels.map((label, i) => (
            <div key={label}>
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                {label}
              </p>
              <p className="mt-0.5 text-xl font-semibold">{statValues[i]}</p>
            </div>
          ))}
        </div>

        {/* Quality Breakdown */}
        {qualityBreakdown.length > 0 && (
          <div className="mb-3.5">
            <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Quality Breakdown
            </p>
            <div className="flex h-2 overflow-hidden rounded-full bg-muted">
              {qualityBreakdown.map((q, i) => (
                <div
                  key={q.name}
                  className={QUALITY_COLORS[i % QUALITY_COLORS.length]}
                  style={{
                    width: `${(q.count / totalQualityFiles) * 100}%`,
                  }}
                />
              ))}
            </div>
            <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5">
              {qualityBreakdown.map((q, i) => (
                <div
                  key={q.name}
                  className="flex items-center gap-1 text-[11px] text-muted-foreground"
                >
                  <div
                    className={`h-1.5 w-1.5 rounded-full ${QUALITY_COLORS[i % QUALITY_COLORS.length]}`}
                  />
                  {q.name} (
                  {Math.round((q.count / totalQualityFiles) * 100)}%)
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Storage Bar */}
        {storageBytes > 0 && (
          <div className="mb-3.5">
            <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Storage
            </p>
            <div className="flex items-center gap-3">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                <div
                  className={`h-full rounded-full bg-gradient-to-r ${config.gradientFrom} ${config.gradientTo}`}
                  style={{ width: `${storagePercent}%` }}
                />
              </div>
              <span className="shrink-0 text-xs text-muted-foreground">
                {formatBytes(storageBytes)}
                {storageTotalBytes > 0 &&
                  ` / ${formatBytes(storageTotalBytes)}`}
              </span>
            </div>
          </div>
        )}

        {/* Recent Items */}
        {recentItems.length > 0 && (
          <div>
            <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Recently Added
            </p>
            {recentItems.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between border-b border-border/50 py-1.5 last:border-0"
              >
                <span className="truncate text-sm text-muted-foreground">
                  {item.itemName ?? "Unknown"}
                </span>
                <span className="shrink-0 text-[11px] text-muted-foreground/60">
                  {formatRelativeTime(item.date)}
                </span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export { CONTENT_CONFIGS };
export default ContentTypeCardInner;
```

- [ ] **Step 2: Commit**

```bash
git add src/components/dashboard/content-type-card.tsx
git commit -m "feat: add dashboard content type card component"
```

---

### Task 7: Activity Feed Component

**Files:**
- Create: `src/components/dashboard/activity-feed.tsx`

- [ ] **Step 1: Create the activity feed component**

Create `src/components/dashboard/activity-feed.tsx`:

```tsx
import { useSuspenseQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { dashboardRecentActivityQuery } from "src/lib/queries";
import { Card, CardContent } from "src/components/ui/card";

const EVENT_TYPE_STYLES: Record<string, { color: string; label: string }> = {
  bookAdded: { color: "bg-green-500", label: "added" },
  authorAdded: { color: "bg-green-500", label: "added" },
  movieAdded: { color: "bg-green-500", label: "added" },
  showAdded: { color: "bg-green-500", label: "added" },
  episodeAdded: { color: "bg-green-500", label: "added" },
  bookFileImported: { color: "bg-blue-500", label: "imported" },
  episodeFileImported: { color: "bg-blue-500", label: "imported" },
  movieFileImported: { color: "bg-blue-500", label: "imported" },
  grabbed: { color: "bg-blue-500", label: "grabbed" },
  downloadImported: { color: "bg-blue-500", label: "downloaded" },
  bookUpdated: { color: "bg-yellow-500", label: "updated" },
  movieUpdated: { color: "bg-yellow-500", label: "updated" },
  bookDeleted: { color: "bg-red-500", label: "deleted" },
  movieDeleted: { color: "bg-red-500", label: "deleted" },
};

function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function ActivityFeed() {
  const { data: activity } = useSuspenseQuery(
    dashboardRecentActivityQuery(),
  );

  if (activity.length === 0) {
    return null;
  }

  return (
    <div>
      <h2 className="mb-4 text-base font-semibold text-muted-foreground">
        Recent Activity
      </h2>
      <Card>
        <CardContent className="p-5">
          {activity.map((item, i) => {
            const style = EVENT_TYPE_STYLES[item.eventType] ?? {
              color: "bg-muted-foreground",
              label: item.eventType,
            };
            return (
              <div
                key={item.id}
                className={`flex items-start gap-3 py-2.5 ${
                  i < activity.length - 1 ? "border-b border-border/50" : ""
                }`}
              >
                <div
                  className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${style.color}`}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm">
                    <span className="font-medium">
                      {item.itemName ?? "Unknown item"}
                    </span>{" "}
                    <span className="text-muted-foreground">
                      was {style.label}
                    </span>
                  </p>
                  <p className="text-[11px] text-muted-foreground/60">
                    {formatRelativeTime(item.date)} &middot; {item.contentType}
                  </p>
                </div>
              </div>
            );
          })}
          <div className="pt-3 text-center">
            <Link
              to="/activity/history"
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              View all activity &rarr;
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/dashboard/activity-feed.tsx
git commit -m "feat: add dashboard activity feed component"
```

---

### Task 8: Dashboard Route Page

**Files:**
- Modify: `src/routes/_authed/index.tsx`

- [ ] **Step 1: Replace the redirect with the dashboard page**

Replace the entire content of `src/routes/_authed/index.tsx`:

```tsx
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import PageHeader from "src/components/shared/page-header";
import ActivityFeed from "src/components/dashboard/activity-feed";
import ContentTypeCardInner, {
  CONTENT_CONFIGS,
} from "src/components/dashboard/content-type-card";
import SummaryRow from "src/components/dashboard/summary-row";
import {
  dashboardContentStatsQuery,
  dashboardQualityBreakdownQuery,
  dashboardRecentActivityQuery,
  dashboardStorageQuery,
} from "src/lib/queries";
import { systemStatusQuery } from "src/lib/queries/system-status";

export const Route = createFileRoute("/_authed/")({
  beforeLoad: async ({ context }) => {
    const role = context.session?.user?.role;
    if (role === "requester") {
      throw redirect({ to: "/requests" });
    }
  },
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(dashboardContentStatsQuery()),
      context.queryClient.ensureQueryData(dashboardQualityBreakdownQuery()),
      context.queryClient.ensureQueryData(dashboardStorageQuery()),
      context.queryClient.ensureQueryData(dashboardRecentActivityQuery()),
      context.queryClient.ensureQueryData(systemStatusQuery()),
    ]);
  },
  component: DashboardPage,
});

function DashboardPage() {
  const { data: contentStats } = useSuspenseQuery(
    dashboardContentStatsQuery(),
  );
  const { data: qualityBreakdown } = useSuspenseQuery(
    dashboardQualityBreakdownQuery(),
  );
  const { data: storage } = useSuspenseQuery(dashboardStorageQuery());
  const { data: activity } = useSuspenseQuery(
    dashboardRecentActivityQuery(),
  );

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Overview of your library"
      />

      <div className="space-y-8">
        <SummaryRow />

        <div>
          <h2 className="mb-4 text-base font-semibold text-muted-foreground">
            Content Library
          </h2>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {CONTENT_CONFIGS.map((config) => {
              const stats = contentStats[config.key];
              const quality = qualityBreakdown[config.key];
              const storageStat = storage.byContentType.find(
                (s) => s.contentType === config.title,
              );
              const recentItems = activity.filter(
                (a) => a.contentType === config.title,
              );
              return (
                <ContentTypeCardInner
                  key={config.key}
                  config={config}
                  stats={stats}
                  qualityBreakdown={quality}
                  storageBytes={storageStat?.totalSize ?? 0}
                  storageTotalBytes={storage.totalCapacity}
                  recentItems={recentItems.slice(0, 3)}
                />
              );
            })}
          </div>
        </div>

        <ActivityFeed />
      </div>
    </>
  );
}
```

- [ ] **Step 2: Update sidebar logo link**

In `src/components/layout/app-sidebar.tsx`, the logo link currently points to `/books` (line 175). Update it to point to `/`:

Change:
```tsx
<Link to="/books" className="flex items-center gap-2">
```

To:
```tsx
<Link to="/" className="flex items-center gap-2">
```

- [ ] **Step 3: Verify the dev server starts and dashboard loads**

Run: `bun run dev`
Navigate to `http://localhost:3000/` — the dashboard should render with all sections.

- [ ] **Step 4: Commit**

```bash
git add src/routes/_authed/index.tsx src/components/layout/app-sidebar.tsx
git commit -m "feat: add home dashboard page replacing redirect to /books"
```

---

### Task 9: Final Verification

- [ ] **Step 1: Verify all routes work**

Test these routes manually in the browser:
- `/` — should show dashboard
- `/unmapped-files` — should show unmapped files page
- `/books` — should still work
- `/system/status` — should show unmapped files health check if any exist
- Sidebar "Library" group should expand to show "Unmapped Files"
- Clicking the Allstarr logo should go to dashboard

- [ ] **Step 2: Verify TypeScript compiles clean**

Run: `bunx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Run the dev build**

Run: `bun run build`
Expected: Build succeeds with no errors.

- [ ] **Step 4: Commit any remaining fixes**

If any issues were found and fixed, commit them:

```bash
git add -A
git commit -m "fix: address dashboard integration issues"
```
