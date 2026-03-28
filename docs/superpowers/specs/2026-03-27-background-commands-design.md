# Background Commands & Task Infrastructure Design Spec

## Overview

Refactor all long-running UI-triggered operations (imports, metadata refreshes) from blocking client requests to fire-and-forget background commands with real-time progress via SSE. Simultaneously improve the scheduled task system with new metadata refresh tasks, RSS Sync redesign, manga indexer integration, and UI enhancements.

## Problem

Current imports (Hardcover authors/books, MangaUpdates manga) are synchronous server functions — the client blocks on the HTTP response while the server fetches external APIs, processes data, and writes to the DB. If the user closes the tab or refreshes mid-import, the request may be interrupted. Large imports (Stephen King's bibliography, One Piece's 1000+ chapters) can take significant time.

## Goals

1. All long-running UI actions execute server-side, surviving client disconnects
2. Real-time granular progress updates via existing SSE infrastructure
3. Resumable across page loads (reconnecting SSE picks up in-flight status)
4. Independent progress toasts per concurrent operation
5. Unified task execution for both scheduled and ad-hoc operations
6. Manga integrated into the indexer/download pipeline alongside books, movies, and TV

---

## Workstream 1: Background Command Infrastructure

### Data Model — `active_adhoc_commands` table

A transient table for in-flight ad-hoc commands. Rows are deleted on completion. Only contains currently executing work.

```
active_adhoc_commands
├── id          (integer PK, auto-increment)
├── commandType (text, not null) — e.g. "importManga", "importAuthor", "refreshAuthorMetadata"
├── name        (text, not null) — human-readable, e.g. "Import: One Piece"
├── body        (JSON, not null) — serialized input params
├── progress    (text, nullable) — latest progress message
├── startedAt   (text, not null) — ISO timestamp
├── createdAt   (text, not null, default current_timestamp)
```

No `status` column needed — all rows are in-flight by definition. Rows are deleted on both success and failure; the SSE event delivers the outcome to the client.

### Duplicate Detection

Before inserting a new command:

1. **Same command check:** Query `active_adhoc_commands` for matching `commandType` + key identifier from `body`. Key fields per command type:
   - `importAuthor`: `body.foreignAuthorId`
   - `importBook`: `body.foreignBookId`
   - `importManga`: `body.mangaUpdatesId`
   - `refreshAuthor`: `body.authorId`
   - `refreshBook`: `body.bookId`
   - `refreshManga`: `body.mangaId`
     If found, reject with error: "This task is already running."
2. **Batch overlap check:** For single-entity refresh commands, check `isTaskRunning()` against the corresponding batch scheduled task (e.g., `"refresh-hardcover-metadata"`). If running and the entity is monitored (included in batch), reject with: "Metadata refresh is already running for all [content type]."
3. **New imports during batch:** Always allowed — batch only covers existing monitored entities.

### Server-Side Command Runner — `src/server/commands.ts`

```
submitCommand(opts: { commandType, name, body, handler }):
  1. Run duplicate detection checks
  2. Insert row into active_adhoc_commands
  3. Kick off handler as detached promise:
     void doWork(commandId, handler).catch(...)
  4. Return { commandId } immediately to client

doWork(commandId, handler):
  1. Execute handler, passing an updateProgress callback:
     updateProgress(message):
       - UPDATE active_adhoc_commands SET progress = message
       - eventBus.emit({ type: "commandProgress", commandId, progress: message })
  2. On success:
     - eventBus.emit({ type: "commandCompleted", commandId, result })
     - DELETE row from active_adhoc_commands
  3. On error:
     - eventBus.emit({ type: "commandFailed", commandId, error: message })
     - DELETE row from active_adhoc_commands
```

### SSE Events

Add to `ServerEvent` union type in `event-bus.ts`:

```typescript
| { type: "commandProgress"; commandId: number; progress: string }
| { type: "commandCompleted"; commandId: number; result: Record<string, unknown> }
| { type: "commandFailed"; commandId: number; error: string }
```

### Client-Side Integration

In `useServerEvents` hook:

```
commandProgress  → toast.loading(progress, { id: `command-${commandId}` })
commandCompleted → toast.dismiss(`command-${commandId}`)
                   toast.success(formatResult(result))
                   queryClient.invalidateQueries(relevant keys)
commandFailed    → toast.dismiss(`command-${commandId}`)
                   toast.error(error)
```

**Reconnection:** On SSE connect, fetch `getActiveCommandsFn()` server function that returns all rows from `active_adhoc_commands`. For each in-flight command, restore a loading toast with its current `progress` message.

### Server Function for Active Commands

```typescript
export const getActiveCommandsFn = createServerFn({ method: "GET" }).handler(
  async () => {
    await requireAuth();
    return db.select().from(activeAdhocCommands).all();
  },
);
```

