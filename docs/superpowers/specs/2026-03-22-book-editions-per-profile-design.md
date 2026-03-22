# Book Editions Per Profile

Replace the flat editions table on the book detail page with profile-aware edition cards. Each download profile (ebook, audiobook) shows its selected edition, with auto-select and manual selection flows. Language preference moves from a global setting to per-profile.

## Schema Changes

### Download Profiles Table

Add two required columns to `download_profiles`:

| Column     | Type   | Default   | Notes                                 |
| ---------- | ------ | --------- | ------------------------------------- |
| `type`     | `text` | `"ebook"` | `"ebook"` or `"audiobook"`            |
| `language` | `text` | `"en"`    | Single language code, no "all" option |

Format mapping per type:

- `"ebook"` targets editions with format: `"Physical Book"`, `"E-Book"`, or `null`
- `"audiobook"` targets editions with format: `"Audiobook"`

Editions with `null` format are included in ebook results because Hardcover only returns `null` when no reading format record exists, which overwhelmingly correlates with physical/ebook editions. These editions are excluded from auto-select ranking (step 3 of selection logic) but shown in the modal when browsing.

### Migration

- Add `type` column with `DEFAULT 'ebook'` and `language` column with `DEFAULT 'en'` so existing rows get valid values
- The migration `DEFAULT` values handle existing rows. The default Ebook and Audiobook profiles created during `db:migrate` seeding get their types from these defaults. If a dedicated seed step is needed for the Audiobook profile (which needs `type: "audiobook"` instead of the default `"ebook"`), add it to the migration SQL
- Users with custom profiles will need to edit them after upgrading to set the correct type

### Edition-Profile Replacement Semantics

The current `editionDownloadProfiles` unique constraint is `(editionId, downloadProfileId)`, which allows multiple editions per book per profile. The new design requires **one edition per book per profile**.

Rather than add a `bookId` column to the junction table, enforce this at the application level: when selecting an edition for a profile (auto or manual), the server function must first delete all existing `editionDownloadProfiles` rows where the edition belongs to the same book and the `downloadProfileId` matches, then insert the new row. This keeps the schema simple and avoids denormalization.

### Metadata Profile

- Remove `allowedLanguages` from the `MetadataProfile` type, Zod schema, default value, and seed data
- Remove the "Allowed Languages" card from the metadata settings page (`src/routes/_authed/settings/metadata.tsx`)

**Behavioral change:** Users who previously had multiple allowed languages (e.g., `["en", "fr", "de"]`) will now need one profile per language they want to track. This is intentional — profiles are the unit of "what to search for," and tying language to profiles makes the model consistent.

## Edition Selection Logic

### `pickBestEditionForProfile(editions, profile)`

New function alongside the existing `pickBestEdition` (which is kept for display-only use on the author page). Accepts the full profile object (`{ language: string; type: "ebook" | "audiobook" }`):

1. Filter editions to those matching the profile's format type
2. Within filtered set: prefer `isDefaultCover` edition if it matches the profile's `language`
3. Within filtered set: next best by `usersCount` then `score` matching the `language` (caller must ensure editions are sorted, or the function sorts internally)
4. If no editions match the format: fall back to all editions — prefer `isDefaultCover` if language matches, then best by `usersCount`/`score` with language match
5. Final fallback: first edition by `usersCount`/`score` regardless of language

The existing `pickBestEdition(editions, language)` remains unchanged for display-only call sites on the author detail page and in `getPaginatedBooksFn`.

### Auto-Select (Icon Toggle)

When the user clicks the monitor icon button at the top of the book detail page:

- Client checks if this is toggle-on or toggle-off by inspecting `book.downloadProfileIds`
- **Toggle-on:** calls `monitorBookProfileFn` which runs `pickBestEditionForProfile` server-side and creates the junction record (replacing any existing edition for this book + profile)
- **Toggle-off:** opens the unmonitor confirmation dialog (client-side), which on confirm calls `unmonitorBookProfileFn`

### Manual Select (Modal)

User picks an edition explicitly from the selection modal. Calls `setEditionForProfileFn` which replaces the junction record for the chosen edition directly (deleting any prior edition for this book + profile first).

### Server Functions

