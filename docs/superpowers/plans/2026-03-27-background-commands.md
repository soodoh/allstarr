# Background Commands Infrastructure — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor all long-running UI-triggered operations (imports, metadata refreshes) into fire-and-forget background commands with real-time SSE progress and reconnection support.

**Architecture:** New `active_adhoc_commands` table stores in-flight work. `submitCommand()` inserts a row and kicks off work as a detached promise. Progress updates flow through the existing `EventBus` → SSE → client toasts. Rows are deleted on completion. Existing internal functions (`importAuthorInternal`, etc.) are reused unchanged; only the server function wrappers change.

**Tech Stack:** Drizzle ORM (SQLite), TanStack Start server functions, EventSource SSE, Sonner toasts, React Query

**Spec:** `docs/superpowers/specs/2026-03-27-background-commands-design.md` (Workstreams 1 & 2)

---

### Task 1: Create `active_adhoc_commands` schema and migration

**Files:**

- Create: `src/db/schema/active-adhoc-commands.ts`
- Modify: `src/db/schema/index.ts`

- [ ] **Step 1: Create the schema file**

```typescript
// src/db/schema/active-adhoc-commands.ts
import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const activeAdhocCommands = sqliteTable("active_adhoc_commands", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  commandType: text("command_type").notNull(),
  name: text("name").notNull(),
  body: text("body", { mode: "json" })
    .$type<Record<string, unknown>>()
    .notNull(),
  progress: text("progress"),
  startedAt: text("started_at").notNull(),
  createdAt: text("created_at").notNull().default("CURRENT_TIMESTAMP"),
});
```

- [ ] **Step 2: Export from schema index**

In `src/db/schema/index.ts`, add:

```typescript
export * from "./active-adhoc-commands";
```

- [ ] **Step 3: Generate migration**

Run: `bun run db:generate`

- [ ] **Step 4: Apply migration**

Run: `bun run db:migrate`

- [ ] **Step 5: Commit**

```bash
git add src/db/schema/active-adhoc-commands.ts src/db/schema/index.ts drizzle/
git commit -m "feat: add active_adhoc_commands schema and migration"
```

---

### Task 2: Add command SSE event types

**Files:**

- Modify: `src/server/event-bus.ts`

- [ ] **Step 1: Add command event types to ServerEvent union**

In `src/server/event-bus.ts`, extend the `ServerEvent` type:

```typescript
export type ServerEvent =
  | { type: "queueUpdated" }
  | { type: "queueProgress"; data: { items: QueueItem[]; warnings: string[] } }
  | { type: "taskUpdated"; taskId: string }
  | { type: "downloadCompleted"; bookId: number | null; title: string }
  | {
      type: "downloadFailed";
      bookId: number | null;
      title: string;
      message: string;
    }
  | { type: "importCompleted"; bookId: number | null; bookTitle: string }
  | { type: "commandProgress"; commandId: number; progress: string }
  | {
      type: "commandCompleted";
      commandId: number;
      commandType: string;
      result: Record<string, unknown>;
    }
  | {
      type: "commandFailed";
      commandId: number;
      commandType: string;
      error: string;
    };
```

- [ ] **Step 2: Commit**

```bash
git add src/server/event-bus.ts
git commit -m "feat: add command progress/completed/failed SSE event types"
```

---

### Task 3: Create command runner module

**Files:**

- Create: `src/server/commands.ts`

- [ ] **Step 1: Create the command runner**

