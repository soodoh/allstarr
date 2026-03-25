# Detail Page Parity & Edit Modal Enhancements

**Date**: 2026-03-24
**Status**: Draft

## Overview

Bring all detail pages (books, authors, TV series, movies) to feature parity by adding missing tabs, standardizing action buttons, enhancing edit modals with content-type-specific options, and introducing a book deletion exclusion system with a new Import Lists settings page.

## Schema Changes

### 1. `books` table — add column

| Column              | Type              | Default | Description                                                                                                                        |
| ------------------- | ----------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `autoSwitchEdition` | integer (boolean) | `1`     | When enabled, Hardcover metadata refresh re-evaluates the best edition for each profile using the existing edition selection logic |

### 2. `bookImportListExclusions` table (new)

Schema file: `src/db/schema/book-import-list-exclusions.ts`, exported from `src/db/schema/index.ts`.

| Column          | Type    | Constraints       | Description               |
| --------------- | ------- | ----------------- | ------------------------- |
| `id`            | integer | PK, autoincrement |                           |
| `foreignBookId` | text    | unique, not null  | Hardcover book ID         |
| `title`         | text    | not null          | Book title (for display)  |
| `authorName`    | text    | not null          | Author name (for display) |
| `createdAt`     | integer | default now       | Timestamp of exclusion    |

Checked during `refreshAuthorMetadataFn` and any future import list sync to skip excluded books.

### 3. `authorDownloadProfiles` junction — add column

| Column            | Type | Default | Description                                                                                                                  |
| ----------------- | ---- | ------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `monitorNewBooks` | text | `"all"` | `"all"` \| `"none"` \| `"new"` — controls whether new books discovered during author refresh get monitoring for this profile |

### 4. `showDownloadProfiles` junction — add column

| Column              | Type | Default | Description                                                                                           |
| ------------------- | ---- | ------- | ----------------------------------------------------------------------------------------------------- |
| `monitorNewSeasons` | text | `"all"` | `"all"` \| `"none"` \| `"new"` — controls whether new seasons get episode monitoring for this profile |

### 5. `shows` table — add column

| Column            | Type              | Default | Description                                                                                     |
| ----------------- | ----------------- | ------- | ----------------------------------------------------------------------------------------------- |
| `useSeasonFolder` | integer (boolean) | `1`     | Stored for file organization. Purely a persistence mechanism for now; no effect on file layout. |

### 6. `movies` table — no change

`minimumAvailability` already exists with default `"released"`. Values: `"released"` | `"announced"` | `"inCinemas"`. The `updateMovieSchema` in `src/lib/tmdb-validators.ts` already accepts this field. Just needs UI exposure in the edit modal.

## Validators

Define a shared enum for the per-profile monitoring options:

```typescript
const monitorNewItemsEnum = z.enum(["all", "none", "new"]);
```

### New schemas

```typescript
// Book update
const updateBookSchema = z.object({
  id: z.number(),
  autoSwitchEdition: z.boolean(),
});

// Book delete (replaces current inline validator)
const deleteBookSchema = z.object({
  id: z.number(),
  deleteFiles: z.boolean().default(false),
  addImportExclusion: z.boolean().default(false),
});

// Import list exclusion management
const addImportListExclusionSchema = z.object({
  foreignBookId: z.string(),
  title: z.string(),
  authorName: z.string(),
});

const removeImportListExclusionSchema = z.object({
  id: z.number(),
});
```

### Updated schemas

```typescript
// Author update — replaces downloadProfileIds with richer structure
const updateAuthorSchema = z.object({
  id: z.number(),
  downloadProfiles: z.array(
    z.object({
      downloadProfileId: z.number(), // the download profile's ID
      monitorNewBooks: monitorNewItemsEnum,
    }),
  ),
});
// All callers of updateAuthorFn must be updated: author-form.tsx, $authorId.tsx,
// and any add-author flows that call updateAuthorFn.

// Show update — replaces downloadProfileIds with richer structure, adds useSeasonFolder
const updateShowSchema = z.object({
  id: z.number(),
  downloadProfiles: z.array(
    z.object({
      downloadProfileId: z.number(), // the download profile's ID
      monitorNewSeasons: monitorNewItemsEnum,
    }),
  ),
  useSeasonFolder: z.boolean(),
  seriesType: z.enum(["standard", "daily", "anime"]).optional(), // retained from current schema
});
// All callers of updateShowFn must be updated: show-detail-header.tsx.

// Movie update — no schema change needed, updateMovieSchema already accepts
// { id, downloadProfileIds, minimumAvailability }. Just expose minimumAvailability in UI.
```

