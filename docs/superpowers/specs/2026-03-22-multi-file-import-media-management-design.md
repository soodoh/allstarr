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
  - **EPUB:** Parse `content.opf` from the zip archive, read `<dc:language>` and count spine items or read `meta[name="calibre:page_count"]` if present.
  - **PDF:** Read the PDF header/trailer to extract `/Count` (page count) from the page tree root.
  - Returns `{ pageCount, language }`. Returns null on failure.

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

#### Metadata Extraction

After copying/hardlinking each file to the destination:

1. For audio files: call `probeAudioFile(destPath)` and store results on the `bookFile` row.
2. For ebook files: call `probeEbookFile(destPath)` and store results on the `bookFile` row.
3. If probe returns null (ffprobe missing or parse failure), the metadata columns stay null.

#### Naming Template Resolution

When `renameBooks` is enabled, determine the media type of each file by extension:

- Audio extensions (`.mp3`, `.m4b`, `.flac`): use `naming.audiobook.bookFile` template
- Ebook extensions (`.pdf`, `.epub`, `.mobi`, `.azw3`, `.azw`): use `naming.ebook.bookFile` template

Add `{PartNumber}` and `{PartCount}` to `namingVars`. Support zero-padded format: `{PartNumber:00}` pads to 2 digits, `{PartNumber:000}` pads to 3.

Similarly, use per-type author folder and book folder templates when building destination paths.

#### Extra File Extensions

When building scan extensions, read the per-type setting based on what file types are present in the download. If the download contains audio files, include `mediaManagement.audiobook.extraFileExtensions`. If it contains ebook files, include `mediaManagement.ebook.extraFileExtensions`.

### 4. Disk Scan Updates: `src/server/disk-scan.ts`

When `rescanRootFolder()` discovers files:

1. After creating/updating a `bookFile` record, probe the file for metadata if the existing record has null metadata fields.
2. For audio files within the same book directory, auto-assign `part`/`partCount` by sorted filename (same logic as import).
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

The database migration:

1. Reads existing values for `naming.bookFile`, `naming.authorFolder`, `naming.bookFolder`, and `mediaManagement.extraFileExtensions`.
2. Copies each value to both the `naming.ebook.*` and `naming.audiobook.*` variants.
3. Deletes the old keys.

If old keys don't exist (fresh install), the seed data creates the new keys with their defaults.

#### UI: Media Management Page

The "Book Naming" card in `src/routes/_authed/settings/media-management.tsx` adds ebook/audiobook tabs:

- Tabs inside the card header area: `Ebook | Audiobook`
- Each tab shows: Standard Book Format, Author Folder Format, Book Folder Format, Extra File Extensions
- The "Available tokens" hint for audiobook tab includes `{PartNumber}`, `{PartCount}`, `{PartNumber:00}`
- All other cards (Folders, Importing, File Management, Permissions, Root Folders) remain unchanged

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
try {
  const result = Bun.spawnSync(["ffprobe", "-version"]);
  if (result.exitCode !== 0) {
    throw new Error("ffprobe not found");
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

Implementation: extend `applyNamingTemplate()` to detect `{Key:0+}` patterns and apply `String.padStart()` with the appropriate length.

## File Changes Summary

| File                                               | Change                                               |
| -------------------------------------------------- | ---------------------------------------------------- |
| `src/db/schema/book-files.ts`                      | Add part, metadata columns                           |
| `drizzle/0007_multi_file_metadata.sql`             | Migration for new columns + settings migration       |
| `drizzle/0000_puzzling_scarlet_spider.sql`         | Update seed SQL with new naming keys                 |
| `src/server/media-probe.ts`                        | New module: ffprobe wrapper + ebook metadata parser  |
| `src/server/file-import.ts`                        | Part numbering, metadata extraction, per-type naming |
| `src/server/disk-scan.ts`                          | Metadata extraction on rescan, part assignment       |
| `src/server/system-status.ts`                      | Add SystemDependencyCheck for ffprobe                |
| `src/routes/_authed/settings/media-management.tsx` | Ebook/Audiobook tabs in naming card                  |
| `Dockerfile`                                       | Add `ffmpeg` package                                 |