```typescript
// src/server/commands.ts
// oxlint-disable no-console -- Command runner logs are intentional server-side diagnostics
import { createServerFn } from "@tanstack/react-start";
import { db } from "src/db";
import { activeAdhocCommands } from "src/db/schema";
import { eq, and } from "drizzle-orm";
import { eventBus } from "./event-bus";
import { requireAuth } from "./middleware";
import { isTaskRunning } from "./scheduler";

export type CommandHandler = (
  body: Record<string, unknown>,
  updateProgress: (message: string) => void,
) => Promise<Record<string, unknown>>;

type SubmitCommandOptions = {
  commandType: string;
  name: string;
  body: Record<string, unknown>;
  /** Field name in body used as the unique key for duplicate detection */
  dedupeKey: string;
  /** If set, check this scheduled task ID for batch overlap */
  batchTaskId?: string;
  handler: CommandHandler;
};

function checkDuplicate(
  commandType: string,
  dedupeKey: string,
  body: Record<string, unknown>,
): void {
  const dedupeValue = body[dedupeKey];
  if (dedupeValue === undefined) return;

  const existing = db
    .select({ id: activeAdhocCommands.id })
    .from(activeAdhocCommands)
    .where(eq(activeAdhocCommands.commandType, commandType))
    .all();

  for (const row of existing) {
    // Re-fetch to parse body — lightweight since table is small (only in-flight commands)
    const full = db
      .select({ body: activeAdhocCommands.body })
      .from(activeAdhocCommands)
      .where(eq(activeAdhocCommands.id, row.id))
      .get();

    if (
      full &&
      (full.body as Record<string, unknown>)[dedupeKey] === dedupeValue
    ) {
      throw new Error("This task is already running.");
    }
  }
}

function checkBatchOverlap(batchTaskId: string): void {
  if (isTaskRunning(batchTaskId)) {
    throw new Error(
      `A batch metadata refresh is already running. Wait for it to complete or check the Tasks page for progress.`,
    );
  }
}

async function doWork(
  commandId: number,
  commandType: string,
  handler: CommandHandler,
  body: Record<string, unknown>,
): Promise<void> {
  const updateProgress = (message: string): void => {
    db.update(activeAdhocCommands)
      .set({ progress: message })
      .where(eq(activeAdhocCommands.id, commandId))
      .run();
    eventBus.emit({ type: "commandProgress", commandId, progress: message });
  };

  try {
    const result = await handler(body, updateProgress);
    eventBus.emit({ type: "commandCompleted", commandId, commandType, result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error(`[command] ${commandType} #${commandId} failed:`, error);
    eventBus.emit({
      type: "commandFailed",
      commandId,
      commandType,
      error: message,
    });
  } finally {
    db.delete(activeAdhocCommands)
      .where(eq(activeAdhocCommands.id, commandId))
      .run();
  }
}

export function submitCommand(opts: SubmitCommandOptions): {
  commandId: number;
} {
  const { commandType, name, body, dedupeKey, batchTaskId, handler } = opts;

  checkDuplicate(commandType, dedupeKey, body);
  if (batchTaskId) {
    checkBatchOverlap(batchTaskId);
  }

  const row = db
    .insert(activeAdhocCommands)
    .values({
      commandType,
      name,
      body,
      startedAt: new Date().toISOString(),
    })
    .returning()
    .get();

  // Fire and forget — intentionally not awaited
  // oxlint-disable-next-line prefer-await-to-then
  void doWork(row.id, commandType, handler, body).catch((error) =>
    console.error(
      `[command] Uncaught error in ${commandType} #${row.id}:`,
      error,
    ),
  );

  return { commandId: row.id };
}

// Server function to fetch active commands (used for SSE reconnection)
export const getActiveCommandsFn = createServerFn({ method: "GET" }).handler(
  async () => {
    await requireAuth();
    return db.select().from(activeAdhocCommands).all();
  },
);
```

- [ ] **Step 2: Export isTaskRunning from scheduler barrel**

Check that `isTaskRunning` is exported from `src/server/scheduler/index.ts`. It should already be — verify and add export if missing.

- [ ] **Step 3: Commit**

```bash
git add src/server/commands.ts
git commit -m "feat: add command runner with submitCommand, duplicate detection, and SSE progress"
```

---

### Task 4: Add query keys for commands

**Files:**

- Modify: `src/lib/query-keys.ts`

- [ ] **Step 1: Add commands query keys**

Add to the `queryKeys` object:

```typescript
commands: {
  all: ["commands"] as const,
  active: () => ["commands", "active"] as const,
},
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/query-keys.ts
git commit -m "feat: add commands query keys"
```

---

### Task 5: Update useServerEvents for command toasts and reconnection

**Files:**

- Modify: `src/hooks/use-server-events.ts`

- [ ] **Step 1: Add command event handlers and reconnection logic**

Update the `useServerEvents` hook. Add imports for `getActiveCommandsFn` and `queryKeys.commands`. Add three new event listeners and reconnection logic in the `open` handler:

```typescript
// After existing event listeners, add:

es.addEventListener("commandProgress", (e) => {
  const data = JSON.parse(e.data) as {
    commandId: number;
    progress: string;
  };
  toast.loading(data.progress, { id: `command-${data.commandId}` });
});