## Book Detail Page Overhaul

### Action Buttons

Replace the current ad-hoc buttons (back link, refresh, Hardcover link) with the same layout used on author/movie/TV detail pages:

- Back link on the left
- `ActionButtonGroup` on the right in the same row
- Props: refresh metadata, edit (opens edit dialog), delete (opens delete dialog), external link to Hardcover

### Tabs

Current: Editions, Search Releases.

New tab order: **Editions | Files | History | Search Releases**

#### Files Tab

Reuse the same pattern as `movie-files-tab.tsx`:

- Table with columns: path, size, quality/format, date added
- Audiobooks additionally show: duration, bitrate, codec
- Multi-part audiobooks: show each file as an individual row with part number (e.g., "Part 3 of 12")
- Empty state: "No book files" with BookOpen icon

#### History Tab

Requires extending the history query pipeline:

1. `getHistoryFn` in `src/server/history.ts` — add optional `bookId` parameter to filter by book
2. `historyListQuery` in `src/lib/queries/history.ts` — pass `bookId` through and include it in the query key for cache correctness
3. `HistoryTab` component — accept optional `bookId` prop and pass it into the query

Shows events: bookAdded, bookUpdated, bookGrabbed, bookFileAdded, bookFileRemoved.

### Edit Dialog

Simple dialog:

- Title: "Edit — {book title}"
- Single toggle: "Automatically switch edition" with description text explaining it re-evaluates the best edition during metadata imports
- Note: when a book has zero or one edition, the toggle still shows (it applies if new editions are discovered in future imports)
- Save/Cancel footer

### Delete Dialog

The existing `ConfirmDialog` does not support custom body content (children/checkboxes). Create a dedicated `BookDeleteDialog` component that uses the `Dialog` primitive from shadcn/ui directly (same pattern as the edit dialogs on other detail pages).

