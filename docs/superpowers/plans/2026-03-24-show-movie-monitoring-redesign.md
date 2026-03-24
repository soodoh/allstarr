# Show & Movie Page Monitoring Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace boolean monitoring fields with per-profile monitoring via junction tables, and redesign show/movie detail page UI to match the author/book page patterns.

**Architecture:** New `episodeDownloadProfiles` junction table replaces `episodes.monitored`, `seasons.monitored`, `shows.monitored`, and `movies.monitored` booleans. Existing `ProfileToggleIcons` component gains a partial state. Shared `UnmonitorDialog` replaces book-specific version. UI changes propagate through header, season accordion, and episode row components.

**Tech Stack:** SQLite + Drizzle ORM, TanStack Start server functions, React + TanStack Query, shadcn/ui

**Spec:** `docs/superpowers/specs/2026-03-24-show-movie-monitoring-redesign-design.md`

---

## File Structure

### New Files

| File                                         | Responsibility                           |
| -------------------------------------------- | ---------------------------------------- |
| `src/db/schema/episode-download-profiles.ts` | Junction table schema                    |
| `src/hooks/mutations/episode-profiles.ts`    | Episode monitor/unmonitor mutation hooks |

### Modified Files

| File                                                  | Changes                                                                                                                      |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `src/db/schema/shows.ts`                              | Remove `monitored` from shows, seasons, episodes                                                                             |
| `src/db/schema/movies.ts`                             | Remove `monitored` from movies                                                                                               |
| `src/db/schema/index.ts`                              | Export new schema                                                                                                            |
| `src/lib/tmdb-validators.ts`                          | Remove `monitored` from update schemas, add episode profile schemas                                                          |
| `src/server/shows.ts`                                 | Rewrite `applyMonitoringOption`, update `getShowDetailFn`, `updateShowFn`, `addShowFn`; add episode profile server functions |
| `src/server/movies.ts`                                | Update `updateMovieFn`, `getMovieDetailFn`                                                                                   |
| `src/hooks/mutations/shows.ts`                        | Update `useUpdateShow` type                                                                                                  |
| `src/hooks/mutations/movies.ts`                       | Update `useUpdateMovie` type                                                                                                 |
| `src/components/shared/profile-toggle-icons.tsx`      | Add `partialProfileIds` prop and partial visual state                                                                        |
| `src/components/shared/unmonitor-dialog.tsx`          | New generalized version (move from books)                                                                                    |
| `src/components/bookshelf/books/unmonitor-dialog.tsx` | Replace with re-export from shared                                                                                           |
| `src/components/tv/show-detail-header.tsx`            | Remove monitor/profiles from details, add Edit button + profile icons                                                        |
| `src/components/tv/season-accordion.tsx`              | Replace eye icon with per-profile icons                                                                                      |
| `src/components/tv/episode-row.tsx`                   | Replace eye icon with per-profile icons                                                                                      |
| `src/components/movies/movie-detail-header.tsx`       | Remove monitor/profiles from details, add Edit button + profile icons                                                        |
| `src/routes/_authed/tv/series/$showId.tsx`            | Pass download profiles to SeasonAccordion                                                                                    |
| `src/routes/_authed/bookshelf/authors/$authorId.tsx`  | Update UnmonitorDialog import path                                                                                           |
| `src/routes/_authed/bookshelf/books/$bookId.tsx`      | Update UnmonitorDialog import path                                                                                           |
| `src/routes/_authed/bookshelf/books/index.tsx`        | Update UnmonitorDialog import path                                                                                           |
| `src/components/tv/show-card.tsx`                     | Remove `monitored` from type                                                                                                 |
| `src/components/tv/show-table.tsx`                    | Remove `monitored` from type and rendering                                                                                   |
| `src/components/tv/show-bulk-bar.tsx`                 | Remove monitored dropdown from bulk actions                                                                                  |
| `src/components/movies/movie-card.tsx`                | Remove `monitored` from type                                                                                                 |
| `src/components/movies/movie-table.tsx`               | Remove `monitored` from type and rendering                                                                                   |
| `src/components/movies/movie-bulk-bar.tsx`            | Remove monitored dropdown from bulk actions                                                                                  |

---

### Task 1: Create `episodeDownloadProfiles` Schema

**Files:**

- Create: `src/db/schema/episode-download-profiles.ts`
- Modify: `src/db/schema/index.ts`

- [ ] **Step 1: Create the junction table schema**

```typescript
// src/db/schema/episode-download-profiles.ts
import { sqliteTable, integer, unique } from "drizzle-orm/sqlite-core";
import { episodes } from "./shows";
import { downloadProfiles } from "./download-profiles";

export const episodeDownloadProfiles = sqliteTable(
  "episode_download_profiles",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    episodeId: integer("episode_id")
      .notNull()
      .references(() => episodes.id, { onDelete: "cascade" }),
    downloadProfileId: integer("download_profile_id")
      .notNull()
      .references(() => downloadProfiles.id, { onDelete: "cascade" }),
  },
  (t) => [unique().on(t.episodeId, t.downloadProfileId)],
);
```

- [ ] **Step 2: Export from schema barrel**

In `src/db/schema/index.ts`, add after the `show-download-profiles` export (line 14):

```typescript
export * from "./episode-download-profiles";
```

- [ ] **Step 3: Verify build**

Run: `bun run build`
Expected: Build succeeds (table not yet in DB, but schema compiles)

- [ ] **Step 4: Commit**

```bash
git add src/db/schema/episode-download-profiles.ts src/db/schema/index.ts
git commit -m "feat: add episodeDownloadProfiles junction table schema"
```

---

### Task 2: Remove `monitored` Columns from Schemas

**Files:**

- Modify: `src/db/schema/shows.ts:21,41,66`
- Modify: `src/db/schema/movies.ts:20`

- [ ] **Step 1: Remove `monitored` from shows table**

In `src/db/schema/shows.ts`, delete line 21:

```typescript
    monitored: integer("monitored", { mode: "boolean" }).default(true),
```

- [ ] **Step 2: Remove `monitored` from seasons table**

In `src/db/schema/shows.ts`, delete line 41:

```typescript
    monitored: integer("monitored", { mode: "boolean" }).default(true),
```

- [ ] **Step 3: Remove `monitored` from episodes table**

In `src/db/schema/shows.ts`, delete line 66:

```typescript
    monitored: integer("monitored", { mode: "boolean" }).default(true),
```

- [ ] **Step 4: Remove `monitored` from movies table**

In `src/db/schema/movies.ts`, delete line 20:

```typescript
    monitored: integer("monitored", { mode: "boolean" }).default(true),
```