es.addEventListener("commandCompleted", (e) => {
  const data = JSON.parse(e.data) as {
    commandId: number;
    commandType: string;
    result: Record<string, unknown>;
  };
  toast.dismiss(`command-${data.commandId}`);
  toast.success(formatCommandResult(data.commandType, data.result));
  // Invalidate relevant queries based on commandType
  invalidateForCommand(queryClient, data.commandType);
});

es.addEventListener("commandFailed", (e) => {
  const data = JSON.parse(e.data) as {
    commandId: number;
    commandType: string;
    error: string;
  };
  toast.dismiss(`command-${data.commandId}`);
  toast.error(data.error);
});
```

Add the helper functions above the hook:

```typescript
function formatCommandResult(
  commandType: string,
  result: Record<string, unknown>,
): string {
  switch (commandType) {
    case "importAuthor": {
      const r = result as { booksAdded?: number; editionsAdded?: number };
      return `Author imported with ${r.booksAdded ?? 0} books`;
    }
    case "importBook": {
      return "Book imported successfully";
    }
    case "importManga": {
      const r = result as { chaptersAdded?: number; volumesAdded?: number };
      return `Manga added with ${r.chaptersAdded ?? 0} chapters and ${r.volumesAdded ?? 0} volumes`;
    }
    case "refreshAuthor":
    case "refreshBook":
    case "refreshManga": {
      return "Metadata refreshed";
    }
    default:
      return "Task completed";
  }
}

function invalidateForCommand(
  queryClient: ReturnType<typeof useQueryClient>,
  commandType: string,
): void {
  switch (commandType) {
    case "importAuthor":
    case "refreshAuthor":
      queryClient.invalidateQueries({ queryKey: queryKeys.authors.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.books.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.history.all });
      break;
    case "importBook":
    case "refreshBook":
      queryClient.invalidateQueries({ queryKey: queryKeys.books.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.history.all });
      break;
    case "importManga":
    case "refreshManga":
      queryClient.invalidateQueries({ queryKey: queryKeys.manga.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.history.all });
      break;
  }
}
```

Add reconnection logic in the `open` handler:

```typescript
es.addEventListener("open", () => {
  setIsConnected(true);
  // Restore toasts for any in-flight commands
  getActiveCommandsFn()
    .then((commands) => {
      for (const cmd of commands) {
        toast.loading(cmd.progress ?? `Running: ${cmd.name}`, {
          id: `command-${cmd.id}`,
        });
      }
    })
    .catch(() => {
      // Silently ignore — reconnection is best-effort
    });
});
```

- [ ] **Step 2: Verify build**

Run: `bun run build`

- [ ] **Step 3: Commit**

```bash
git add src/hooks/use-server-events.ts
git commit -m "feat: handle command SSE events with toast lifecycle and reconnection"
```

---

### Task 6: Migrate manga import to background command

**Files:**

- Modify: `src/server/manga-import.ts`
- Modify: `src/hooks/mutations/manga.ts`

- [ ] **Step 1: Refactor importMangaFn to use submitCommand**

In `src/server/manga-import.ts`, update the `importMangaFn` handler. Keep all existing helper functions unchanged. Extract the handler body into a `CommandHandler`:

```typescript
import { submitCommand, type CommandHandler } from "./commands";

// Keep all existing helpers (deduplicateReleases, groupChaptersIntoVolumes, etc.) unchanged