- Title: "Delete Book"
- Description: "This will permanently delete {book title} from your library."
- Two checkboxes:
  - "Delete book files from disk" (default unchecked, only shown if `fileCount > 0`)
  - "Prevent this book from being re-added during author refresh" (default checked, only shown if `foreignBookId` is not null — books without a Hardcover ID cannot be excluded since they aren't imported)
- Destructive confirm button with loading state
- On confirm: calls `deleteBookFn` with `{ id, deleteFiles, addImportExclusion }`. The server fn reads `foreignBookId`, `title`, and `authorName` from the book record before deletion — the client does not need to send them.

### Edge Cases

- **Deleting a book with no files**: "Delete book files" checkbox is hidden.
- **Deleting a book without `foreignBookId`**: "Prevent re-add" checkbox is hidden.
- **Deleting the last book under an author**: Author persists (no cascade). This is intentional — the author may still be monitored for future books.

## Edit Modal Enhancements

### Author Edit Modal

Currently only has `ProfileCheckboxGroup` for download profile selection.

Enhancement: for each selected profile, show a "Monitor New Books" dropdown inline with options All / None / New. The dropdown appears next to or below each checked profile. When a profile is unchecked, its monitor setting is hidden. Default for newly added profiles: `"all"`.

### TV Series Edit Modal

Currently has `ProfileCheckboxGroup`.

Two additions:

- Per-profile "Monitor New Seasons" dropdown (All / None / New), same inline pattern as the author modal
- "Use Season Folder" toggle at the bottom of the dialog, independent of profiles, applies to the whole show

### Movie Edit Modal

Currently has `ProfileCheckboxGroup`.

One addition:

- "Minimum Availability" dropdown at the bottom of the dialog (Released / Announced / In Cinemas), applies to the whole movie, not per-profile
- No schema or server function changes needed — `updateMovieSchema` already accepts `minimumAvailability`

### Shared Pattern

The per-profile dropdowns for authors and TV shows follow the same UX — a `Select` component rendered next to each profile checkbox. This could be a small extension to `ProfileCheckboxGroup` or a wrapper component that composes it. Toggling a profile on/off also manages the associated setting.

## Import Lists Settings Page

### Route

`/settings/import-lists` — added to the settings navigation config in `nav-config.ts` with a lucide-react icon (e.g., `ListPlus` or `Download`).

### Page Structure

- `PageHeader` with title "Import Lists" and description "Manage import lists and exclusions"
- Single section for now: **Import List Exclusions**
- Future: this page will host import list configuration (Hardcover lists, etc.)

### Exclusion Management UI

- Table showing all excluded books: Title, Author, Date Excluded
- Each row has a "Remove" button (with confirm) to un-exclude a book
- Empty state: "No excluded books" message
- Optional: bulk remove support

### Server Functions

- `getImportListExclusionsFn` — paginated list query
- `addImportListExclusionFn` — called from the book delete flow (server-side, within `deleteBookFn`)
- `removeImportListExclusionFn` — called from the management UI

### Import Check Integration

`refreshAuthorMetadataFn` in `src/server/import.ts` gets a check against `bookImportListExclusions` before adding/re-adding a book. If `foreignBookId` is in the exclusion list, skip it.

## Server Function & Mutation Updates

### Book

- `updateBookFn` — new server fn using `updateBookSchema`: `{ id, autoSwitchEdition }`.
- `deleteBookFn` — replace inline validator with `deleteBookSchema`: `{ id, deleteFiles, addImportExclusion }`. When `deleteFiles` is true, unlink book files from disk (same pattern as movie/show delete). When `addImportExclusion` is true, read `foreignBookId`/`title`/`authorName` from the book record and insert into `bookImportListExclusions` before deleting.
- New `useUpdateBook` mutation hook.

### Author

- `updateAuthorFn` — replace `updateAuthorSchema` to accept `{ id, downloadProfiles: Array<{ downloadProfileId, monitorNewBooks }> }`. The fn syncs the `authorDownloadProfiles` junction table: insert/update/delete rows as needed, setting `monitorNewBooks` on each.
- Update `useUpdateAuthor` mutation hook and all callers (author-form.tsx, $authorId.tsx, add-author flows).

### TV Show

- `updateShowFn` — replace `updateShowSchema` to accept `{ id, downloadProfiles: Array<{ downloadProfileId, monitorNewSeasons }>, useSeasonFolder, seriesType? }`. The fn syncs the `showDownloadProfiles` junction and updates `useSeasonFolder` on the show.
- Update `useUpdateShow` mutation hook and all callers (show-detail-header.tsx).

### Movie

- No server function or schema changes needed. `updateMovieFn` already accepts `minimumAvailability` via `updateMovieSchema`.
- UI-only change: expose the dropdown in the movie edit modal.

### Import Integration

- `refreshAuthorMetadataFn` — add exclusion check: query `bookImportListExclusions` for the author's books' `foreignBookId`s and skip any matches.
- When `autoSwitchEdition` is true on a book, re-run edition selection after metadata import finds new editions. No-op if the book has zero or one edition.

## Implementation Phases

1. **Schema migrations** — all DB changes (new table, new columns), new validators
2. **Book detail page** — ActionButtonGroup, Files tab, History tab (including query pipeline changes), Edit dialog, BookDeleteDialog
3. **Edit modal enhancements** — shared per-profile dropdown pattern, author (Monitor New Books), TV (Monitor New Seasons + Use Season Folder), movie (Minimum Availability UI only)
4. **Import Lists settings page** — route, nav config, exclusion management UI, server functions
5. **Import integration** — exclusion check in author refresh, auto-switch edition logic in metadata refresh