- [ ] **Step 5: Commit** (build will fail at this point — TypeScript refs to `.monitored` still exist; that's expected and fixed in subsequent tasks)

```bash
git add src/db/schema/shows.ts src/db/schema/movies.ts
git commit -m "refactor: remove monitored boolean columns from shows, seasons, episodes, movies schemas"
```

---

### Task 3: Update Validators

**Files:**

- Modify: `src/lib/tmdb-validators.ts`

- [ ] **Step 1: Remove `monitored` from `updateShowSchema`**

In `src/lib/tmdb-validators.ts`, change `updateShowSchema` (lines 18-23) to:

```typescript
export const updateShowSchema = z.object({
  id: z.number(),
  seriesType: z.enum(["standard", "daily", "anime"]).optional(),
  downloadProfileIds: z.array(z.number()).optional(),
});
```

- [ ] **Step 2: Remove `monitored` from `updateMovieSchema`**

Change `updateMovieSchema` (lines 38-45) to:

```typescript
export const updateMovieSchema = z.object({
  id: z.number(),
  minimumAvailability: z
    .enum(["announced", "inCinemas", "released"])
    .optional(),
  downloadProfileIds: z.array(z.number()).optional(),
});
```

- [ ] **Step 3: Add episode profile schemas**

Add at end of `src/lib/tmdb-validators.ts`:

```typescript
export const monitorEpisodeProfileSchema = z.object({
  episodeId: z.number(),
  downloadProfileId: z.number(),
});

export const unmonitorEpisodeProfileSchema = z.object({
  episodeId: z.number(),
  downloadProfileId: z.number(),
  deleteFiles: z.boolean(),
});

export const bulkMonitorEpisodeProfileSchema = z.object({
  episodeIds: z.array(z.number()),
  downloadProfileId: z.number(),
});

export const bulkUnmonitorEpisodeProfileSchema = z.object({
  episodeIds: z.array(z.number()),
  downloadProfileId: z.number(),
  deleteFiles: z.boolean(),
});
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/tmdb-validators.ts
git commit -m "refactor: update validators — remove monitored, add episode profile schemas"
```

---

### Task 4: Update Server Functions — Shows

**Files:**

- Modify: `src/server/shows.ts`

This is the largest task. It updates `applyMonitoringOption`, `addShowFn`, `getShowDetailFn`, `updateShowFn`, and adds episode profile server functions.

- [ ] **Step 1: Add imports**

At the top of `src/server/shows.ts`, add to the schema import:

```typescript
import { episodeDownloadProfiles } from "src/db/schema";
```

Add the new validators to the import from `src/lib/tmdb-validators`:

```typescript
import {
  addShowSchema,
  updateShowSchema,
  deleteShowSchema,
  monitorEpisodeProfileSchema,
  unmonitorEpisodeProfileSchema,
  bulkMonitorEpisodeProfileSchema,
  bulkUnmonitorEpisodeProfileSchema,
} from "src/lib/tmdb-validators";
```

- [ ] **Step 2: Rewrite `applyMonitoringOption`**

The function now inserts `episodeDownloadProfiles` rows for matched episodes instead of flipping a boolean. It receives `downloadProfileIds` as a third argument.

Replace the existing `applyMonitoringOption` function (lines 64-127) and helper functions `applyPilotMonitoring` (lines 129-153) and `applySeasonMonitoring` (lines 155-176) with:

```typescript
function applyMonitoringOption(
  showId: number,
  option: MonitorOption,
  downloadProfileIds: number[],
): void {
  if (downloadProfileIds.length === 0) return;

  const today = new Date().toISOString().split("T")[0];

  // Get all episode IDs for the show
  const allEpisodes = db
    .select({
      id: episodes.id,
      seasonId: episodes.seasonId,
      episodeNumber: episodes.episodeNumber,
      airDate: episodes.airDate,
      hasFile: episodes.hasFile,
    })
    .from(episodes)
    .where(eq(episodes.showId, showId))
    .all();

  let monitoredEpisodeIds: number[];

  switch (option) {
    case "all": {
      monitoredEpisodeIds = allEpisodes.map((ep) => ep.id);
      break;
    }
    case "future": {
      monitoredEpisodeIds = allEpisodes
        .filter((ep) => ep.airDate && ep.airDate > today)
        .map((ep) => ep.id);
      break;
    }
    case "missing": {
      monitoredEpisodeIds = allEpisodes
        .filter((ep) => !ep.hasFile)
        .map((ep) => ep.id);
      break;
    }
    case "existing": {
      monitoredEpisodeIds = allEpisodes
        .filter((ep) => ep.hasFile)
        .map((ep) => ep.id);
      break;
    }
    case "pilot": {
      const season1Ids = db
        .select({ id: seasons.id })
        .from(seasons)
        .where(and(eq(seasons.showId, showId), eq(seasons.seasonNumber, 1)))
        .all()
        .map((s) => s.id);
      monitoredEpisodeIds = allEpisodes
        .filter(
          (ep) => season1Ids.includes(ep.seasonId) && ep.episodeNumber === 1,
        )
        .map((ep) => ep.id);
      break;
    }
    case "firstSeason": {
      const season1Ids = db
        .select({ id: seasons.id })
        .from(seasons)
        .where(and(eq(seasons.showId, showId), eq(seasons.seasonNumber, 1)))
        .all()
        .map((s) => s.id);
      monitoredEpisodeIds = allEpisodes
        .filter((ep) => season1Ids.includes(ep.seasonId))
        .map((ep) => ep.id);
      break;
    }
    case "lastSeason": {
      const maxSeasonRow = db
        .select({ maxNum: max(seasons.seasonNumber) })
        .from(seasons)
        .where(eq(seasons.showId, showId))
        .get();
      const lastSeasonNum = maxSeasonRow?.maxNum ?? 0;
      const lastSeasonIds = db
        .select({ id: seasons.id })
        .from(seasons)
        .where(
          and(
            eq(seasons.showId, showId),
            eq(seasons.seasonNumber, lastSeasonNum),
          ),
        )
        .all()
        .map((s) => s.id);
      monitoredEpisodeIds = allEpisodes
        .filter((ep) => lastSeasonIds.includes(ep.seasonId))
        .map((ep) => ep.id);
      break;
    }
    case "none": {
      monitoredEpisodeIds = [];
      break;
    }
    default: {
      monitoredEpisodeIds = [];
      break;
    }
  }

  // Insert episodeDownloadProfiles rows for monitored episodes
  for (const episodeId of monitoredEpisodeIds) {
    for (const profileId of downloadProfileIds) {
      db.insert(episodeDownloadProfiles)
        .values({ episodeId, downloadProfileId: profileId })
        .onConflictDoNothing()
        .run();
    }
  }
}
```

Delete the `applyPilotMonitoring` and `applySeasonMonitoring` helper functions (they are inlined above).

- [ ] **Step 3: Update `addShowFn`**

In the `addShowFn` handler:

1. Remove `monitored: true` from the `db.insert(shows).values(...)` call (line 229).
2. Remove `monitored: true` from the `db.insert(seasons).values(...)` call (line 252).
3. Remove `monitored: true` from the episode insert values (line 273).
4. Update the `applyMonitoringOption` call (line 281) to pass `downloadProfileIds`:

```typescript
applyMonitoringOption(show.id, data.monitorOption, data.downloadProfileIds);
```

- [ ] **Step 4: Update `getShowDetailFn`**

In `getShowDetailFn` (lines 335-391), after fetching episodes, also fetch episode download profile links and include them in the response.

Add after the `showEpisodes` query (around line 360):

```typescript
// Get episode download profile IDs
const episodeProfileLinks = db
  .select({
    episodeId: episodeDownloadProfiles.episodeId,
    downloadProfileId: episodeDownloadProfiles.downloadProfileId,
  })
  .from(episodeDownloadProfiles)
  .where(
    inArray(
      episodeDownloadProfiles.episodeId,
      showEpisodes.map((ep) => ep.id),
    ),
  )
  .all();

// Group profile IDs by episode
const profilesByEpisode = new Map<number, number[]>();
for (const link of episodeProfileLinks) {
  const arr = profilesByEpisode.get(link.episodeId) ?? [];
  arr.push(link.downloadProfileId);
  profilesByEpisode.set(link.episodeId, arr);
}
```

Ensure `inArray` is imported from `drizzle-orm` at the top of the file.

Then update the episode mapping in `episodesBySeasonId` to include `downloadProfileIds`:

Change the episode grouping loop to attach profile IDs:

```typescript
// Attach downloadProfileIds to each episode
const episodesWithProfiles = showEpisodes.map((ep) => ({
  ...ep,
  downloadProfileIds: profilesByEpisode.get(ep.id) ?? [],
}));

// Group episodes by season
const episodesBySeasonId = new Map<number, typeof episodesWithProfiles>();
for (const ep of episodesWithProfiles) {
  const arr = episodesBySeasonId.get(ep.seasonId) ?? [];
  arr.push(ep);
  episodesBySeasonId.set(ep.seasonId, arr);
}
```

- [ ] **Step 5: Update `updateShowFn`**

In `updateShowFn` (lines 393-424):

1. Remove `monitored` from the destructured `data` (it no longer exists in the schema).
2. When `downloadProfileIds` changes, also clean up `episodeDownloadProfiles` for removed profiles.

Replace the download profiles update block (lines 411-421):

```typescript
if (downloadProfileIds !== undefined) {
  // Find which profiles were removed
  const existingProfileLinks = db
    .select({ downloadProfileId: showDownloadProfiles.downloadProfileId })
    .from(showDownloadProfiles)
    .where(eq(showDownloadProfiles.showId, id))
    .all();
  const existingProfileIds = existingProfileLinks.map(
    (l) => l.downloadProfileId,
  );
  const removedProfileIds = existingProfileIds.filter(
    (pid) => !downloadProfileIds.includes(pid),
  );

  // Delete episode download profiles for removed profiles
  if (removedProfileIds.length > 0) {
    const showEpisodeIds = db
      .select({ id: episodes.id })
      .from(episodes)
      .where(eq(episodes.showId, id))
      .all()
      .map((e) => e.id);

    if (showEpisodeIds.length > 0) {
      for (const profileId of removedProfileIds) {
        db.delete(episodeDownloadProfiles)
          .where(
            and(
              inArray(episodeDownloadProfiles.episodeId, showEpisodeIds),
              eq(episodeDownloadProfiles.downloadProfileId, profileId),
            ),
          )
          .run();
      }
    }
  }

  // Replace show download profiles
  db.delete(showDownloadProfiles)
    .where(eq(showDownloadProfiles.showId, id))
    .run();
  for (const profileId of downloadProfileIds) {
    db.insert(showDownloadProfiles)
      .values({ showId: id, downloadProfileId: profileId })
      .run();
  }
}
```

- [ ] **Step 6: Add episode profile server functions**

Add at the end of `src/server/shows.ts`:

```typescript
export const monitorEpisodeProfileFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => monitorEpisodeProfileSchema.parse(d))
  .handler(async ({ data }) => {
    await requireAuth();

    db.insert(episodeDownloadProfiles)
      .values({
        episodeId: data.episodeId,
        downloadProfileId: data.downloadProfileId,
      })
      .onConflictDoNothing()
      .run();

    return { success: true };
  });

export const unmonitorEpisodeProfileFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => unmonitorEpisodeProfileSchema.parse(d))
  .handler(async ({ data }) => {
    await requireAuth();

    db.delete(episodeDownloadProfiles)
      .where(
        and(
          eq(episodeDownloadProfiles.episodeId, data.episodeId),
          eq(episodeDownloadProfiles.downloadProfileId, data.downloadProfileId),
        ),
      )
      .run();

    // TODO: optionally delete files if data.deleteFiles — depends on episode file lookup logic

    return { success: true };
  });

export const bulkMonitorEpisodeProfileFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => bulkMonitorEpisodeProfileSchema.parse(d))
  .handler(async ({ data }) => {
    await requireAuth();

    for (const episodeId of data.episodeIds) {
      db.insert(episodeDownloadProfiles)
        .values({
          episodeId,
          downloadProfileId: data.downloadProfileId,
        })
        .onConflictDoNothing()
        .run();
    }

    return { success: true };
  });

export const bulkUnmonitorEpisodeProfileFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => bulkUnmonitorEpisodeProfileSchema.parse(d))
  .handler(async ({ data }) => {
    await requireAuth();

    if (data.episodeIds.length > 0) {
      db.delete(episodeDownloadProfiles)
        .where(
          and(
            inArray(episodeDownloadProfiles.episodeId, data.episodeIds),
            eq(
              episodeDownloadProfiles.downloadProfileId,
              data.downloadProfileId,
            ),
          ),
        )
        .run();
    }

    // TODO: optionally delete files if data.deleteFiles

    return { success: true };
  });
```

- [ ] **Step 7: Remove references to `shows.monitored` in `getShowsFn`**

In `getShowsFn` (around line 295), the `select` call references `shows.monitored`. Remove it from the select. If the query uses `select()` (select all), the column is already removed from the schema so this should work automatically. Check and fix any explicit references.

- [ ] **Step 8: Verify build**

Run: `bun run build`
Expected: May still have TypeScript errors in UI components (fixed in later tasks), but server functions should compile.

- [ ] **Step 9: Commit**

```bash
git add src/server/shows.ts src/lib/tmdb-validators.ts
git commit -m "feat: rewrite show server functions for per-profile episode monitoring"
```

---

### Task 5: Update Server Functions — Movies

**Files:**

- Modify: `src/server/movies.ts`

- [ ] **Step 1: Update `updateMovieFn`**

In `updateMovieFn` (lines 194-225), the `...updates` spread will no longer contain `monitored` since it's removed from the schema and validator. No code changes needed in the function body — the validator change from Task 3 handles it.

Verify no explicit references to `movies.monitored` remain in the file.

- [ ] **Step 2: Update `getMovieDetailFn`**

The function spreads the full movie row (`...movie`). Since `monitored` is removed from the schema, it will no longer be in the response. No code changes needed — the schema change handles it.

Verify no explicit references to `movies.monitored` remain.

- [ ] **Step 3: Remove `monitored` references from `getMoviesFn`**

Check the movie list query and remove any explicit `movies.monitored` references.

- [ ] **Step 4: Remove `monitored` references from `addMovieFn`**

The `addMovieFn` likely inserts with `monitored: true`. Remove that field from the insert values.

- [ ] **Step 5: Verify build**

Run: `bun run build`

- [ ] **Step 6: Commit**

```bash
git add src/server/movies.ts
git commit -m "refactor: remove monitored boolean from movie server functions"
```

---

### Task 6: Create Episode Profile Mutation Hooks

**Files:**

- Create: `src/hooks/mutations/episode-profiles.ts`
- Modify: `src/hooks/mutations/shows.ts`
- Modify: `src/hooks/mutations/movies.ts`

- [ ] **Step 1: Create episode profile mutation hooks**

```typescript
// src/hooks/mutations/episode-profiles.ts
// oxlint-disable explicit-module-boundary-types -- useMutation return type is complex generic
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  monitorEpisodeProfileFn,
  unmonitorEpisodeProfileFn,
  bulkMonitorEpisodeProfileFn,
  bulkUnmonitorEpisodeProfileFn,
} from "src/server/shows";
import { queryKeys } from "src/lib/query-keys";

export function useMonitorEpisodeProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { episodeId: number; downloadProfileId: number }) =>
      monitorEpisodeProfileFn({ data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.shows.all });
    },
    onError: () => toast.error("Failed to monitor episode"),
  });
}

export function useUnmonitorEpisodeProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      episodeId: number;
      downloadProfileId: number;
      deleteFiles: boolean;
    }) => unmonitorEpisodeProfileFn({ data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.shows.all });
    },
    onError: () => toast.error("Failed to unmonitor episode"),
  });
}

export function useBulkMonitorEpisodeProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { episodeIds: number[]; downloadProfileId: number }) =>
      bulkMonitorEpisodeProfileFn({ data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.shows.all });
    },
    onError: () => toast.error("Failed to monitor episodes"),
  });
}

export function useBulkUnmonitorEpisodeProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      episodeIds: number[];
      downloadProfileId: number;
      deleteFiles: boolean;
    }) => bulkUnmonitorEpisodeProfileFn({ data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.shows.all });
    },
    onError: () => toast.error("Failed to unmonitor episodes"),
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add src/hooks/mutations/episode-profiles.ts
git commit -m "feat: add episode profile monitor/unmonitor mutation hooks"
```

---

### Task 7: Generalize `UnmonitorDialog`

**Files:**

- Create: `src/components/shared/unmonitor-dialog.tsx`
- Modify: `src/components/bookshelf/books/unmonitor-dialog.tsx`
- Modify: `src/routes/_authed/bookshelf/authors/$authorId.tsx` (import path)
- Modify: `src/routes/_authed/bookshelf/books/$bookId.tsx` (import path)

- [ ] **Step 1: Create shared `UnmonitorDialog`**

```typescript
// src/components/shared/unmonitor-dialog.tsx
import { useState } from "react";
import type { JSX } from "react";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "src/components/ui/dialog";
import { Button } from "src/components/ui/button";
import Checkbox from "src/components/ui/checkbox";
import Label from "src/components/ui/label";

type UnmonitorDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profileName: string;
  itemTitle: string;
  itemType: "book" | "episode" | "season" | "show" | "movie";
  fileCount: number;
  onConfirm: (deleteFiles: boolean) => void;
  isPending: boolean;
};

export default function UnmonitorDialog({
  open,
  onOpenChange,
  profileName,
  itemTitle,
  itemType,
  fileCount,
  onConfirm,
  isPending,
}: UnmonitorDialogProps): JSX.Element {
  const [deleteFiles, setDeleteFiles] = useState(false);

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      setDeleteFiles(false);
    }
    onOpenChange(nextOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Unmonitor {profileName}?</DialogTitle>
          <DialogDescription>
            This will stop searching for {itemType} "{itemTitle}" for this
            profile.
          </DialogDescription>
        </DialogHeader>

        {fileCount > 0 && (
          <div className="flex items-center gap-2">
            <Checkbox
              id="delete-files"
              checked={deleteFiles}
              onCheckedChange={(checked) => setDeleteFiles(checked === true)}
            />
            <Label htmlFor="delete-files" className="cursor-pointer">
              Also delete {fileCount} file(s)
            </Label>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={() => onConfirm(deleteFiles)}
            disabled={isPending}
          >
            {isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
            Confirm
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Replace book-specific version with re-export**

Replace the entire content of `src/components/bookshelf/books/unmonitor-dialog.tsx` with:

```typescript
// Re-export shared UnmonitorDialog for backwards compatibility
export { default } from "src/components/shared/unmonitor-dialog";
export type { default as UnmonitorDialog } from "src/components/shared/unmonitor-dialog";
```

- [ ] **Step 3: Update book page imports to pass new props**

In the following files, find all `<UnmonitorDialog` usages and add the `itemType="book"` prop. Rename `bookTitle` to `itemTitle` in the props:

- `src/routes/_authed/bookshelf/authors/$authorId.tsx`
- `src/routes/_authed/bookshelf/books/$bookId.tsx`
- `src/routes/_authed/bookshelf/books/index.tsx`

Search for the pattern: `bookTitle={` and replace with `itemTitle={`. Add `itemType="book"` to each usage.

- [ ] **Step 4: Verify build**

Run: `bun run build`
Expected: Build succeeds. Book pages work as before.

- [ ] **Step 5: Commit**

```bash
git add src/components/shared/unmonitor-dialog.tsx src/components/bookshelf/books/unmonitor-dialog.tsx src/routes/_authed/bookshelf/authors/\$authorId.tsx src/routes/_authed/bookshelf/books/\$bookId.tsx src/routes/_authed/bookshelf/books/index.tsx
git commit -m "refactor: generalize UnmonitorDialog to shared component with itemType prop"
```

---

### Task 8: Add Partial State to `ProfileToggleIcons`

**Files:**

- Modify: `src/components/shared/profile-toggle-icons.tsx`

- [ ] **Step 1: Add `partialProfileIds` prop**

Update the type and component in `src/components/shared/profile-toggle-icons.tsx`:

Add `partialProfileIds` to the type (after line 13):

```typescript
  partialProfileIds?: number[];
```

Add to destructured props (after line 23):

```typescript
  partialProfileIds = [],
```

- [ ] **Step 2: Add partial visual state**

In the map callback, after `const active = activeProfileIds.includes(profile.id);` (line 38), add:

```typescript
const partial = partialProfileIds.includes(profile.id);
```

Update the `className` on the button (lines 58-63) to handle three states:

```typescript
                className={cn(
                  "flex shrink-0 items-center justify-center rounded transition-colors",
                  isLg ? "h-9 w-9" : "h-6 w-6",
                  active
                    ? "bg-primary/15 text-primary cursor-pointer hover:bg-destructive/15 hover:text-destructive"
                    : partial
                      ? "bg-primary/8 text-primary/45 cursor-pointer hover:bg-primary/15 hover:text-primary"
                      : "bg-muted text-muted-foreground hover:bg-primary/15 hover:text-primary cursor-pointer",
                )}
```

Update the `aria-label` (lines 53-57) to include partial state:

```typescript
                aria-label={
                  active
                    ? `Remove "${profile.name}" profile`
                    : partial
                      ? `Monitor all for "${profile.name}" profile`
                      : `Add "${profile.name}" profile`
                }
```

- [ ] **Step 3: Verify build**

Run: `bun run build`
Expected: Build succeeds. Existing book page icons unaffected (partialProfileIds defaults to empty).

- [ ] **Step 4: Commit**

```bash
git add src/components/shared/profile-toggle-icons.tsx
git commit -m "feat: add partial monitoring state to ProfileToggleIcons"
```

---

### Task 9: Refactor `MovieDetailHeader`

**Files:**

- Modify: `src/components/movies/movie-detail-header.tsx`

- [ ] **Step 1: Update imports**

Remove `Switch` import (line 13). Add `ProfileToggleIcons` import:

```typescript
import ProfileToggleIcons from "src/components/shared/profile-toggle-icons";
```

Add `UnmonitorDialog` import:

```typescript
import UnmonitorDialog from "src/components/shared/unmonitor-dialog";
```

- [ ] **Step 2: Update `MovieDetail` type**

Remove `monitored: boolean | null;` (line 39) from the `MovieDetail` type.

- [ ] **Step 3: Add unmonitor state and handlers**

Add state for unmonitor dialog (after `selectedProfileIds` state):

```typescript
const [unmonitorProfileId, setUnmonitorProfileId] = useState<number | null>(
  null,
);
```

Add handler for profile toggle:

```typescript
const handleProfileToggle = (profileId: number) => {
  if (movie.downloadProfileIds.includes(profileId)) {
    setUnmonitorProfileId(profileId);
  } else {
    updateMovie.mutate(
      {
        id: movie.id,
        downloadProfileIds: [...movie.downloadProfileIds, profileId],
      },
      { onSuccess: () => router.invalidate() },
    );
  }
};

const handleUnmonitorConfirm = (deleteFiles: boolean) => {
  if (unmonitorProfileId === null) return;
  updateMovie.mutate(
    {
      id: movie.id,
      downloadProfileIds: movie.downloadProfileIds.filter(
        (id) => id !== unmonitorProfileId,
      ),
    },
    {
      onSuccess: () => {
        setUnmonitorProfileId(null);
        router.invalidate();
      },
    },
  );
};
```

Remove `handleMonitorToggle` function (lines 153-158).

- [ ] **Step 4: Add Edit button to action bar**

In the action buttons div (after TMDB button, before Delete button), add:

```typescript
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
```

- [ ] **Step 5: Add `ProfileToggleIcons` left of title**

Replace the `<PageHeader>` block (lines 202-209) with:

```typescript
      <div className="flex items-start gap-3">
        {movie.downloadProfileIds.length > 0 && (
          <ProfileToggleIcons
            profiles={movieProfiles.filter((p) =>
              movie.downloadProfileIds.includes(p.id),
            )}
            activeProfileIds={movie.downloadProfileIds}
            onToggle={handleProfileToggle}
            isPending={updateMovie.isPending}
            size="lg"
            direction="vertical"
          />
        )}
        <div className="flex-1 min-w-0">
          <PageHeader
            title={movie.title}
            description={
              movie.year > 0
                ? `${movie.year}${movie.studio ? ` - ${movie.studio}` : ""}`
                : movie.studio || undefined
            }
          />
        </div>
      </div>
```

- [ ] **Step 6: Remove Monitored and Download Profiles from details card**

Delete the "Monitored" section (lines 280-289):

```typescript
              <div className="flex justify-between gap-4 items-center">
                <dt className="text-muted-foreground">Monitored</dt>
                ...
              </div>
```

Delete the "Download Profiles" section (lines 290-309):

```typescript
              {profileNames.length > 0 && (
                <div className="flex justify-between gap-4 items-center">
                  <dt className="text-muted-foreground">Download Profiles</dt>
                  ...
                </div>
              )}
```

Also remove the `profileNames` variable (lines 126-128) since it's no longer used.

- [ ] **Step 7: Add UnmonitorDialog**

Add before the closing `</>` (before ConfirmDialog):

```typescript
      <UnmonitorDialog
        open={unmonitorProfileId !== null}
        onOpenChange={(open) => {
          if (!open) setUnmonitorProfileId(null);
        }}
        profileName={
          movieProfiles.find((p) => p.id === unmonitorProfileId)?.name ?? ""
        }
        itemTitle={movie.title}
        itemType="movie"
        fileCount={0}
        onConfirm={handleUnmonitorConfirm}
        isPending={updateMovie.isPending}
      />
```

- [ ] **Step 8: Verify build**

Run: `bun run build`
Expected: Build succeeds.

- [ ] **Step 9: Commit**

```bash
git add src/components/movies/movie-detail-header.tsx
git commit -m "feat: refactor movie header — Edit button, profile toggle icons, remove monitored switch"
```

---

### Task 10: Refactor `ShowDetailHeader`

**Files:**

- Modify: `src/components/tv/show-detail-header.tsx`

- [ ] **Step 1: Update imports**

Remove `Switch` import (line 13). Add:

```typescript
import ProfileToggleIcons from "src/components/shared/profile-toggle-icons";
import UnmonitorDialog from "src/components/shared/unmonitor-dialog";
```

Add bulk mutation hooks:

```typescript
import {
  useBulkMonitorEpisodeProfile,
  useBulkUnmonitorEpisodeProfile,
} from "src/hooks/mutations/episode-profiles";
```

- [ ] **Step 2: Update `ShowDetail` type**

Remove `monitored: boolean | null;` (line 40).

Update the `seasons` type to include episode `downloadProfileIds`:

```typescript
seasons: Array<{
  id: number;
  seasonNumber: number;
  episodes: Array<{
    id: number;
    hasFile: boolean | null;
    downloadProfileIds: number[];
  }>;
}>;
```

- [ ] **Step 3: Add bulk monitoring state and handlers**

Add state and hooks:

```typescript
const bulkMonitor = useBulkMonitorEpisodeProfile();
const bulkUnmonitor = useBulkUnmonitorEpisodeProfile();
const [unmonitorProfileId, setUnmonitorProfileId] = useState<number | null>(
  null,
);
```

Compute aggregate monitoring state:

```typescript
const allEpisodes = show.seasons.flatMap((s) => s.episodes);

// Compute per-profile monitoring state for show level
const showActiveProfileIds = show.downloadProfileIds.filter(
  (pid) =>
    allEpisodes.length > 0 &&
    allEpisodes.every((ep) => ep.downloadProfileIds.includes(pid)),
);
const showPartialProfileIds = show.downloadProfileIds.filter(
  (pid) =>
    !showActiveProfileIds.includes(pid) &&
    allEpisodes.some((ep) => ep.downloadProfileIds.includes(pid)),
);
```

Add toggle handler:

```typescript
const handleShowProfileToggle = (profileId: number) => {
  const isActive = showActiveProfileIds.includes(profileId);
  if (isActive) {
    setUnmonitorProfileId(profileId);
  } else {
    // Monitor all episodes for this profile (covers partial + none)
    const episodeIds = allEpisodes.map((ep) => ep.id);
    bulkMonitor.mutate(
      { episodeIds, downloadProfileId: profileId },
      { onSuccess: () => router.invalidate() },
    );
  }
};

const handleShowUnmonitorConfirm = (deleteFiles: boolean) => {
  if (unmonitorProfileId === null) return;
  const episodeIds = allEpisodes.map((ep) => ep.id);
  bulkUnmonitor.mutate(
    { episodeIds, downloadProfileId: unmonitorProfileId, deleteFiles },
    {
      onSuccess: () => {
        setUnmonitorProfileId(null);
        router.invalidate();
      },
    },
  );
};
```

Remove `handleMonitorToggle` (lines 126-131).

- [ ] **Step 4: Add Edit button to action bar**

Add between TMDB and Delete buttons:

```typescript
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
```

- [ ] **Step 5: Add `ProfileToggleIcons` left of title**

Replace the `<PageHeader>` block (lines 175-182) with:

```typescript
      <div className="flex items-start gap-3">
        {show.downloadProfileIds.length > 0 && (
          <ProfileToggleIcons
            profiles={tvProfiles.filter((p) =>
              show.downloadProfileIds.includes(p.id),
            )}
            activeProfileIds={showActiveProfileIds}
            partialProfileIds={showPartialProfileIds}
            onToggle={handleShowProfileToggle}
            isPending={bulkMonitor.isPending || bulkUnmonitor.isPending}
            size="lg"
            direction="vertical"
          />
        )}
        <div className="flex-1 min-w-0">
          <PageHeader
            title={show.title}
            description={
              show.year > 0
                ? `${show.year}${show.network ? ` - ${show.network}` : ""}`
                : show.network || undefined
            }
          />
        </div>
      </div>
```

- [ ] **Step 6: Remove Monitored and Download Profiles from details card**

Delete the "Monitored" section (lines 248-257) and the "Download Profiles" section (lines 258-277). Also remove `profileNames` variable (lines 92-94).

- [ ] **Step 7: Add UnmonitorDialog**

Add before the closing `</>`:

```typescript
      <UnmonitorDialog
        open={unmonitorProfileId !== null}
        onOpenChange={(open) => {
          if (!open) setUnmonitorProfileId(null);
        }}
        profileName={
          tvProfiles.find((p) => p.id === unmonitorProfileId)?.name ?? ""
        }
        itemTitle={show.title}
        itemType="show"
        fileCount={0}
        onConfirm={handleShowUnmonitorConfirm}
        isPending={bulkUnmonitor.isPending}
      />
```

- [ ] **Step 8: Verify build**

Run: `bun run build`

- [ ] **Step 9: Commit**

```bash
git add src/components/tv/show-detail-header.tsx
git commit -m "feat: refactor show header — Edit button, profile toggle icons, remove monitored switch"
```

---

### Task 11: Refactor `SeasonAccordion`

**Files:**

- Modify: `src/components/tv/season-accordion.tsx`
- Modify: `src/routes/_authed/tv/series/$showId.tsx`

- [ ] **Step 1: Update types and props**

Replace the types and props in `season-accordion.tsx`:

```typescript
import type { JSX } from "react";
import {
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "src/components/ui/accordion";
import ProfileToggleIcons from "src/components/shared/profile-toggle-icons";
import UnmonitorDialog from "src/components/shared/unmonitor-dialog";
import EpisodeRow from "src/components/tv/episode-row";
import {
  useBulkMonitorEpisodeProfile,
  useBulkUnmonitorEpisodeProfile,
} from "src/hooks/mutations/episode-profiles";
import { useState } from "react";
import { useRouter } from "@tanstack/react-router";

type Episode = {
  id: number;
  episodeNumber: number;
  absoluteNumber: number | null;
  title: string;
  airDate: string | null;
  runtime: number | null;
  hasFile: boolean | null;
  downloadProfileIds: number[];
};

type Season = {
  id: number;
  seasonNumber: number;
  overview: string | null;
  posterUrl: string | null;
  episodes: Episode[];
};

type DownloadProfile = {
  id: number;
  name: string;
  icon: string;
};

type SeasonAccordionProps = {
  season: Season;
  seriesType: string;
  downloadProfiles: DownloadProfile[];
};
```

- [ ] **Step 2: Rewrite the component body**

```typescript
export default function SeasonAccordion({
  season,
  seriesType,
  downloadProfiles,
}: SeasonAccordionProps): JSX.Element {
  const router = useRouter();
  const bulkMonitor = useBulkMonitorEpisodeProfile();
  const bulkUnmonitor = useBulkUnmonitorEpisodeProfile();
  const [unmonitorProfileId, setUnmonitorProfileId] = useState<number | null>(null);

  const sortedEpisodes = [...season.episodes].toSorted(
    (a, b) => a.episodeNumber - b.episodeNumber,
  );

  const fileCount = sortedEpisodes.filter((ep) => ep.hasFile).length;
  const totalCount = sortedEpisodes.length;
  const seasonLabel =
    season.seasonNumber === 0 ? "Specials" : `Season ${season.seasonNumber}`;

  // Compute per-profile monitoring state for this season
  const activeProfileIds = downloadProfiles
    .filter((p) =>
      totalCount > 0 && sortedEpisodes.every((ep) => ep.downloadProfileIds.includes(p.id)),
    )
    .map((p) => p.id);

  const partialProfileIds = downloadProfiles
    .filter(
      (p) =>
        !activeProfileIds.includes(p.id) &&
        sortedEpisodes.some((ep) => ep.downloadProfileIds.includes(p.id)),
    )
    .map((p) => p.id);

  const handleSeasonProfileToggle = (profileId: number) => {
    const isActive = activeProfileIds.includes(profileId);
    if (isActive) {
      setUnmonitorProfileId(profileId);
    } else {
      const episodeIds = sortedEpisodes.map((ep) => ep.id);
      bulkMonitor.mutate(
        { episodeIds, downloadProfileId: profileId },
        { onSuccess: () => router.invalidate() },
      );
    }
  };

  const handleUnmonitorConfirm = (deleteFiles: boolean) => {
    if (unmonitorProfileId === null) return;
    const episodeIds = sortedEpisodes.map((ep) => ep.id);
    bulkUnmonitor.mutate(
      { episodeIds, downloadProfileId: unmonitorProfileId, deleteFiles },
      {
        onSuccess: () => {
          setUnmonitorProfileId(null);
          router.invalidate();
        },
      },
    );
  };

  // Color the progress based on completeness
  let progressColor = "text-muted-foreground";
  if (totalCount > 0) {
    if (fileCount === totalCount) {
      progressColor = "text-green-500";
    } else if (fileCount > 0) {
      progressColor = "text-yellow-500";
    }
  }

  return (
    <>
      <AccordionItem value={`season-${season.id}`}>
        <AccordionTrigger className="hover:no-underline px-3">
          <div className="flex flex-1 items-center gap-4">
            {downloadProfiles.length > 0 && (
              <ProfileToggleIcons
                profiles={downloadProfiles}
                activeProfileIds={activeProfileIds}
                partialProfileIds={partialProfileIds}
                onToggle={handleSeasonProfileToggle}
                isPending={bulkMonitor.isPending || bulkUnmonitor.isPending}
                size="sm"
                direction="horizontal"
              />
            )}
            <span className="font-medium">{seasonLabel}</span>
            <span className="text-muted-foreground text-xs">
              {totalCount} episode{totalCount === 1 ? "" : "s"}
            </span>
            <span className={`text-xs font-mono ${progressColor}`}>
              {fileCount}/{totalCount}
            </span>
          </div>
        </AccordionTrigger>
        <AccordionContent className="px-0 pb-0">
          {/* Column headers — no header for monitor column */}
          <div className="flex items-center gap-4 px-3 py-1.5 text-xs text-muted-foreground border-b font-medium">
            <span className="w-14 shrink-0" />
            <span className="w-20 shrink-0">#</span>
            <span className="flex-1 min-w-0">Title</span>
            <span className="w-28 shrink-0 text-right">Air Date</span>
            <span className="w-12 shrink-0 text-right">Time</span>
            <span className="w-8 shrink-0 text-center">File</span>
          </div>
          {sortedEpisodes.map((episode) => (
            <EpisodeRow
              key={episode.id}
              episode={episode}
              seriesType={seriesType}
              downloadProfiles={downloadProfiles}
            />
          ))}
        </AccordionContent>
      </AccordionItem>

      <UnmonitorDialog
        open={unmonitorProfileId !== null}
        onOpenChange={(open) => {
          if (!open) setUnmonitorProfileId(null);
        }}
        profileName={
          downloadProfiles.find((p) => p.id === unmonitorProfileId)?.name ?? ""
        }
        itemTitle={seasonLabel}
        itemType="season"
        fileCount={0}
        onConfirm={handleUnmonitorConfirm}
        isPending={bulkUnmonitor.isPending}
      />
    </>
  );
}
```

Note: the monitor column placeholder width (`w-14`) should accommodate the profile icons. Adjust based on the number of profiles (each icon is ~24px + 4px gap).

- [ ] **Step 3: Update the route to pass `downloadProfiles` to `SeasonAccordion`**

In `src/routes/_authed/tv/series/$showId.tsx`, the `SeasonAccordion` needs download profiles. Update the render (lines 60-66):

```typescript
            {sortedSeasons.map((season) => (
              <SeasonAccordion
                key={season.id}
                season={season}
                seriesType={show.seriesType}
                downloadProfiles={downloadProfiles.filter(
                  (p) => p.contentType === "tv" && show.downloadProfileIds.includes(p.id),
                )}
              />
            ))}
```

- [ ] **Step 4: Verify build**

Run: `bun run build`

- [ ] **Step 5: Commit**

```bash
git add src/components/tv/season-accordion.tsx src/routes/_authed/tv/series/\$showId.tsx
git commit -m "feat: refactor season accordion with per-profile monitoring icons"
```

---

### Task 12: Refactor `EpisodeRow`

**Files:**

- Modify: `src/components/tv/episode-row.tsx`

- [ ] **Step 1: Rewrite the component**

Replace the entire file:

```typescript
import { useState } from "react";
import type { JSX } from "react";
import { Check, Minus } from "lucide-react";
import { useRouter } from "@tanstack/react-router";
import ProfileToggleIcons from "src/components/shared/profile-toggle-icons";
import UnmonitorDialog from "src/components/shared/unmonitor-dialog";
import {
  useMonitorEpisodeProfile,
  useUnmonitorEpisodeProfile,
} from "src/hooks/mutations/episode-profiles";

type Episode = {
  id: number;
  episodeNumber: number;
  absoluteNumber: number | null;
  title: string;
  airDate: string | null;
  runtime: number | null;
  hasFile: boolean | null;
  downloadProfileIds: number[];
};

type DownloadProfile = {
  id: number;
  name: string;
  icon: string;
};

type EpisodeRowProps = {
  episode: Episode;
  seriesType: string;
  downloadProfiles: DownloadProfile[];
};

function isUnaired(airDate: string | null): boolean {
  if (!airDate) {
    return true;
  }
  const today = new Date().toISOString().split("T")[0];
  return airDate > today;
}

function formatAirDate(airDate: string | null): string {
  if (!airDate) {
    return "TBA";
  }
  try {
    return new Date(`${airDate}T00:00:00`).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return airDate;
  }
}

export default function EpisodeRow({
  episode,
  seriesType,
  downloadProfiles,
}: EpisodeRowProps): JSX.Element {
  const router = useRouter();
  const monitorProfile = useMonitorEpisodeProfile();
  const unmonitorProfile = useUnmonitorEpisodeProfile();
  const [unmonitorProfileId, setUnmonitorProfileId] = useState<number | null>(null);

  const unaired = isUnaired(episode.airDate);

  // Format episode number display
  let epLabel = `E${String(episode.episodeNumber).padStart(2, "0")}`;
  if (seriesType === "anime" && episode.absoluteNumber !== null) {
    epLabel += ` (${episode.absoluteNumber})`;
  }

  const handleProfileToggle = (profileId: number) => {
    if (episode.downloadProfileIds.includes(profileId)) {
      setUnmonitorProfileId(profileId);
    } else {
      monitorProfile.mutate(
        { episodeId: episode.id, downloadProfileId: profileId },
        { onSuccess: () => router.invalidate() },
      );
    }
  };

  const handleUnmonitorConfirm = (deleteFiles: boolean) => {
    if (unmonitorProfileId === null) return;
    unmonitorProfile.mutate(
      {
        episodeId: episode.id,
        downloadProfileId: unmonitorProfileId,
        deleteFiles,
      },
      {
        onSuccess: () => {
          setUnmonitorProfileId(null);
          router.invalidate();
        },
      },
    );
  };

  return (
    <>
      <div
        className={`flex items-center gap-4 px-3 py-2 text-sm border-b last:border-b-0 ${
          unaired ? "opacity-60" : ""
        }`}
      >
        {/* Monitor icons — leftmost, no header */}
        <span className="w-14 shrink-0">
          {downloadProfiles.length > 0 && (
            <ProfileToggleIcons
              profiles={downloadProfiles}
              activeProfileIds={episode.downloadProfileIds}
              onToggle={handleProfileToggle}
              isPending={monitorProfile.isPending || unmonitorProfile.isPending}
              size="sm"
              direction="horizontal"
            />
          )}
        </span>

        {/* Episode number */}
        <span className="w-20 shrink-0 font-mono text-muted-foreground">
          {epLabel}
        </span>

        {/* Title */}
        <span className="flex-1 min-w-0 truncate" title={episode.title}>
          {episode.title || "TBA"}
        </span>

        {/* Air date */}
        <span
          className={`w-28 shrink-0 text-right ${
            unaired ? "text-muted-foreground" : ""
          }`}
        >
          {formatAirDate(episode.airDate)}
        </span>

        {/* Runtime */}
        <span className="w-12 shrink-0 text-right text-muted-foreground">
          {episode.runtime ? `${episode.runtime}m` : "-"}
        </span>

        {/* File status */}
        <span className="w-8 shrink-0 flex justify-center">
          {episode.hasFile ? (
            <Check className="h-4 w-4 text-green-500" />
          ) : (
            <Minus className="h-4 w-4 text-muted-foreground" />
          )}
        </span>
      </div>

      <UnmonitorDialog
        open={unmonitorProfileId !== null}
        onOpenChange={(open) => {
          if (!open) setUnmonitorProfileId(null);
        }}
        profileName={
          downloadProfiles.find((p) => p.id === unmonitorProfileId)?.name ?? ""
        }
        itemTitle={episode.title || `E${String(episode.episodeNumber).padStart(2, "0")}`}
        itemType="episode"
        fileCount={0}
        onConfirm={handleUnmonitorConfirm}
        isPending={unmonitorProfile.isPending}
      />
    </>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `bun run build`
Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/components/tv/episode-row.tsx
git commit -m "feat: refactor episode row with per-profile monitoring icons"
```

---

### Task 13: Generate and Apply Database Migration

**Files:**

- Generated migration file in `drizzle/`

This task should be done last since Drizzle generates migrations from the diff between the current DB and the schema.

- [ ] **Step 1: Generate migration**

Run: `bun run db:generate`
Expected: Generates a migration that creates `episode_download_profiles` table and drops `monitored` columns from `shows`, `seasons`, `episodes`, and `movies`.

- [ ] **Step 2: Review the generated migration**

Read the generated SQL file in `drizzle/` and verify it:

1. Creates `episode_download_profiles` table with correct columns and constraints
2. Drops `monitored` column from `shows`, `seasons`, `episodes`, `movies`

**Important:** The migration should NOT contain data migration logic (Drizzle migrations are schema-only). If existing data needs to be preserved, add a manual data migration step between the table creation and column drops.

- [ ] **Step 3: Add data migration (if preserving existing monitored state)**

If the database has existing shows with episodes where `monitored = true`, create a manual migration that runs BEFORE the column drops. This should:

1. For each episode where `monitored = true`, find the parent show's download profiles
2. Insert rows into `episode_download_profiles` for each profile

If the database is in development and can be recreated, skip this step and just run `bun run db:push` instead.

- [ ] **Step 4: Apply migration**

Run: `bun run db:migrate` (or `bun run db:push` for dev)
Expected: Database schema updated successfully.

- [ ] **Step 5: Verify the app starts**

Run: `bun run dev`
Expected: App starts without errors. Show and movie detail pages render correctly.

- [ ] **Step 6: Commit**

```bash
git add drizzle/
git commit -m "feat: database migration — add episodeDownloadProfiles, drop monitored columns"
```

---

### Task 14: Remove `monitored` References from List Pages, Cards, Tables, and Bulk Bars

The schema changes from Task 2 remove the `monitored` column, but several list-page components still reference it. These must be fixed to achieve a clean build.

**Files:**

- Modify: `src/server/shows.ts` (~line 316 in `getShowsFn`: `monitored: shows.monitored`)
- Modify: `src/server/movies.ts` (~line 98 in `addMovieFn`: `monitored: true`, ~line 143 in `getMoviesFn`: `monitored: movies.monitored`)
- Modify: `src/components/tv/show-card.tsx` (line 14: `monitored: boolean` type)
- Modify: `src/components/tv/show-table.tsx` (line 30: `monitored: boolean` type, line 247: `show.monitored`)
- Modify: `src/components/tv/show-bulk-bar.tsx` (lines 49-53: `payload.monitored`)
- Modify: `src/components/movies/movie-card.tsx` (line 14: `monitored: boolean` type)
- Modify: `src/components/movies/movie-table.tsx` (line 30: `monitored: boolean` type, line 220: `movie.monitored`)
- Modify: `src/components/movies/movie-bulk-bar.tsx` (lines 49-53: `payload.monitored`)

- [ ] **Step 1: Remove `monitored` from server list/add functions**

In `src/server/shows.ts`, find `getShowsFn` and remove any explicit `monitored: shows.monitored` from the select. If using `select()` (all columns), the column removal from schema handles it automatically.

In `src/server/movies.ts`:

- In `addMovieFn`, remove `monitored: true` from the `db.insert(movies).values(...)` call.
- In `getMoviesFn`, remove any explicit `monitored: movies.monitored` from the select.

- [ ] **Step 2: Remove `monitored` from card components**

In `src/components/tv/show-card.tsx`: remove `monitored: boolean` from the type definition. Remove any rendering of the monitored state.

In `src/components/movies/movie-card.tsx`: same changes.

- [ ] **Step 3: Remove `monitored` from table components**

In `src/components/tv/show-table.tsx`: remove `monitored: boolean` from the type, remove `show.monitored` references and the monitored column/cell rendering.

In `src/components/movies/movie-table.tsx`: same changes.

- [ ] **Step 4: Remove `monitored` from bulk bar components**

In `src/components/tv/show-bulk-bar.tsx`: remove the "Monitored" dropdown and `payload.monitored` from the bulk update payload. The bulk bar can still set profiles and other fields.

In `src/components/movies/movie-bulk-bar.tsx`: same changes.

- [ ] **Step 5: Verify build**

Run: `bun run build`
Expected: Build succeeds with no TypeScript errors.

- [ ] **Step 6: Grep for remaining `monitored` references**

Run: `grep -rn "\.monitored\b" src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v ".gen.ts" | grep -v "authors"`

Expected: No references to `.monitored` on shows, seasons, episodes, or movies remain. Author/book `monitored` references may still exist and are fine.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "refactor: remove monitored references from list pages, cards, tables, and bulk bars"
```

---

### Task 15: Final Build Verification

- [ ] **Step 1: Full build check**

Run: `bun run build`
Expected: Build succeeds with no TypeScript errors.

- [ ] **Step 2: Manual smoke test**

Run: `bun run dev` and verify:

1. Movie detail page: Edit button opens profile dialog, profile icons render left of title, no monitored switch in details
2. Show detail page: Edit button opens profile dialog, profile icons left of title, season accordion has per-profile icons, episode rows have per-profile icons
3. Book/author pages: UnmonitorDialog still works correctly with new shared component

- [ ] **Step 3: Commit any fixes**

```bash
git add -A
git commit -m "fix: final cleanup for monitoring redesign"
```