const importMangaHandler: CommandHandler = async (body, updateProgress) => {
  const data = body as z.infer<typeof addMangaSchema>;

  updateProgress("Checking for duplicates...");
  const existing = db
    .select({ id: manga.id })
    .from(manga)
    .where(eq(manga.mangaUpdatesId, data.mangaUpdatesId))
    .get();

  if (existing) {
    throw new Error("Manga already exists in your library.");
  }

  updateProgress("Fetching series detail from MangaUpdates...");
  const detail = await getMangaUpdatesSeriesDetail(data.mangaUpdatesId);

  updateProgress("Fetching chapter releases...");
  const releases = await getAllMangaUpdatesReleases(
    data.mangaUpdatesId,
    data.title,
  );

  updateProgress(`Processing ${releases.length} releases...`);
  const chapters = deduplicateReleases(releases);
  const volumeGroups = groupChaptersIntoVolumes(chapters);
  const status = detail.completed ? "complete" : "ongoing";

  const profile = db
    .select({ rootFolderPath: downloadProfiles.rootFolderPath })
    .from(downloadProfiles)
    .where(eq(downloadProfiles.id, data.downloadProfileIds[0]))
    .get();
  const rootFolder = profile?.rootFolderPath ?? "";
  const sanitizedTitle = data.title.replaceAll("/", "-");

  updateProgress("Saving to database...");
  const result = db.transaction((tx) => {
    const mangaRow = tx
      .insert(manga)
      .values({
        title: data.title,
        sortTitle: data.sortTitle || generateSortTitle(data.title),
        overview: data.overview || detail.description || "",
        mangaUpdatesId: data.mangaUpdatesId,
        mangaUpdatesSlug: data.mangaUpdatesSlug,
        type: data.type || detail.type?.toLowerCase() || "manga",
        year: data.year || detail.year || null,
        status,
        latestChapter: data.latestChapter ?? detail.latest_chapter ?? null,
        posterUrl: data.posterUrl || detail.image?.url?.original || "",
        genres:
          data.genres.length > 0
            ? data.genres
            : (detail.genres?.map((g) => g.genre) ?? []),
        monitorNewChapters: data.monitorOption,
        path: rootFolder ? `${rootFolder}/${sanitizedTitle}` : "",
        metadataUpdatedAt: new Date(),
      })
      .returning()
      .get();

    for (const profileId of data.downloadProfileIds) {
      tx.insert(mangaDownloadProfiles)
        .values({ mangaId: mangaRow.id, downloadProfileId: profileId })
        .run();
    }

    const { volumesAdded, chaptersAdded } = insertVolumesAndChapters(
      tx,
      mangaRow.id,
      volumeGroups,
      data.monitorOption,
    );

    tx.insert(history)
      .values({
        eventType: "mangaAdded",
        mangaId: mangaRow.id,
        data: { title: data.title, source: "mangaupdates" },
      })
      .run();

    return { mangaId: mangaRow.id, chaptersAdded, volumesAdded };
  });

  return result;
};

export const importMangaFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => addMangaSchema.parse(d))
  .handler(async ({ data }) => {
    await requireAuth();
    return submitCommand({
      commandType: "importManga",
      name: `Import: ${data.title}`,
      body: data as unknown as Record<string, unknown>,
      dedupeKey: "mangaUpdatesId",
      handler: importMangaHandler,
    });
  });