Called on SSE reconnect (in the `open` event handler) to restore UI state.

---

## Workstream 2: Migrate Long-Running Operations

### Operations to Migrate

Each becomes a thin server function that calls `submitCommand()` and returns immediately:

| Operation               | commandType     | Progress examples                                                                             |
| ----------------------- | --------------- | --------------------------------------------------------------------------------------------- |
| Import Hardcover author | `importAuthor`  | "Fetching author metadata...", "Importing book 3 of 15...", "Fetching editions..."            |
| Import Hardcover book   | `importBook`    | "Fetching book metadata...", "Importing primary author...", "Creating editions..."            |
| Import manga series     | `importManga`   | "Fetching series detail...", "Fetching releases page 3 of 12...", "Inserting 847 chapters..." |
| Refresh author metadata | `refreshAuthor` | "Refreshing author metadata...", "Checking for new books..."                                  |
| Refresh book metadata   | `refreshBook`   | "Refreshing book metadata...", "Updating editions..."                                         |
| Refresh manga metadata  | `refreshManga`  | "Refreshing series metadata...", "Fetching releases...", "Found 5 new chapters"               |

### Internal Function Reuse

The existing internal functions (`importAuthorInternal`, `refreshAuthorInternal`, `refreshBookInternal`, etc.) remain unchanged. The command handler wraps them, adding `updateProgress()` calls at key points:

```typescript
// Example: importManga command handler
async function importMangaHandler(body, updateProgress) {
  updateProgress("Checking for duplicates...");
  // ... duplicate check ...

  updateProgress("Fetching series detail from MangaUpdates...");
  const detail = await getMangaUpdatesSeriesDetail(body.mangaUpdatesId);

  updateProgress("Fetching chapter releases...");
  const releases = await getAllMangaUpdatesReleases(
    body.mangaUpdatesId,
    body.title,
  );

  updateProgress(`Processing ${releases.length} releases...`);
  // ... dedup, group, insert ...

  return { mangaId, chaptersAdded, volumesAdded };
}
```

For Hardcover author imports, the `importAuthorInternal` function processes books sequentially — the wrapper can emit progress between each book by hooking into the loop.

---

## Workstream 3: Scheduled Task Improvements

### Schema Changes to `scheduled_tasks`

Add columns:

- `progress` (text, nullable) — live progress message while task is running (cleared on completion)
- `group` (text, not null, default "maintenance") — UI grouping category

### Task Groups

| Group            | Tasks                                                                            |
| ---------------- | -------------------------------------------------------------------------------- |
| Search           | RSS Sync, Search for Missing                                                     |
| Metadata         | Refresh Hardcover Metadata, Refresh TMDB Metadata, Refresh MangaUpdates Metadata |
| Media Management | Refresh Downloads, Rescan Folders                                                |
| Maintenance      | Check Health, Housekeeping, Backup                                               |

Add a `group` field to `TaskDefinition` in the registry. The tasks UI groups and renders by this field.

### Rename: Refresh Metadata → Refresh Hardcover Metadata

Update the existing `refresh-metadata` task:

- `id`: `"refresh-hardcover-metadata"` (migration updates existing row)
- `name`: `"Refresh Hardcover Metadata"`
- `description`: `"Refresh metadata for all monitored authors and books from Hardcover."`
- `group`: `"metadata"`

### New: Refresh TMDB Metadata

Replace the current stub with a working implementation:

- `id`: `"refresh-tmdb-metadata"`
- `name`: `"Refresh TMDB Metadata"`
- `description`: `"Refresh metadata for all monitored movies and TV shows from TMDB."`
- `group`: `"metadata"`
- `defaultInterval`: 12 hours

Implementation follows the same pattern as Hardcover refresh:

1. Query all monitored movies (those with `movieDownloadProfiles` entries)
2. For each movie: fetch latest TMDB data, update local metadata
3. Query all monitored shows (those with `episodeDownloadProfiles` entries)
4. For each show: fetch latest TMDB data, update seasons/episodes
5. Sleep 1s between API calls to respect rate limits
6. Emit progress updates: "Refreshing movie 3 of 10: Inception..."
7. Return summary: "Refreshed 10 movies, 5 shows (2 new episodes)"

### New: Refresh MangaUpdates Metadata

- `id`: `"refresh-mangaupdates-metadata"`
- `name`: `"Refresh MangaUpdates Metadata"`
- `description`: `"Refresh metadata for all monitored manga series from MangaUpdates."`
- `group`: `"metadata"`
- `defaultInterval`: 12 hours

Implementation:

1. Query all manga with `mangaDownloadProfiles` entries
2. For each: call `refreshMangaMetadataFn` internal logic (already exists)
3. Sleep 1s between calls
4. Emit progress: "Refreshing manga 2 of 8: One Piece..."
5. Return summary: "Refreshed 8 manga, 23 new chapters"

