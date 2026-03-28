# Scheduled Task Improvements — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve the scheduled task system with new metadata refresh tasks (TMDB, MangaUpdates), split RSS Sync into passive polling + active search, add UI grouping/toggles/progress, and fix misleading messaging.

**Architecture:** Extend existing `scheduled_tasks` schema with `progress` and `group` columns. Add `group` to `TaskDefinition` registry. Implement three new tasks (TMDB refresh, MangaUpdates refresh, Search for Missing). Refactor RSS Sync to passive polling. Enhance the `/system/tasks` UI with grouped layout, enabled toggles, tooltips, and live progress.

**Tech Stack:** Drizzle ORM (SQLite), TanStack Start, React, shadcn/ui (Switch, Tooltip), SSE EventBus

**Spec:** `docs/superpowers/specs/2026-03-27-background-commands-design.md` (Workstreams 3 & 5)

**Depends on:** Plan A (Background Commands) must be completed first — the `progress` column and SSE patterns are shared.

---

### Task 1: Schema changes — add `progress` and `group` columns

**Files:**

- Modify: `src/db/schema/scheduled-tasks.ts`

- [ ] **Step 1: Add columns to schema**

Add `progress` and `group` columns:

```typescript
progress: text("progress"),
group: text("group").notNull().default("maintenance"),
```

- [ ] **Step 2: Generate and apply migration**

Run: `bun run db:generate && bun run db:migrate`

The migration should also:

- Rename the `refresh-metadata` task: `UPDATE scheduled_tasks SET id = 'refresh-hardcover-metadata', name = 'Refresh Hardcover Metadata' WHERE id = 'refresh-metadata';`
- Update group values for existing tasks:
  - `rss-sync` → `search`
  - `refresh-hardcover-metadata` → `metadata`
  - `refresh-tmdb-metadata` → `metadata`
  - `refresh-downloads` → `media`
  - `rescan-folders` → `media`
  - `check-health` → `maintenance`
  - `housekeeping` → `maintenance`
  - `backup` → `maintenance`

If Drizzle doesn't generate the data migration automatically, add a custom SQL migration for the renames and group assignments.

- [ ] **Step 3: Commit**

```bash
git add src/db/schema/scheduled-tasks.ts drizzle/
git commit -m "feat: add progress and group columns to scheduled_tasks, rename refresh-metadata"
```

---

### Task 2: Update task registry with `group` field

**Files:**

- Modify: `src/server/scheduler/registry.ts`
- Modify: All task files in `src/server/scheduler/tasks/`

- [ ] **Step 1: Add group to TaskDefinition**

In `src/server/scheduler/registry.ts`:

```typescript
export type TaskDefinition = {
  id: string;
  name: string;
  description: string;
  defaultInterval: number;
  group: "search" | "metadata" | "media" | "maintenance";
  handler: () => Promise<TaskResult>;
};
```

- [ ] **Step 2: Add group to all existing task registrations**

Update each `registerTask()` call to include the `group` field:

- `rss-sync.ts`: `group: "search"`
- `refresh-metadata.ts`: `group: "metadata"` (also update `id` to `"refresh-hardcover-metadata"` and `name` to `"Refresh Hardcover Metadata"`)
- `refresh-tmdb-metadata.ts`: `group: "metadata"`
- `refresh-downloads.ts`: `group: "media"`
- `rescan-folders.ts`: `group: "media"`
- `check-health.ts`: `group: "maintenance"`
- `housekeeping.ts`: `group: "maintenance"`
- `backup.ts`: `group: "maintenance"`

- [ ] **Step 3: Update seedTasksIfNeeded to include group**

In `src/server/scheduler/index.ts`, update the seed logic to write `group` when inserting new tasks.

- [ ] **Step 4: Verify build**

Run: `bun run build`

- [ ] **Step 5: Commit**

```bash
git add src/server/scheduler/
git commit -m "feat: add group field to task definitions and rename refresh-metadata"
```

---

### Task 3: Add progress support to scheduler execution

**Files:**

- Modify: `src/server/scheduler/index.ts`
- Modify: `src/server/scheduler/registry.ts`

- [ ] **Step 1: Update TaskDefinition handler signature to accept progress callback**

