# Book Editions Per Profile

Replace the flat editions table on the book detail page with profile-aware edition cards. Each download profile (ebook, audiobook) shows its selected edition, with auto-select and manual selection flows. Language preference moves from a global setting to per-profile.

## Schema Changes

### Download Profiles Table

Add two required columns to `download_profiles`:

| Column     | Type   | Default  | Notes                                 |
| ---------- | ------ | -------- | ------------------------------------- |
| `type`     | `text` | required | `"ebook"` or `"audiobook"`            |
| `language` | `text` | `"en"`   | Single language code, no "all" option |

Format mapping per type:

- `"ebook"` targets editions with format: `"Physical Book"`, `"E-Book"`, or `null`
- `"audiobook"` targets editions with format: `"Audiobook"`

### Migration

- Add `type` and `language` columns with appropriate defaults for existing rows
- Update seed script: default Ebook profile gets `type: "ebook"`, Audiobook profile gets `type: "audiobook"`, both with `language: "en"`

### Metadata Profile

- Remove `allowedLanguages` from the `MetadataProfile` type, Zod schema, default value, and seed data
- Remove the "Allowed Languages" card from the metadata settings page (`src/routes/_authed/settings/metadata.tsx`)

## Edition Selection Logic

### `pickBestEdition(editions, profile)`

Refactor to accept the full profile object (`{ language: string; type: "ebook" | "audiobook" }`):

1. Filter editions to those matching the profile's format type
2. Within filtered set: prefer `isDefaultCover` edition if it matches the profile's `language`
3. Within filtered set: next best by `usersCount`/`score` matching the `language`
4. If no editions match the format: fall back to all editions — prefer `isDefaultCover` if language matches, then best by `usersCount`/`score` with language match
5. Final fallback: first edition by `usersCount`/`score` regardless of language

### Auto-Select (Icon Toggle)

When the user clicks the monitor icon button at the top of the book detail page:

- `toggleBookProfileFn` calls `pickBestEdition` with the toggled profile's `type` and `language`
- Creates an `editionDownloadProfiles` junction record for the selected edition
- If toggling off, triggers the unmonitor confirmation flow instead

### Manual Select (Modal)

User picks an edition explicitly from the selection modal. No `pickBestEdition` involved — inserts the junction record for the chosen edition directly.

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

## Edition Selection Modal

Opens from "Choose Edition" (unmonitored) or "Change" (monitored).

- Dialog title: "Select Edition for {Profile Name}"
- Reuses `BaseBookTable` with the same columns as the current editions tab
- Pre-filtered by the profile's format type (ebook formats or audiobook)
- Filter toggle: "Show matching formats only" (default on) / "Show all editions"
- Infinite scroll pagination
- Sortable columns

### Selection Flow

- Clicking a row highlights it (visual selected state)
- "Confirm" button at the bottom commits the selection
- If an edition is already selected, it is pre-highlighted when the modal opens
- Confirming creates or replaces the `editionDownloadProfiles` junction record
- No profile toggle icons in modal rows

## Unmonitor Confirmation Dialog

Triggered by "Unmonitor" on a profile card or toggling off a profile icon at the top of the page.

- Title: "Unmonitor {Profile Name}?"
- Description: "This will stop searching for {format type} editions of {Book Title}."
- If associated files exist for this format type: checkbox "Also delete {n} associated file(s)" (unchecked by default)
- Cancel and Confirm buttons

On confirm:

- Removes the `editionDownloadProfiles` junction record
- If file deletion checked: deletes associated book files
- Invalidates relevant queries

## Language Refactor

### New Helper: `getProfileLanguages()`

Reads all download profiles, returns deduplicated array of `language` values. Replaces all reads of `profile.allowedLanguages`.

### Call Sites to Update

- `src/server/import.ts` — `filterEditionsByProfile()`: use `getProfileLanguages()` instead of `profile.allowedLanguages`
- `src/server/search.ts` — Hardcover search/import language filtering (multiple call sites): use `getProfileLanguages()`
- `src/routes/_authed/bookshelf/authors/$authorId.tsx` — available languages intersection: use aggregated profile languages

### Profile Language UI

- Download profile create/edit forms get a single language dropdown (single-select, not multi-select)
- Reuses existing language data source
- No "all" option

### Author Page Language Selector

Currently intersects author's available languages with global `allowedLanguages`. Refactored to intersect with the aggregated profile languages from `getProfileLanguages()`.