### RSS Sync Redesign — Split Into Two Tasks

#### RSS Sync (passive polling)

- `id`: `"rss-sync"`
- `name`: `"RSS Sync"`
- `description`: `"Poll indexer RSS feeds for newly posted releases and grab matches for wanted items."`
- `group`: `"search"`
- `defaultInterval`: 15 minutes

Implementation:

1. For each enabled indexer (manual + synced with `enableRss = true`):
   - Call Newznab/Torznab API with category filter only, no search query: `t=search&cat=...` (or `t=tvsearch&cat=...`, `t=book&cat=...`)
   - This returns the latest N releases in those categories
2. Collect all returned releases
3. Match locally against all wanted items across all content types:
   - `getWantedBooks()` — books needing files or upgrades
   - `getWantedMovies()` — movies needing files or upgrades
   - `getWantedEpisodes()` — episodes needing files or upgrades
   - `getWantedManga()` — manga chapters needing files or upgrades (new)
4. For matches: score, filter by profile, grab best release
5. Return summary with counts per content type

Copy:

- No indexers: "No RSS-enabled indexers configured"
- No matches: "No new releases matched wanted items"
- Results: "Matched 2 books, 1 movie from RSS feeds"

#### Search for Missing (active search)

- `id`: `"search-missing"`
- `name`: `"Search for Missing"`
- `description`: `"Search indexers for all wanted items across books, movies, TV shows, and manga."`
- `group`: `"search"`
- `defaultInterval`: 24 hours

Implementation — evolves the current `runAutoSearch()`:

1. Gather all wanted items across all content types:
   - `getWantedBooks()` — books
   - `getWantedMovies()` — movies
   - `getWantedEpisodes()` — TV episodes
   - `getWantedManga()` — manga chapters (new)
2. For each wanted item: send targeted search queries to indexers
3. Score, filter, grab best releases
4. Sleep between searches to respect rate limits
5. Emit progress: "Searching for item 5 of 23: Harry Potter..."

Copy:

- No indexers: "No search-enabled indexers configured"
- No wanted items: "No wanted items to search"
- Results: "Searched 5 books, 3 movies, 2 episodes, 4 chapters — grabbed 3 releases"

The existing `runAutoSearch()` function already handles books, movies, and episodes. The changes are:

- Add manga processing (`processWantedManga`)
- Update result type to include manga details
- Update summary message generation to be content-type agnostic
- Factor out the RSS-specific passive matching into the RSS Sync task

### Messaging Fixes

All task messages should:

- Distinguish "no indexers configured" from "no wanted items"
- Reference content types generically ("items") or list specific types when reporting results
- Never say "books" when the task covers all content types

### UI Enhancements — `/system/tasks`

**Enabled toggle:** Each scheduled task row gets a toggle switch (shadcn Switch component). Toggling updates `scheduled_tasks.enabled` via a server function. Disabled tasks:

- Do not auto-run on interval (timer is cleared)
- Can still be manually triggered via the run button
- Visually dimmed in the table

**Run button:** Add `cursor-pointer` class on hover. Wrap in shadcn `<Tooltip>` with content "Run now".

**Grouping:** Render tasks grouped by their `group` field. Each group has a header label. Groups are ordered: Search → Metadata → Media Management → Maintenance.

**Progress column:** When a task is running, show the `progress` field value (updating in real-time via SSE) instead of the `lastMessage`.

---

## Workstream 4: Manga Indexer Integration

Manga is currently metadata-only (MangaUpdates). It needs integration into the indexer/download pipeline alongside books, movies, and TV.

### Wanted Manga Detection — `getWantedManga()`

Add to `auto-search.ts`. Follows the same pattern as existing `getWanted*` functions:

```typescript
function getWantedManga(): WantedMangaChapter[] {
  // Find monitored chapters without files
  // JOIN: mangaChapters → manga → mangaDownloadProfiles → downloadProfiles
  // Filter: chapter.monitored = true AND chapter.hasFile = false
  // Exclude: chapters with active tracked downloads
  // Include: chapters needing quality upgrades (existing file below cutoff)
}
```

A manga chapter is "wanted" when:

1. `mangaChapters.monitored = true`
2. `mangaChapters.hasFile = false` (or file exists but below quality cutoff)
3. Parent manga has at least one `mangaDownloadProfiles` entry
4. No active tracked download for this chapter

### Search Query Building

For manga, search queries should be constructed as:

- Primary: `"{manga title}" "{chapter number}"` (e.g., `"One Piece" "Chapter 1089"`)
- Fallback: `"{manga title}" "Vol {volume} Ch {chapter}"` if volume is known
- Category filter: manga/comic Newznab categories

### Process Wanted Manga — `processWantedManga()`