```typescript
export type TaskDefinition = {
  id: string;
  name: string;
  description: string;
  defaultInterval: number;
  group: "search" | "metadata" | "media" | "maintenance";
  handler: (updateProgress: (message: string) => void) => Promise<TaskResult>;
};
```

- [ ] **Step 2: Update executeTask to pass progress callback**

In `executeTask()`, create a progress callback that updates the DB and emits SSE:

```typescript
const updateProgress = (message: string): void => {
  db.update(scheduledTasks)
    .set({ progress: message })
    .where(eq(scheduledTasks.id, taskId))
    .run();
  eventBus.emit({ type: "taskUpdated", taskId });
};
```

Pass `updateProgress` to `task.handler(updateProgress)`.

After task completion, clear the progress:

```typescript
db.update(scheduledTasks)
  .set({ progress: null /* ...existing fields */ })
  .where(eq(scheduledTasks.id, taskId))
  .run();
```

- [ ] **Step 3: Update all existing task handlers to accept the parameter**

Each handler gains `(updateProgress)` as its first parameter. Existing tasks can ignore it for now — just update the signatures to accept `(_updateProgress)`.

- [ ] **Step 4: Commit**

```bash
git add src/server/scheduler/
git commit -m "feat: add progress callback support to task execution"
```

---

### Task 4: Implement Refresh TMDB Metadata task

**Files:**

- Modify: `src/server/scheduler/tasks/refresh-tmdb-metadata.ts`

- [ ] **Step 1: Implement the full task handler**

Replace the stub with a working implementation. Follow the pattern in `refresh-metadata.ts` (Hardcover). The handler should:

1. Query all monitored movies (those with entries in `movieDownloadProfiles`)
2. For each movie: call `refreshMovieMetadataFn` internal logic (extract from the server function handler in `src/server/movies.ts`)
3. Query all monitored shows (those with entries in `episodeDownloadProfiles`)
4. For each show: call `refreshShowMetadataFn` internal logic
5. Sleep 1s between API calls
6. Use `updateProgress()` for granular updates: `"Refreshing movie 3 of 10: Inception..."`
7. Return summary message

You'll need to extract the refresh logic from `refreshMovieMetadataFn` and `refreshShowMetadataFn` into internal functions (like `refreshAuthorInternal` pattern) if they don't already exist. Check if there are already `refreshMovieInternal`/`refreshShowInternal` functions — if not, create them.

Key imports needed:

- `movies`, `movieDownloadProfiles`, `shows`, `episodeDownloadProfiles` from schema
- TMDB client functions from `src/server/tmdb/client.ts`
- Movie/show refresh internals from their respective server files

- [ ] **Step 2: Verify build**

Run: `bun run build`

- [ ] **Step 3: Commit**

```bash
git add src/server/scheduler/tasks/refresh-tmdb-metadata.ts src/server/movies.ts src/server/shows.ts
git commit -m "feat: implement Refresh TMDB Metadata scheduled task"
```

---

### Task 5: Implement Refresh MangaUpdates Metadata task

**Files:**

- Create: `src/server/scheduler/tasks/refresh-mangaupdates-metadata.ts`

- [ ] **Step 1: Create the task**

