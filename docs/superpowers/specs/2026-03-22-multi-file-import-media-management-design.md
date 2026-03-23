# Multi-File Import & Per-Type Media Management

**Date:** 2026-03-22
**Status:** Draft

## Problem

Allstarr's import pipeline treats all files identically — a 30-chapter MP3 audiobook gets the same treatment as a single EPUB. There's no part tracking, no audio metadata extraction, and no way to configure naming templates differently for ebooks vs. audiobooks. Readarr handles multi-file audiobooks with `Part`/`PartCount` fields and per-file metadata, and we need parity.

Additionally, Media Management settings (naming templates, extra file extensions) are global, but ebooks and audiobooks have fundamentally different naming needs (e.g., audiobooks need `{PartNumber}` tokens).

## Goals

1. Support multi-file audiobook imports with part numbering and metadata extraction
2. Extract and store per-file metadata (audio: duration/bitrate/codec; ebook: page count/language)
3. Split naming templates and extra file extensions per media type (ebook/audiobook)
4. Add system dependency health checks (ffprobe availability)
5. Ensure Dockerfile includes FFmpeg

## Non-Goals

- Audio tag-based file grouping (Readarr's `TrackGroupingService`) — unnecessary since we already know the book via `trackedDownloads.bookId`
- Full audio tag editing or correction
- Video format support (future work; ffprobe choice is forward-looking)

## Design

### 1. Database: `book_files` Schema Changes

Add columns to the existing `book_files` table via migration:

| Column        | Type    | Nullable | Description                                               |
| ------------- | ------- | -------- | --------------------------------------------------------- |
| `part`        | integer | yes      | Part number (1-indexed). Null for single-file imports.    |
| `part_count`  | integer | yes      | Total parts in this import set. Null for single-file.     |
| `duration`    | integer | yes      | Audio duration in seconds. Null for ebooks.               |
| `bitrate`     | integer | yes      | Audio bitrate in kbps. Null for ebooks.                   |
| `sample_rate` | integer | yes      | Audio sample rate in Hz. Null for ebooks.                 |
| `channels`    | integer | yes      | Audio channel count (1=mono, 2=stereo). Null for ebooks.  |
| `codec`       | text    | yes      | Codec name (e.g., "mp3", "aac", "flac"). Null for ebooks. |
| `page_count`  | integer | yes      | Page count from PDF/EPUB metadata. Null for audio.        |
| `language`    | text    | yes      | Language code from file metadata.                         |

All new columns are nullable with no default — existing rows remain unchanged.

The Drizzle schema in `src/db/schema/book-files.ts` adds corresponding fields:

```ts
part: integer("part"),
partCount: integer("part_count"),
duration: integer("duration"),
bitrate: integer("bitrate"),
sampleRate: integer("sample_rate"),
channels: integer("channels"),
codec: text("codec"),
pageCount: integer("page_count"),
language: text("language"),
```

### 2. Media Probe Module: `src/server/media-probe.ts`

New module wrapping `ffprobe` subprocess calls. Provides:

- `isProbeAvailable(): boolean` — cached check for `ffprobe` in `$PATH`. Runs `ffprobe -version` once and caches the result for the process lifetime.
- `probeAudioFile(filePath: string): Promise<AudioMeta | null>` — runs `ffprobe -v quiet -print_format json -show_format -show_streams <file>`, parses JSON output, returns `{ duration, bitrate, sampleRate, channels, codec }`. Returns null if ffprobe unavailable or file unreadable.
- `probeEbookFile(filePath: string): Promise<EbookMeta | null>` — extracts ebook metadata without ffprobe:
  - **EPUB:** EPUB files are ZIP archives. Use a lightweight pure-JS ZIP library (e.g., `adm-zip`) to read entries without native dependencies. Extract and parse `META-INF/container.xml` to locate the OPF file, then parse the OPF XML for `<dc:language>` (language) and `meta[name="calibre:page_count"]` (page count, present in Calibre-produced EPUBs). If page count metadata is absent, return null — EPUB page count is inherently unreliable since it depends on rendering.
  - **PDF:** Scan the binary for the page tree root's `/Count \d+` entry as a heuristic. PDF internal structure is complex (xref tables, catalog dictionaries), so this is a best-effort extraction. Returns null if the pattern isn't found or the file structure is non-standard.
  - Returns `{ pageCount, language }`. Returns null on any failure — ebook metadata is best-effort.

Types:

```ts
type AudioMeta = {
  duration: number; // seconds
  bitrate: number; // kbps
  sampleRate: number; // Hz
  channels: number;
  codec: string;
};

type EbookMeta = {
  pageCount: number | null;
  language: string | null;
};
```

Error handling: All probe functions catch errors internally and return null. Import proceeds regardless of probe success — metadata is additive, never blocking.

### 3. Import Pipeline Changes: `src/server/file-import.ts`

#### Part Numbering

In `importCompletedDownload()`, after `scanForBookFiles()`:

1. Separate files into audio files (`.mp3`, `.m4b`, `.flac`) and ebook files (`.pdf`, `.epub`, `.mobi`, `.azw3`, `.azw`) based on extension.
2. If there are multiple audio files, sort them by filename (natural sort to handle `Chapter 1`, `Chapter 2`, ..., `Chapter 10` correctly) and assign `part` = 1..N, `partCount` = N.
3. Single-file imports (whether ebook or audio) leave `part`/`partCount` as null.

#### Structural Refactor of Import Helpers

The current `importFile()` and `importRenamedFile()` functions perform the copy AND the `db.insert(bookFiles)` internally, returning only a boolean. To support metadata write-back, refactor these functions to return the inserted `bookFiles.id` and the destination path:

```ts
type ImportResult = { bookFileId: number | null; destPath: string } | null;
```

Both `importFile()` and `importRenamedFile()` return `ImportResult` (null on failure). The caller in `importFiles()` then uses the returned `destPath` and `bookFileId` to probe metadata and update the row.

#### File Batching by Type

In `importCompletedDownload()`, after scanning, split files into two typed batches based on extension:

- `audioFiles`: `.mp3`, `.m4b`, `.flac`
- `ebookFiles`: `.pdf`, `.epub`, `.mobi`, `.azw3`, `.azw`

Each batch is processed separately through `importFiles()`, which receives the media type as a parameter. This determines:

- Which naming template to use (`naming.ebook.*` vs `naming.audiobook.*`)
- Which extra file extensions to scan for
- Whether to assign `part`/`partCount` (audio batches with multiple files only)
- Which probe function to call (`probeAudioFile` vs `probeEbookFile`)

#### Metadata Extraction

After each file is copied/hardlinked (inside the `importFiles()` loop):

1. The import helper returns `{ bookFileId, destPath }`.
2. For audio files: call `probeAudioFile(destPath)` and `UPDATE book_files SET duration=?, bitrate=?, ... WHERE id=?`.
3. For ebook files: call `probeEbookFile(destPath)` and `UPDATE book_files SET page_count=?, language=? WHERE id=?`.
4. If probe returns null (ffprobe missing or parse failure), skip the update — metadata columns stay null.

#### Naming Template Resolution

When `renameBooks` is enabled, the media type (passed to `importFiles()`) determines which template to use:

- Audio batch: `naming.audiobook.bookFile`, `naming.audiobook.authorFolder`, `naming.audiobook.bookFolder`
- Ebook batch: `naming.ebook.bookFile`, `naming.ebook.authorFolder`, `naming.ebook.bookFolder`

Add `{PartNumber}` and `{PartCount}` to `namingVars` for audio batches. Support zero-padded format: `{PartNumber:00}` pads to 2 digits, `{PartNumber:000}` pads to 3. For ebook batches, these vars are empty strings.

#### Extra File Extensions

When building scan extensions, merge per-type settings based on which batches are present in the download. If the download contains audio files, include `mediaManagement.audiobook.extraFileExtensions`. If it contains ebook files, include `mediaManagement.ebook.extraFileExtensions`. Both lists are merged if the download contains both types.

#### Mixed Downloads (Ebook + Audio)

If a single download contains both ebook and audio files, they are processed as two independent batches. Each batch uses its own naming templates (for file names) and probe functions.

The destination directory (`destDir`) is computed **once** in `importCompletedDownload()` before either batch is processed, using the **ebook** folder templates (`naming.ebook.authorFolder`, `naming.ebook.bookFolder`) since ebooks are the primary content type. Both batches write to the same `destDir`. The `importFiles()` function receives the pre-computed `destDir` — it does not recompute folder paths from per-type templates. Only the **file naming** template (`naming.{type}.bookFile`) varies per batch.

### 4. Disk Scan Updates: `src/server/disk-scan.ts`

When `rescanRootFolder()` discovers files:

1. After creating/updating a `bookFile` record, probe the file for metadata if the existing record has null metadata fields.
2. For audio files within the same book directory, explicitly sort by filename (natural sort) before assigning `part`/`partCount`. Note: `fs.readdirSync()` returns entries in filesystem order which is not guaranteed to be alphabetical — an explicit `.sort()` is required.
3. This ensures existing libraries get metadata populated on rescan, not just new imports.

### 5. Media Management Settings

#### New Per-Type Settings Keys

**Ebook naming:**

- `naming.ebook.bookFile` — default: `{Author Name} - {Book Title}`
- `naming.ebook.authorFolder` — default: `{Author Name}`
- `naming.ebook.bookFolder` — default: `{Book Title} ({Release Year})`

**Audiobook naming:**

- `naming.audiobook.bookFile` — default: `{Author Name} - {Book Title} - Part {PartNumber:00}`
- `naming.audiobook.authorFolder` — default: `{Author Name}`
- `naming.audiobook.bookFolder` — default: `{Book Title} ({Release Year})`

**Per-type extra files:**

- `mediaManagement.ebook.extraFileExtensions` — default: `""`
- `mediaManagement.audiobook.extraFileExtensions` — default: `.cue,.nfo`

**Shared import extra files toggle:**

- `mediaManagement.importExtraFiles` — remains shared (global toggle)

#### Migration of Existing Settings

All settings values in the `settings` table are stored as JSON-encoded strings (e.g., `'"{Author Name}"'` not `'{Author Name}'`). The migration must preserve this encoding by copying the raw `value` column bytes as-is.

The migration in `0007_multi_file_metadata.sql` handles **both** existing installs and fresh installs:

1. For each old key (`naming.bookFile`, `naming.authorFolder`, `naming.bookFolder`, `mediaManagement.extraFileExtensions`), copy the raw `value` to the new per-type keys using `INSERT INTO settings ... SELECT`.
2. Delete the old keys.
3. Use `INSERT OR IGNORE` to seed defaults for all new keys — this covers fresh installs where old keys don't exist and the copy step produced no rows.

**Do NOT modify `drizzle/0000_puzzling_scarlet_spider.sql`.** That migration has already been applied on existing installs and won't re-run. All seeding for new keys happens in `0007`.

#### UI: Media Management Page

The "Book Naming" card in `src/routes/_authed/settings/media-management.tsx` adds ebook/audiobook tabs:

- Tabs inside the card header area: `Ebook | Audiobook`
- Each tab shows: Standard Book Format, Author Folder Format, Book Folder Format, Extra File Extensions
- The "Available tokens" hint for audiobook tab includes `{PartNumber}`, `{PartCount}`, `{PartNumber:00}`
- All other cards (Folders, Importing, File Management, Permissions, Root Folders) remain unchanged
- The `handleSave()` function must be updated to write the new per-type keys (`naming.ebook.*`, `naming.audiobook.*`, `mediaManagement.ebook.extraFileExtensions`, `mediaManagement.audiobook.extraFileExtensions`) and stop writing the old keys

### 6. Dockerfile

Add FFmpeg to the runtime stage:

```dockerfile
# In runtime stage, before COPY commands
RUN apk add --no-cache ffmpeg
```

This provides both `ffmpeg` and `ffprobe` binaries.

### 7. System Health Checks: `src/server/system-status.ts`

Add a `SystemDependencyCheck` to `runHealthChecks()`:

```ts
// Check system dependencies
// Note: Bun.spawnSync throws a system error when the binary is not in $PATH
// (unlike Node's child_process.spawnSync which returns {status: null, error: ...}).
// The try/catch is necessary to handle both "not found" (throws) and
// "found but failed" (non-zero exitCode) cases.
try {
  const result = Bun.spawnSync(["ffprobe", "-version"]);
  if (result.exitCode !== 0) {
    throw new Error("ffprobe returned non-zero exit code");
  }
} catch {
  checks.push({
    source: "SystemDependencyCheck",
    type: "warning",
    message:
      "FFmpeg is not installed. Audio and video metadata extraction will be unavailable. Install ffmpeg for full audiobook support.",
    wikiUrl: null,
  });
}
```

This pattern is extensible — additional system dependency checks can be added to the same block.

### 8. Naming Token Expansion

The `applyNamingTemplate()` function in `file-import.ts` needs to handle the new padded format syntax:

- `{PartNumber}` → raw number (e.g., `1`)
- `{PartNumber:00}` → zero-padded to 2 digits (e.g., `01`)
- `{PartNumber:000}` → zero-padded to 3 digits (e.g., `001`)
- `{PartCount}` → total parts (e.g., `15`)

Implementation: extend `applyNamingTemplate()` to detect `{Key:0+}` patterns via regex. The number of `0` characters after the colon equals the minimum output width — e.g., `{PartNumber:00}` → `padStart(2, "0")`, `{PartNumber:000}` → `padStart(3, "0")`. Process padded tokens first (via regex), then fall through to the existing `replaceAll` loop for plain `{Key}` tokens.

Note: The existing `namingVars` already includes `PartNumber: ""`. The refactored code should set `PartNumber` and `PartCount` per-batch: numeric strings for audio batches, empty strings for ebook batches.

## File Changes Summary

| File                                               | Change                                                        |
| -------------------------------------------------- | ------------------------------------------------------------- |
| `src/db/schema/book-files.ts`                      | Add part, metadata columns                                    |
| `drizzle/0007_multi_file_metadata.sql`             | Migration: new columns, settings migration, seed new defaults |
| `src/server/media-probe.ts`                        | New module: ffprobe wrapper + ebook metadata parser           |
| `src/server/file-import.ts`                        | Refactor helpers, file batching, metadata extraction, naming  |
| `src/server/disk-scan.ts`                          | Metadata extraction on rescan, explicit sort, part assignment |
| `src/server/system-status.ts`                      | Add SystemDependencyCheck for ffprobe                         |
| `src/routes/_authed/settings/media-management.tsx` | Ebook/Audiobook tabs in naming card, update handleSave        |
| `Dockerfile`                                       | Add `ffmpeg` package                                          |