```

- [ ] **Step 2: Update the manga mutation hook**

In `src/hooks/mutations/manga.ts`, update `useAddManga()` — it now receives `{ commandId }` instead of the full result. Remove `onSuccess` toast handling (SSE handles it now):

```typescript
export function useAddManga() {
  const router = useRouter();
  return useMutation({
    mutationFn: (data: z.infer<typeof addMangaSchema>) =>
      importMangaFn({ data }),
    onMutate: () => {
      toast.loading("Starting manga import...", { id: "import-manga" });
    },
    onSuccess: (result) => {
      toast.dismiss("import-manga");
      // SSE commandProgress events will now drive the toast
    },
    onError: (error) => {
      toast.dismiss("import-manga");
      toast.error(error.message);
    },
  });
}
```

- [ ] **Step 3: Similarly refactor refreshMangaMetadataFn**

Extract the refresh handler body into a `CommandHandler` and wrap with `submitCommand`:

```typescript
const refreshMangaHandler: CommandHandler = async (body, updateProgress) => {
  const data = body as { mangaId: number };

  updateProgress("Fetching manga metadata...");
  const mangaRow = db
    .select()
    .from(manga)
    .where(eq(manga.id, data.mangaId))
    .get();

  if (!mangaRow) {
    throw new Error("Manga not found");
  }

  updateProgress("Refreshing from MangaUpdates...");
  const detail = await getMangaUpdatesSeriesDetail(mangaRow.mangaUpdatesId);

  updateProgress("Fetching chapter releases...");
  const allReleases = await getAllMangaUpdatesReleases(
    mangaRow.mangaUpdatesId,
    mangaRow.title,
  );

  updateProgress("Updating metadata...");
  const status = detail.completed ? "complete" : "ongoing";
  db.update(manga)
    .set({
      title: detail.title || mangaRow.title,
      sortTitle: detail.title
        ? generateSortTitle(detail.title)
        : mangaRow.sortTitle,
      overview: detail.description || mangaRow.overview,
      mangaUpdatesSlug:
        extractMangaUpdatesSlug(detail.url) ?? mangaRow.mangaUpdatesSlug,
      type: detail.type?.toLowerCase() || mangaRow.type,
      year: detail.year || mangaRow.year,
      status,
      latestChapter: detail.latest_chapter ?? mangaRow.latestChapter,
      posterUrl: detail.image?.url?.original || mangaRow.posterUrl,
      genres:
        detail.genres?.map((g) => g.genre) ??
        (mangaRow.genres as string[] | null) ??
        [],
      metadataUpdatedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(manga.id, data.mangaId))
    .run();

  updateProgress("Checking for new chapters...");
  const monitorOption = mangaRow.monitorNewChapters as
    | "all"
    | "future"
    | "missing"
    | "none";
  const newChaptersAdded = insertNewChapters(
    data.mangaId,
    allReleases,
    monitorOption,
  );

  if (newChaptersAdded > 0) {
    db.insert(history)
      .values({
        eventType: "mangaUpdated",
        mangaId: data.mangaId,
        data: {
          title: mangaRow.title,
          newChapters: newChaptersAdded,
        },
      })
      .run();
  }

  return { success: true, newChaptersAdded };
};

export const refreshMangaMetadataFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => refreshMangaSchema.parse(d))
  .handler(async ({ data }) => {
    await requireAuth();
    return submitCommand({
      commandType: "refreshManga",
      name: `Refresh: manga #${data.mangaId}`,
      body: data as unknown as Record<string, unknown>,
      dedupeKey: "mangaId",
      batchTaskId: "refresh-mangaupdates-metadata",
      handler: refreshMangaHandler,
    });
  });
```

- [ ] **Step 4: Update useRefreshMangaMetadata hook**

Same pattern — remove onSuccess toast, let SSE handle it:

```typescript
export function useRefreshMangaMetadata() {
  return useMutation({
    mutationFn: (mangaId: number) =>
      refreshMangaMetadataFn({ data: { mangaId } }),
    onError: (error) => {
      toast.error(error.message);
    },
  });
}
```

- [ ] **Step 5: Verify build**

Run: `bun run build`

- [ ] **Step 6: Commit**

```bash
git add src/server/manga-import.ts src/hooks/mutations/manga.ts
git commit -m "feat: migrate manga import and refresh to background commands"
```

---

### Task 7: Migrate Hardcover author import to background command

**Files:**

- Modify: `src/server/import.ts`
- Modify: `src/hooks/mutations/import.ts`

- [ ] **Step 1: Import submitCommand in import.ts**

Add at top of `src/server/import.ts`:

```typescript
import { submitCommand, type CommandHandler } from "./commands";
```

- [ ] **Step 2: Create importAuthorHandler wrapping importAuthorInternal**

Add above `importHardcoverAuthorFn`:

```typescript
const importAuthorHandler: CommandHandler = async (body, updateProgress) => {
  const data = body as z.infer<typeof importAuthorSchema>;

  updateProgress("Importing author from Hardcover...");
  const result = await importAuthorInternal(data);

  if (data.searchOnAdd) {
    updateProgress("Searching for available releases...");
    // oxlint-disable-next-line prefer-await-to-then -- Fire-and-forget search
    void searchForAuthorBooks(result.authorId).catch((error) =>
      // oxlint-disable-next-line no-console
      console.error("Search after import failed:", error),
    );
  }

  return result;
};
```

- [ ] **Step 3: Replace importHardcoverAuthorFn handler**

```typescript
export const importHardcoverAuthorFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => importAuthorSchema.parse(d))
  .handler(async ({ data }) => {
    await requireAuth();
    return submitCommand({
      commandType: "importAuthor",
      name: `Import author: Hardcover #${data.foreignAuthorId}`,
      body: data as unknown as Record<string, unknown>,
      dedupeKey: "foreignAuthorId",
      handler: importAuthorHandler,
    });
  });