```typescript
// src/server/scheduler/tasks/refresh-mangaupdates-metadata.ts
// oxlint-disable no-console -- Scheduler task logs are intentional server-side diagnostics
import { db } from "src/db";
import { manga, mangaDownloadProfiles } from "src/db/schema";
import { sql } from "drizzle-orm";
import { registerTask } from "../registry";
import type { TaskResult } from "../registry";

// Import the internal refresh logic — reuse from manga-import.ts
// The refreshMangaHandler from commands.ts won't work here because it goes through submitCommand.
// Instead, extract the core refresh logic into a shared internal function.
import { refreshMangaInternal } from "src/server/manga-import";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function plural(count: number, singular: string): string {
  return `${count} ${count === 1 ? singular : `${singular}s`}`;
}

registerTask({
  id: "refresh-mangaupdates-metadata",
  name: "Refresh MangaUpdates Metadata",
  description:
    "Refresh metadata for all monitored manga series from MangaUpdates.",
  defaultInterval: 12 * 60 * 60, // 12 hours
  group: "metadata",
  handler: async (updateProgress): Promise<TaskResult> => {
    const monitoredManga = db
      .select({ id: manga.id, title: manga.title })
      .from(manga)
      .where(
        sql`EXISTS (
          SELECT 1 FROM ${mangaDownloadProfiles}
          WHERE ${mangaDownloadProfiles.mangaId} = ${manga.id}
        )`,
      )
      .all();

    if (monitoredManga.length === 0) {
      return { success: true, message: "No monitored manga" };
    }

    let refreshed = 0;
    let totalNewChapters = 0;
    let errors = 0;

    for (let i = 0; i < monitoredManga.length; i++) {
      const m = monitoredManga[i];
      updateProgress(
        `Refreshing manga ${i + 1} of ${monitoredManga.length}: ${m.title}...`,
      );

      try {
        const result = await refreshMangaInternal(m.id);
        totalNewChapters += result.newChaptersAdded;
        refreshed += 1;
      } catch (error) {
        console.error(
          `[refresh-mangaupdates] Failed to refresh "${m.title}" (id=${m.id}):`,
          error,
        );
        errors += 1;
      }

      if (i < monitoredManga.length - 1) {
        await sleep(1000);
      }
    }

    const parts: string[] = [];
    if (refreshed > 0) parts.push(plural(refreshed, "manga series"));
    if (totalNewChapters > 0)
      parts.push(plural(totalNewChapters, "new chapter"));
    if (errors > 0) parts.push(plural(errors, "error"));

    return {
      success: errors === 0,
      message:
        parts.length > 0
          ? `Refreshed ${parts.join(", ")}`
          : "No metadata changes",
    };
  },
});
```

**Important:** This requires extracting a `refreshMangaInternal(mangaId)` function from `manga-import.ts` that contains the core refresh logic without the `createServerFn` wrapper or `submitCommand` wrapper. Follow the same pattern as `refreshAuthorInternal` in `import.ts`.

- [ ] **Step 2: Extract refreshMangaInternal from manga-import.ts**

In `src/server/manga-import.ts`, extract the core refresh logic from the `refreshMangaHandler` command handler into a standalone exported function:

```typescript
export async function refreshMangaInternal(
  mangaId: number,
): Promise<{ newChaptersAdded: number }> {
  // Core refresh logic (fetch detail, fetch releases, update metadata, insert new chapters)
  // Same code as refreshMangaHandler but without updateProgress calls
}
```

Then update `refreshMangaHandler` to call `refreshMangaInternal` and add progress around it.

- [ ] **Step 3: Register the task in the scheduler barrel**

In `src/server/scheduler/index.ts`, add the import:

```typescript
import "./tasks/refresh-mangaupdates-metadata";
```

- [ ] **Step 4: Verify build**

Run: `bun run build`

- [ ] **Step 5: Commit**

```bash
git add src/server/scheduler/tasks/refresh-mangaupdates-metadata.ts src/server/scheduler/index.ts src/server/manga-import.ts
git commit -m "feat: implement Refresh MangaUpdates Metadata scheduled task"
```

---

### Task 6: Implement Search for Missing task

**Files:**

- Create: `src/server/scheduler/tasks/search-missing.ts`

- [ ] **Step 1: Create the task**

Extract the active search logic from the current `rss-sync.ts` into a new `search-missing.ts`. This task calls `runAutoSearch()` — essentially what the current RSS Sync does, but with content-type-agnostic messaging.