Mirrors `processWantedBooks()`:

1. For each wanted chapter, build search query
2. Query enabled indexers
3. Score releases using the manga download profile's format preferences (CBZ > CBR > PDF > EPUB)
4. Apply custom format scoring if configured
5. Grab best release via download client
6. Create `trackedDownloads` entry with `mangaId` and `mangaChapterId`

### Download Import

When the download manager detects a completed manga download:

1. Verify file format (CBZ/CBR/PDF/EPUB)
2. Insert `manga_files` record with path, size, format, quality metadata
3. Update `mangaChapters.hasFile = true`
4. Record history event: `mangaChapter.imported`
5. Emit SSE event for UI updates

### RSS Sync Integration

Manga releases returned by passive RSS polling are matched against `getWantedManga()` results, same as other content types.

### Search for Missing Integration

`runAutoSearch()` gains a manga section:

```
// ── Manga Chapters ──
const wantedManga = sortBySearchPriority(getWantedManga(), (m) => m.lastSearchedAt);
await processWantedManga(wantedManga, ixs, result, delayBetweenBooks);
```

---

## Workstream 5: RSS Sync — Passive Polling Implementation

### Newznab/Torznab RSS Feed Polling

The passive RSS sync fetches recent releases from indexers without search queries:

```
GET /api?t=search&cat={categories}&apikey={key}&limit=100
```

- For books: `t=search` with book categories
- For movies: `t=movie` with movie categories
- For TV: `t=tvsearch` with TV categories
- For manga: `t=search` with manga/comic categories

Each call returns the latest ~100 releases in those categories. The API cost is constant regardless of library size (1-2 calls per indexer per category group per sync).

### Local Matching

After collecting all RSS releases:

1. Parse release titles to extract metadata (title, format, quality)
2. Match against all wanted items from all content types
3. For matches: apply profile scoring, quality checks, custom format evaluation
4. Grab best matches via download client
5. Track `lastRssSync` timestamp per indexer to avoid re-processing

### Pagination / Catchup

On first run (or after downtime), page backward through RSS results until reaching releases older than the last sync timestamp. This ensures no releases are missed during gaps.

---

## Migration & Rollout

### Database Migration

1. Create `active_adhoc_commands` table
2. Add `progress` and `group` columns to `scheduled_tasks`
3. Rename `refresh-metadata` task id to `refresh-hardcover-metadata`
4. Insert new scheduled task rows: `refresh-tmdb-metadata`, `refresh-mangaupdates-metadata`, `search-missing`
5. Update existing task rows with `group` values

### Backward Compatibility

- Existing server functions (`importMangaFn`, etc.) become thin wrappers calling `submitCommand()` — the API surface doesn't change for callers
- The return type changes from the full result to `{ commandId }` — mutation hooks need updating to use SSE for results instead of the response
- Existing `runAutoSearch()` is refactored but maintains its interface for the Search for Missing task

---

## Files to Create/Modify

### New Files

- `src/db/schema/active-adhoc-commands.ts` — table schema
- `src/server/commands.ts` — submitCommand, doWork, getActiveCommandsFn
- `src/server/scheduler/tasks/refresh-tmdb-metadata.ts` — replace stub with implementation
- `src/server/scheduler/tasks/refresh-mangaupdates-metadata.ts` — new task
- `src/server/scheduler/tasks/search-missing.ts` — new task (extracted from rss-sync)
- `drizzle/XXXX_*.sql` — migration for new table + scheduled_tasks changes

### Modified Files

- `src/server/event-bus.ts` — add command SSE event types
- `src/hooks/use-server-events.ts` — handle command events, toast lifecycle, reconnection
- `src/server/manga-import.ts` — wrap in submitCommand, add progress callbacks
- `src/server/import.ts` — wrap author/book imports in submitCommand, add progress callbacks
- `src/hooks/mutations/manga.ts` — update to expect commandId return, remove blocking toast logic
- `src/hooks/mutations/import.ts` — same pattern
- `src/server/auto-search.ts` — add getWantedManga, processWantedManga, update result types and messaging
- `src/server/scheduler/registry.ts` — add group field to TaskDefinition
- `src/server/scheduler/index.ts` — add progress column support, respect enabled toggle for timers
- `src/server/scheduler/tasks/rss-sync.ts` — refactor to passive polling only
- `src/server/scheduler/tasks/refresh-metadata.ts` — rename to refresh-hardcover-metadata, add progress
- `src/server/tasks.ts` — add toggleTaskEnabled server function, return group/progress
- `src/routes/_authed/system/tasks.tsx` — grouped layout, enabled toggle, tooltip, progress display
- `src/db/schema/index.ts` — export new table
- `src/db/schema/scheduled-tasks.ts` — add progress, group columns
- `src/server/download-manager.ts` — handle manga download imports
