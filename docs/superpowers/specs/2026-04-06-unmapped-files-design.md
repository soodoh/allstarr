# Unmapped Files Feature — Design Spec

## Overview

Add an unmapped files management system that discovers files in root folders not linked to any library entity, persists them in the database, and provides a UI for users to map, ignore, or delete them. Works across all content types (books, movies, TV).

This also includes a data model refactor: adding `downloadProfileId` to all content file tables so files are associated with the download profile that manages them.

## Data Model

### New Table: `unmapped_files`

| Column           | Type              | Description                                                                 |
|------------------|-------------------|-----------------------------------------------------------------------------|
| `id`             | integer PK        | Auto-increment                                                              |
| `path`           | text, unique      | Absolute file path on disk                                                  |
| `size`           | integer           | File size in bytes                                                          |
| `rootFolderPath` | text              | Root folder this file was found in                                          |
| `contentType`    | text              | Inferred from the profile owning the root folder (`ebook`, `audiobook`, `movie`, `tv`) |
| `format`         | text              | Detected format/extension (e.g., `epub`, `mp3`, `mkv`)                      |
| `quality`        | JSON              | Quality match result (same `{quality, revision}` structure as content file tables) |
| `hints`          | JSON              | Parsed suggestions: `{title?, author?, year?, season?, episode?, source?}`  |
| `ignored`        | boolean           | Whether the user has chosen to hide this file (default false)               |
| `dateDiscovered` | text              | ISO timestamp of first discovery                                            |

- `path` is unique — rescans upsert, not duplicate.
- Rows are removed when the file no longer exists on disk during a rescan.
- `contentType` is inferred from the profile(s) owning the root folder. If multiple profiles share a root folder, they must have the same content type — this is an existing constraint since a root folder shouldn't mix ebooks and movies.

### Modified Tables: `book_files`, `movie_files`, `episode_files`

Add one column to each:

| Column              | Type                              | Description                                                      |
|---------------------|-----------------------------------|------------------------------------------------------------------|
| `downloadProfileId` | integer, FK → `download_profiles.id` | Which profile this file belongs to. Nullable for backwards compat with existing rows; required on new inserts. |

Existing rows get `downloadProfileId = null`. A backfill migration can set this based on matching the file's root folder path to profiles, but is not required for the feature to work.

## Disk Scan Changes

The existing `rescanRootFolder()` flow is extended with a second pass.

### Pass 1: Structured Matching (existing behavior, enhanced)

Walks the expected directory structure per content type:
- Books: `Author/Book Title (Year)/files`
- Movies: `Movie Title (Year)/files`
- TV: `Show Title/Season XX/files`

Matches files to DB entities as today. Enhancement: also sets `downloadProfileId` on matched files based on the profile that owns the root folder being scanned.

### Pass 2: Collect Unmapped Files

Walks the entire root folder tree and collects every supported media file that was not matched in Pass 1.

For each unmapped file, extract hints using three strategies (all fields optional):

1. **Path-based**: Parse parent directory names for patterns like `Author - Title`, `Title (Year)`, `Show S01E03`.
2. **Filename-based**: Parse the filename for naming conventions (e.g., `Movie.Title.2024.1080p.BluRay.mkv`, `Author - Book Title.epub`).
3. **Metadata-based**: For EPUBs, extract title/author from OPF metadata (ZIP + XML, cheap). For audio files with embedded tags, extract title/artist. Skip video probing (too expensive for bulk scan).

Store hints as JSON:
```json
{
  "title": "The Shining",
  "author": "Stephen King",
  "year": 2024,
  "season": 1,
  "episode": 3,
  "source": "filename"
}
```

### Upsert & Cleanup

- Insert new unmapped files, update size/quality/hints if changed on existing paths.
- Remove `unmapped_files` rows whose paths no longer exist on disk within the scanned root folder.
- Files that are now matched (previously unmapped but now resolved by a new author/book in the DB) should be removed from `unmapped_files` during Pass 1.

## Mapping Flow

When a user maps an unmapped file to an entity, a single server function handles the transaction:

### Input