```typescript
// src/server/scheduler/tasks/search-missing.ts
// oxlint-disable no-console -- Scheduler task logs are intentional server-side diagnostics
import { runAutoSearch } from "src/server/auto-search";
import { anyIndexerAvailable } from "../../indexer-rate-limiter";
import { db } from "src/db";
import { indexers, syncedIndexers } from "src/db/schema";
import { eq } from "drizzle-orm";
import { registerTask } from "../registry";
import type { TaskResult } from "../registry";

function plural(count: number, singular: string): string {
  return `${count} ${count === 1 ? singular : `${singular}s`}`;
}

registerTask({
  id: "search-missing",
  name: "Search for Missing",
  description:
    "Search indexers for all wanted items across books, movies, TV shows, and manga.",
  defaultInterval: 24 * 60 * 60, // 24 hours
  group: "search",
  handler: async (updateProgress): Promise<TaskResult> => {
    const enabledManual = db
      .select({ id: indexers.id })
      .from(indexers)
      .where(eq(indexers.enableSearch, true))
      .all();
    const enabledSynced = db
      .select({ id: syncedIndexers.id })
      .from(syncedIndexers)
      .where(eq(syncedIndexers.enableSearch, true))
      .all();

    if (enabledManual.length === 0 && enabledSynced.length === 0) {
      return {
        success: true,
        message: "No search-enabled indexers configured",
      };
    }

    if (
      !anyIndexerAvailable(
        enabledManual.map((m) => m.id),
        enabledSynced.map((s) => s.id),
      )
    ) {
      return {
        success: true,
        message: "All indexers in backoff or exhausted, skipping cycle",
      };
    }

    updateProgress("Searching for wanted items...");
    const result = await runAutoSearch({ delayBetweenBooks: 2000 });

    if (result.searched === 0) {
      return { success: true, message: "No wanted items to search" };
    }

    // Build content-type-agnostic summary
    const parts: string[] = [];
    const bookCount = result.details.filter((d) => d.searched).length;
    const movieCount = result.movieDetails.filter((d) => d.searched).length;
    const episodeCount = result.episodeDetails.filter((d) => d.searched).length;
    // mangaDetails will be added when manga indexer integration is complete

    if (bookCount > 0) parts.push(plural(bookCount, "book"));
    if (movieCount > 0) parts.push(plural(movieCount, "movie"));
    if (episodeCount > 0) parts.push(plural(episodeCount, "episode"));

    const searched =
      parts.length > 0
        ? `Searched ${parts.join(", ")}`
        : `Searched ${result.searched} items`;

    const extras: string[] = [];
    if (result.grabbed > 0)
      extras.push(`${plural(result.grabbed, "release")} grabbed`);
    if (result.errors > 0) extras.push(plural(result.errors, "error"));

    const message =
      extras.length > 0 ? `${searched} — ${extras.join(", ")}` : searched;

    return { success: result.errors === 0, message };
  },
});
```

Note: Check if `enableSearch` column exists on indexers. If it uses a different column name (like `enableRss` or `enableAutomaticSearch`), adjust accordingly.

- [ ] **Step 2: Register in scheduler barrel**

Add to `src/server/scheduler/index.ts`:

```typescript
import "./tasks/search-missing";
```

- [ ] **Step 3: Commit**

```bash
git add src/server/scheduler/tasks/search-missing.ts src/server/scheduler/index.ts
git commit -m "feat: implement Search for Missing scheduled task"
```

---

### Task 7: Refactor RSS Sync to passive polling

**Files:**

- Modify: `src/server/scheduler/tasks/rss-sync.ts`

- [ ] **Step 1: Refactor RSS Sync to passive feed polling**

Replace the current implementation that calls `runAutoSearch()` with passive RSS polling:

1. For each enabled RSS indexer, call the Newznab/Torznab API with category filters but no search query (empty `q` parameter) to get recent releases
2. Match returned releases locally against all wanted items
3. Grab matches

This is a significant implementation. The key change is calling `searchNewznab(feed, "", categories)` with an empty query string to get the RSS feed rather than targeted search results. Then match the returned releases against wanted lists from all content types.

If full passive polling is too complex for this phase, an acceptable intermediate step is to update the task's **messaging and description** to be content-type agnostic while keeping the active search behavior, since the Search for Missing task now handles the primary active search role. Update:

- Description: `"Poll indexer RSS feeds for newly posted releases and grab matches for wanted items."`
- Messages to use generic terms ("items" not "books")
- Update the summary format to list content types

- [ ] **Step 2: Commit**

```bash
git add src/server/scheduler/tasks/rss-sync.ts
git commit -m "refactor: update RSS Sync messaging to be content-type agnostic"
```

---

### Task 8: Add toggleTaskEnabled server function

**Files:**

- Modify: `src/server/tasks.ts`

- [ ] **Step 1: Add toggle server function**