```

- [ ] **Step 4: Create importBookHandler wrapping importHardcoverBookFn logic**

The book import handler is more complex because it calls `importAuthorInternal` inline. Extract the existing handler body into a `CommandHandler`, adding `updateProgress` calls at key points. The implementation should match the existing handler exactly but with progress updates before the major stages:

- `updateProgress("Fetching book metadata from Hardcover...")`
- `updateProgress("Importing primary author...")`
- `updateProgress("Creating book and editions...")`
- `updateProgress("Importing co-authors...")`

- [ ] **Step 5: Replace importHardcoverBookFn handler**

```typescript
export const importHardcoverBookFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => importBookSchema.parse(d))
  .handler(async ({ data }) => {
    await requireAuth();
    return submitCommand({
      commandType: "importBook",
      name: `Import book: Hardcover #${data.foreignBookId}`,
      body: data as unknown as Record<string, unknown>,
      dedupeKey: "foreignBookId",
      handler: importBookHandler,
    });
  });
```

- [ ] **Step 6: Migrate refreshAuthorMetadataFn and refreshBookMetadataFn**

Same pattern for both. Wrap the existing handler logic:

For `refreshAuthorMetadataFn`:

```typescript
const refreshAuthorHandler: CommandHandler = async (body, updateProgress) => {
  const data = body as { authorId: number };
  updateProgress("Refreshing author metadata...");
  const result = await refreshAuthorInternal(data.authorId);
  return result;
};

export const refreshAuthorMetadataFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ authorId: z.number() }).parse(d))
  .handler(async ({ data }) => {
    await requireAuth();
    return submitCommand({
      commandType: "refreshAuthor",
      name: `Refresh author #${data.authorId}`,
      body: data as unknown as Record<string, unknown>,
      dedupeKey: "authorId",
      batchTaskId: "refresh-hardcover-metadata",
      handler: refreshAuthorHandler,
    });
  });
```

For `refreshBookMetadataFn`:

```typescript
const refreshBookHandler: CommandHandler = async (body, updateProgress) => {
  const data = body as { bookId: number };
  updateProgress("Refreshing book metadata...");
  const result = await refreshBookInternal(data.bookId);
  return result;
};

export const refreshBookMetadataFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ bookId: z.number() }).parse(d))
  .handler(async ({ data }) => {
    await requireAuth();
    return submitCommand({
      commandType: "refreshBook",
      name: `Refresh book #${data.bookId}`,
      body: data as unknown as Record<string, unknown>,
      dedupeKey: "bookId",
      batchTaskId: "refresh-hardcover-metadata",
      handler: refreshBookHandler,
    });
  });
```

- [ ] **Step 7: Update import mutation hooks**

In `src/hooks/mutations/import.ts`, update all four hooks to remove onSuccess toast handling. The SSE events now drive toasts. Remove any `toast.success()` in `onSuccess` callbacks and only keep `onError` for immediate validation failures (like the server function throwing before `submitCommand`):

For `useImportHardcoverAuthor`:

- Remove `onSuccess` toast (SSE handles it)
- Keep `onError` for validation/duplicate errors

For `useImportHardcoverBook`:

- Same pattern

For `useRefreshAuthorMetadata`:

- Same pattern

For `useRefreshBookMetadata`:

- Same pattern

- [ ] **Step 8: Verify build**

Run: `bun run build`

- [ ] **Step 9: Commit**

```bash
git add src/server/import.ts src/hooks/mutations/import.ts
git commit -m "feat: migrate Hardcover imports and refreshes to background commands"
```

---

### Task 8: Verify end-to-end flow

- [ ] **Step 1: Run dev server**

Run: `bun run dev`

- [ ] **Step 2: Test in browser**

Open the app in a browser. Navigate to the manga add page and try importing a manga series. Verify:

1. The mutation returns immediately (page doesn't block)
2. A loading toast appears with "Starting manga import..."
3. Toast updates with progress messages ("Fetching series detail...", etc.)
4. On completion, success toast appears with chapter/volume counts
5. The manga library page updates (query invalidation)

- [ ] **Step 3: Test reconnection**

1. Start an import
2. Refresh the page while import is running
3. Verify the loading toast reappears with current progress after SSE reconnects

- [ ] **Step 4: Test duplicate detection**

Try importing the same manga while it's still running. Verify an error toast appears: "This task is already running."

- [ ] **Step 5: Commit any fixes**

```bash
git add -A
git commit -m "fix: address issues found during background commands e2e testing"
```