- `unmappedFileId` — the file to map
- `entityType` — `"book"` | `"movie"` | `"episode"`
- `entityId` — target entity ID
- `downloadProfileId` — which profile to associate with

### Steps

1. **Validate** — Confirm unmapped file exists, entity exists, profile's content type matches file's content type.
2. **Probe metadata** — Run media probing now that the file matters: ffprobe for audio/video, EPUB parsing for ebooks. Extract duration, bitrate, page count, etc.
3. **Optionally rename/move** — If `renameBooks` (or equivalent per content type) is enabled in media management settings, move the file to the correct location per naming templates. Update the path accordingly.
4. **Insert into content file table** — Create row in `book_files`/`movie_files`/`episode_files` with entity FK, `downloadProfileId`, probed metadata, and quality info.
5. **Delete from `unmapped_files`** — Remove the staging row.
6. **Record history** — Add a `bookFileAdded`/`movieFileAdded`/`episodeFileAdded` history event.

### Multi-Part Audiobooks

When mapping multiple files to the same book+profile:
- UI lets user select multiple files and map them as a batch.
- Server assigns `part` numbers based on natural sort order of filenames.
- `partCount` is set to the total number of files in the batch.

### Inline Search (Adding New Entities)

The mapping dialog searches the local library first, then Hardcover (books) or TMDB (movies/TV). If the user selects an external result:
1. Run the existing add flow (`addAuthorHandler`/`addMovieHandler`/`addShowHandler`) to create the entity.
2. Map the file to the newly created entity.

## UI: Unmapped Files Page

### Route

`/library/unmapped-files` — accessible from the sidebar under a "Library" section.

### Sidebar

Badge count shows total non-ignored unmapped files.

```
Library
  ├── Unmapped Files (badge: 11)
Books
  ├── ...
Movies
  ├── ...
TV
  ├── ...
```

### Page Layout

**Toolbar:**
- Text filter (searches filename and path)
- Content type dropdown (All / Ebooks / Audiobooks / Movies / TV)
- "Show Ignored (N)" toggle button
- "Rescan All" button

**File List — Grouped by Root Folder:**

Each root folder is a section with:
- Header: folder path, profile name, file count, per-folder "Rescan" button
- File rows beneath

**File Row:**
- Checkbox for bulk selection
- Format badge (color-coded: blue for ebook, purple for audiobook, orange for video)
- Filename (primary text)
- Full path (secondary text, truncated)
- File size
- Hint suggestion (green if parsed, gray "No match suggested" if not)
- Action buttons: Map, Ignore, Delete

**Bulk Action Bar:**
Appears at the bottom when checkboxes are selected:
- "N files selected" count
- Map Selected, Ignore Selected, Delete Selected buttons

### Mapping Dialog

Opens when clicking "Map" on a file (or "Map Selected" for bulk):

- **File context** — format badge, filename, path, size
- **Profile selector** — dropdown defaulting to the root folder's profile
- **Search field** — pre-filled from hints if available, editable
- **Results split into two sections:**
  - "In Your Library" — local matches with "Map Here" button, shows existing file count
  - "From Hardcover/TMDB" — external search results with "Add & Map" button

### Actions

- **Map** — Opens mapping dialog. Associates file with entity + profile.
- **Ignore** — Sets `ignored = true`. File hidden from default view. Reversible via "Show Ignored" toggle.
- **Delete** — Confirmation dialog, then deletes file from disk and removes `unmapped_files` row.

## Supported File Extensions

Reuse existing extension lists per content type:
- **Ebook**: `.epub`, `.pdf`, `.mobi`, `.azw3`, `.azw`
- **Audio**: `.mp3`, `.m4b`, `.flac`
- **Video**: `.mkv`, `.mp4`, `.avi`, `.ts`

Additional extensions may be picked up via the `extraFileExtensions` media management setting per content type.

## Out of Scope

- Auto-mapping (automatically linking files without user confirmation)
- Scheduled/automatic rescans (users trigger manually via "Rescan" buttons; scheduled tasks can be added later)
- Backfill migration for existing `downloadProfileId` on old file rows (can be a follow-up)
