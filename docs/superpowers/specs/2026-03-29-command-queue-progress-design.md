# Command Queue Progress Toasts

## Overview

Enhance loading toast messages for all long-running background tasks to show which item is being processed and total progress. Also migrate `addShowFn` and `addMovieFn` from synchronous server functions to the command queue so they get the same progress reporting and non-blocking behavior.

## Approach

Keep progress as formatted strings (`updateProgress("Action N of M: Item Name")`). No structured data — the toast just displays the string. Simple, minimal infrastructure change.

## Part 1: Migrate Show/Movie Add to Command Queue

### `addShowFn` -> `addShowHandler`

Extract the handler logic from `addShowFn` into an `addShowHandler: CommandHandler`. The server function becomes a thin wrapper calling `submitCommand({ commandType: "addShow", ... })`.

**Current flow (blocking):**

1. Client calls `addShowFn` -> waits for full response
2. Server fetches show detail, fetches each season (N API calls), writes DB
3. Client gets response, shows `toast.success("Show added")`

**New flow (non-blocking):**

1. Client calls `addShowFn` -> gets `{ commandId }` immediately
2. Client shows loading toast via `onMutate`
3. Server runs handler in background, calls `updateProgress()` at each step
4. SSE pushes progress to client, updating the toast
5. On completion, SSE fires `commandCompleted`, toast shows result

### `addMovieFn` -> `addMovieHandler`

Same pattern. Extract handler, wrap in `submitCommand({ commandType: "addMovie", ... })`.

### Mutation Hook Changes

`useAddShow` and `useAddMovie` switch to the import pattern:

- `onMutate`: show loading toast with ID `submit-add-show` / `submit-add-movie`
- Remove `onSuccess` toast (SSE handles it)
- `onError` still shows error toast

### SSE Changes

Add `"addShow"` and `"addMovie"` cases to `formatCommandResult()` and `invalidateForCommand()` in `use-server-events.ts`.

## Part 2: Enhanced Progress Messages

### Message Format

`"Action N of M: Item Name"` where N/M and item name are included when available. For single-step actions without a loop, just describe what's happening.

### `addShowHandler` (new)

```
"Fetching show details..."
"Fetching season 1 of 12..."        # per-season TMDB call
"Fetching season 2 of 12..."
...
"Saving show and episodes..."        # DB transaction
```

### `addMovieHandler` (new)

```
"Fetching movie details..."
"Loading collection: Marvel Cinematic Universe"   # if collection exists
"Saving movie..."
```

### `importAuthorHandler` (existing — import.ts)

Currently has 2 progress calls. Enhanced:

```
"Fetching author details from Hardcover..."
"Fetching editions..."
"Importing book 1 of 15: The Great Gatsby"       # per-book in main loop
"Importing book 2 of 15: Tender Is the Night"
...
"Applying monitoring settings..."
"Searching for available releases..."              # if searchOnAdd
```

The per-book progress call goes inside the book loop in `importAuthorInternal`. The total count comes from `rawBooks.length`, the name from `rawBook.title`.

### `importBookHandler` (existing — import.ts)

Currently has 4 progress calls. Enhanced:

```
"Fetching book metadata from Hardcover..."
"Importing primary author..."
"Importing co-author 1 of 3: Author Name"         # per co-author loop
"Importing co-author 2 of 3: Author Name"
...
"Creating book and editions..."
"Searching for available releases..."              # if searchOnAdd
```

### `importMangaHandler` (existing — manga-import.ts)

Currently has 5 progress calls. Enhanced:

```
"Checking for duplicates..."
"Fetching series details from MangaUpdates..."
"Fetching chapter releases..."
"Processing 200 releases..."
"Creating volume 1 of 12..."                      # per-volume in insert loop
"Creating volume 2 of 12..."
...
"Saving to database..."
```

### `refreshAuthorHandler` (existing — import.ts)

Currently has 1 progress call. Enhanced:

```
"Fetching fresh data from Hardcover..."
"Refreshing book 1 of 15: The Great Gatsby"       # per-book in main loop
"Refreshing book 2 of 15: Tender Is the Night"
...
"Checking for removed entries..."
```

### `refreshBookHandler` (existing — import.ts)

Currently has 1 progress call. Enhanced:

```
"Fetching fresh data from Hardcover..."
"Updating book information..."
"Processing edition 1 of 8: Penguin Classics"     # per-edition loop
...
"Checking for removed editions..."
```

### `refreshMangaHandler` (existing — manga-import.ts)

Currently has 1 progress call. Enhanced:

```
"Fetching latest data from MangaUpdates..."
"Adding new chapters..."
"Creating volume 1 of 3..."                       # per new volume
...
```

## Files to Modify

| File                             | Change                                                                                                                                 |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `src/server/shows.ts`            | Extract `addShowHandler`, refactor `addShowFn` to use `submitCommand`                                                                  |
| `src/server/movies.ts`           | Extract `addMovieHandler`, refactor `addMovieFn` to use `submitCommand`                                                                |
| `src/server/import.ts`           | Add `updateProgress` calls inside loops in `importAuthorInternal`, `importBookHandler`, `refreshAuthorInternal`, `refreshBookInternal` |
| `src/server/manga-import.ts`     | Add `updateProgress` calls inside volume loops in `importMangaHandler`, `refreshMangaHandler`                                          |
| `src/hooks/mutations/shows.ts`   | Change `useAddShow` to loading toast + SSE pattern                                                                                     |
| `src/hooks/mutations/movies.ts`  | Change `useAddMovie` to loading toast + SSE pattern                                                                                    |
| `src/hooks/use-server-events.ts` | Add `addShow`/`addMovie` to `formatCommandResult` and `invalidateForCommand`                                                           |

## Threading `updateProgress` Through Internal Functions

Several handlers delegate to internal functions that contain the actual loops:

- `importAuthorHandler` calls `importAuthorInternal` (which has the book loop)
- `importBookHandler` calls `importAuthorInternal` for co-author imports
- `refreshAuthorHandler` calls `refreshAuthorInternal` (which has the book loop)
- `refreshBookHandler` calls `refreshBookInternal` (which has the edition loop)

These internal functions need an `updateProgress` parameter added to their signatures so the handler can pass its callback through. When `importAuthorInternal` is called as a nested co-author import from `importBookHandler`, the parent handler's `updateProgress` is passed through (the messages will naturally describe what's happening).

## Return Type Change for Show/Movie Add

When `addShowFn` and `addMovieFn` switch to `submitCommand`, they return `{ commandId: number }` instead of the show/movie object. Any calling code that currently uses the returned object (e.g., navigating to the new show/movie page after add) needs to handle this. The navigation/invalidation will instead be triggered by the SSE `commandCompleted` event in `use-server-events.ts`. The result object from the handler is available in the `commandCompleted` event data.

## What Stays the Same

- `CommandHandler` type signature — no changes
- `submitCommand` / `doWork` / `updateProgress` infrastructure — no changes
- SSE `commandProgress` / `commandCompleted` event handling — no changes
- Toast library (Sonner) configuration — no changes
- `createBookFn` / `createAuthorFn` — stay synchronous (fast, no API calls)