```typescript
export const toggleTaskEnabledFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ taskId: z.string(), enabled: z.boolean() }).parse(d),
  )
  .handler(async ({ data }) => {
    await requireAuth();
    db.update(scheduledTasks)
      .set({ enabled: data.enabled })
      .where(eq(scheduledTasks.id, data.taskId))
      .run();

    // If disabling, clear the timer. If enabling, restart it.
    if (data.enabled) {
      const task = db
        .select()
        .from(scheduledTasks)
        .where(eq(scheduledTasks.id, data.taskId))
        .get();
      if (task) {
        rescheduleTask(data.taskId, task.interval * 1000);
      }
    } else {
      clearTaskTimer(data.taskId);
    }

    eventBus.emit({ type: "taskUpdated", taskId: data.taskId });
    return { success: true };
  });
```

You'll need to add a `clearTaskTimer` function to `timers.ts` that clears and removes the timer for a task.

- [ ] **Step 2: Update ScheduledTask type to include progress and group**

```typescript
export type ScheduledTask = {
  id: string;
  name: string;
  interval: number;
  lastExecution: string | null;
  lastDuration: number | null;
  lastResult: string | null;
  lastMessage: string | null;
  nextExecution: string | null;
  enabled: boolean;
  isRunning: boolean;
  progress: string | null; // NEW
  group: string; // NEW
};
```

Update `getScheduledTasksFn` to include these fields in the response.

- [ ] **Step 3: Commit**

```bash
git add src/server/tasks.ts src/server/scheduler/timers.ts
git commit -m "feat: add toggleTaskEnabled server function and ScheduledTask progress/group fields"
```

---

### Task 9: Enhance /system/tasks UI

**Files:**

- Modify: `src/routes/_authed/system/tasks.tsx`

- [ ] **Step 1: Add grouped layout**

Group tasks by their `group` field. Render each group with a header label. Order: Search → Metadata → Media Management → Maintenance.

```typescript
const GROUP_ORDER = ["search", "metadata", "media", "maintenance"] as const;
const GROUP_LABELS: Record<string, string> = {
  search: "Search",
  metadata: "Metadata",
  media: "Media Management",
  maintenance: "Maintenance",
};

// Group tasks
const grouped = GROUP_ORDER.map((group) => ({
  group,
  label: GROUP_LABELS[group],
  tasks: tasks.filter((t) => t.group === group),
})).filter((g) => g.tasks.length > 0);
```

Render each group as a section with a heading, then the table rows for that group's tasks.

- [ ] **Step 2: Add enabled toggle**

Add a shadcn `<Switch>` component in each row that calls `toggleTaskEnabledFn`. Disabled tasks should appear visually dimmed (e.g., `opacity-50`).

```tsx
<Switch
  checked={task.enabled}
  onCheckedChange={(enabled) =>
    toggleTaskEnabled.mutate({ taskId: task.id, enabled })
  }
/>
```

- [ ] **Step 3: Add tooltip to run button**

Wrap the existing play button in a shadcn `<Tooltip>`:

```tsx
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "src/components/ui/tooltip";

<Tooltip>
  <TooltipTrigger asChild>
    <Button
      variant="ghost"
      size="icon"
      className="cursor-pointer"
      onClick={() => runTask.mutate({ taskId: task.id })}
      disabled={task.isRunning}
    >
      <Play className="h-4 w-4" />
    </Button>
  </TooltipTrigger>
  <TooltipContent>Run now</TooltipContent>
</Tooltip>;
```

- [ ] **Step 4: Show live progress when running**

When `task.isRunning && task.progress`, display the progress message instead of `lastMessage`:

```tsx
{
  task.isRunning && task.progress ? (
    <span className="text-muted-foreground text-sm">{task.progress}</span>
  ) : task.lastMessage ? (
    <span className="text-muted-foreground text-sm">{task.lastMessage}</span>
  ) : null;
}
```

- [ ] **Step 5: Verify build**

Run: `bun run build`

- [ ] **Step 6: Commit**

```bash
git add src/routes/_authed/system/tasks.tsx
git commit -m "feat: enhance tasks UI with grouping, enabled toggle, tooltip, and live progress"
```