| Function                 | Parameters                                   | Behavior                                                                           |
| ------------------------ | -------------------------------------------- | ---------------------------------------------------------------------------------- |
| `monitorBookProfileFn`   | `{ bookId, downloadProfileId }`              | Runs `pickBestEditionForProfile`, replaces junction record, records history        |
| `unmonitorBookProfileFn` | `{ bookId, downloadProfileId, deleteFiles }` | Removes junction record, optionally deletes associated book files, records history |
| `setEditionForProfileFn` | `{ editionId, downloadProfileId }`           | Replaces junction record (deletes prior edition for same book + profile first)     |

These replace the current `toggleBookProfileFn` and `toggleEditionProfileFn`.

## Editions Tab UI

### Profile Cards

Replace the current flat editions table with one card per author download profile.

**Monitored profile card:**

- Profile icon and name (e.g., book icon + "Ebook")
- Cover thumbnail of the selected edition
- Key metadata: title, publisher, format, pages/duration, language
- Identifiers: ISBN13, ASIN
- Reader count
- "Change" button: opens edition selection modal
- "Unmonitor" button: opens confirmation dialog

**Unmonitored profile card:**

- Profile icon and name (dimmed)
- Placeholder: "No edition selected"
- "Choose Edition" button: opens edition selection modal

**Ordering:** Monitored profiles first, then unmonitored.

### Data Loading

The `bookDetailQuery` (`getBookFn`) already returns all editions with their download profile IDs. The profile cards derive their selected edition from this data: for each author download profile, find the edition whose `downloadProfileIds` includes that profile's ID. No additional query needed.

## Edition Selection Modal

Opens from "Choose Edition" (unmonitored) or "Change" (monitored).

- Dialog title: "Select Edition for {Profile Name}"
- Reuses `BaseBookTable` with the same columns as the current editions tab
- Pre-filtered by the profile's format type (ebook formats or audiobook)
- Filter toggle: "Show matching formats only" (default on) / "Show all editions"
- Infinite scroll pagination
- Sortable columns

### BaseBookTable Changes

Add `selectedRowKey?: number | string` prop to highlight the currently selected row. `onRowClick` already exists on `BaseBookTable`. Both props are optional so existing usages are unaffected.

### Selection Flow

- Clicking a row highlights it (visual selected state)
- "Confirm" button at the bottom commits the selection
- If an edition is already selected, it is pre-highlighted when the modal opens
- Confirming calls `setEditionForProfileFn` which replaces the junction record
- No profile toggle icons in modal rows

## Unmonitor Confirmation Dialog

Triggered by "Unmonitor" on a profile card or toggling off a profile icon at the top of the page.

- Title: "Unmonitor {Profile Name}?"
- Description: "This will stop searching for {format type} editions of {Book Title}."
- If associated files exist for this book: checkbox "Also delete {n} associated file(s)" (unchecked by default)
- Cancel and Confirm buttons

File deletion scope: `bookFiles` has no format/type linkage, so the checkbox deletes **all** files for the book. The checkbox label reflects this: "Also delete {n} file(s) for this book." This is acceptable because file-to-format association would require schema changes beyond the scope of this feature.

On confirm:

- Calls `unmonitorBookProfileFn` with `deleteFiles` flag
- Server removes the `editionDownloadProfiles` junction record
- If `deleteFiles` is true: deletes all `bookFiles` rows for this book and removes files from disk
- Records history event
- Invalidates relevant queries

## Language Refactor

### New Helper: `getProfileLanguages()`

Reads all download profiles, returns deduplicated array of `language` values. Replaces all reads of `profile.allowedLanguages`.

### Call Sites to Update

- `src/server/import.ts` — `filterEditionsByProfile()`: change function signature to accept a `languages: string[]` parameter instead of reading `profile.allowedLanguages` internally. Callers pass the result of `getProfileLanguages()`. Other metadata profile fields (`skipMissingIsbnAsin`, `minimumPages`, etc.) remain on the metadata profile object
- `src/server/search.ts` — Hardcover search/import language filtering (multiple call sites): use `getProfileLanguages()`
- `src/routes/_authed/bookshelf/authors/$authorId.tsx` — available languages intersection: use aggregated profile languages

### Profile Language UI

- Download profile create/edit forms get a single language dropdown (single-select, not multi-select)
- Reuses existing language data source
- No "all" option

### Author Page Language Selector

Currently intersects author's available languages with global `allowedLanguages`. Refactored to intersect with the aggregated profile languages from `getProfileLanguages()`.
