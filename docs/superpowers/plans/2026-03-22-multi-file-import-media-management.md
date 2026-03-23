# Multi-File Import & Per-Type Media Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add multi-file audiobook import support with part tracking, ffprobe metadata extraction, per-type naming templates, and system dependency health checks.

**Architecture:** Extend `book_files` schema with part/metadata columns. New `media-probe.ts` module wraps ffprobe for audio and parses EPUB/PDF for ebook metadata. Refactor `file-import.ts` to batch files by type (ebook/audio), probe metadata after import, and use per-type naming templates. Media Management UI gets ebook/audiobook tabs in the naming card.

**Tech Stack:** Bun runtime, SQLite/Drizzle ORM, ffprobe (via subprocess), adm-zip (EPUB parsing), TanStack Start, shadcn/ui Tabs

**Spec:** `docs/superpowers/specs/2026-03-22-multi-file-import-media-management-design.md`

---

## File Structure

| File                                               | Responsibility                                                                   |
| -------------------------------------------------- | -------------------------------------------------------------------------------- |
| `src/db/schema/book-files.ts`                      | Add part, metadata columns to Drizzle schema                                     |
| `drizzle/0007_multi_file_metadata.sql`             | Migration: new columns + settings key migration + seed defaults                  |
| `drizzle/meta/_journal.json`                       | Register migration 0007                                                          |
| `src/server/media-probe.ts`                        | New: ffprobe wrapper, EPUB/PDF metadata parser, `isProbeAvailable()`             |
| `src/server/file-import.ts`                        | Refactor: ImportResult type, file batching, metadata extraction, per-type naming |
| `src/server/disk-scan.ts`                          | Add metadata probing on rescan, explicit sort for part assignment                |
| `src/server/system-status.ts`                      | Add SystemDependencyCheck for ffprobe                                            |
| `src/routes/_authed/settings/media-management.tsx` | Ebook/Audiobook tabs in naming card, update handleSave                           |
| `Dockerfile`                                       | Add `ffmpeg` package to runtime stage                                            |

---

### Task 1: Database Schema & Migration

**Files:**

- Modify: `src/db/schema/book-files.ts`
- Create: `drizzle/0007_multi_file_metadata.sql`
- Modify: `drizzle/meta/_journal.json`

- [ ] **Step 1: Add columns to Drizzle schema**

In `src/db/schema/book-files.ts`, add these fields to the `bookFiles` table definition, after the existing `dateAdded` column:

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

- [ ] **Step 2: Create migration SQL**

Create `drizzle/0007_multi_file_metadata.sql`:

```sql
-- Add part tracking and metadata columns to book_files
ALTER TABLE book_files ADD COLUMN part INTEGER;
ALTER TABLE book_files ADD COLUMN part_count INTEGER;
ALTER TABLE book_files ADD COLUMN duration INTEGER;
ALTER TABLE book_files ADD COLUMN bitrate INTEGER;
ALTER TABLE book_files ADD COLUMN sample_rate INTEGER;
ALTER TABLE book_files ADD COLUMN channels INTEGER;
ALTER TABLE book_files ADD COLUMN codec TEXT;
ALTER TABLE book_files ADD COLUMN page_count INTEGER;
ALTER TABLE book_files ADD COLUMN language TEXT;

-- Migrate existing naming settings to per-type keys
-- Settings values are JSON-encoded (e.g., '"{Author Name}"') — copy raw bytes as-is
INSERT INTO settings (key, value) SELECT 'naming.ebook.bookFile', value FROM settings WHERE key = 'naming.bookFile';
INSERT INTO settings (key, value) SELECT 'naming.audiobook.bookFile', value FROM settings WHERE key = 'naming.bookFile';
INSERT INTO settings (key, value) SELECT 'naming.ebook.authorFolder', value FROM settings WHERE key = 'naming.authorFolder';
INSERT INTO settings (key, value) SELECT 'naming.audiobook.authorFolder', value FROM settings WHERE key = 'naming.authorFolder';
INSERT INTO settings (key, value) SELECT 'naming.ebook.bookFolder', value FROM settings WHERE key = 'naming.bookFolder';
INSERT INTO settings (key, value) SELECT 'naming.audiobook.bookFolder', value FROM settings WHERE key = 'naming.bookFolder';
INSERT INTO settings (key, value) SELECT 'mediaManagement.ebook.extraFileExtensions', value FROM settings WHERE key = 'mediaManagement.extraFileExtensions';
INSERT INTO settings (key, value) SELECT 'mediaManagement.audiobook.extraFileExtensions', value FROM settings WHERE key = 'mediaManagement.extraFileExtensions';

-- Delete old keys
DELETE FROM settings WHERE key IN ('naming.bookFile', 'naming.authorFolder', 'naming.bookFolder', 'mediaManagement.extraFileExtensions');

-- Seed defaults for fresh installs (INSERT OR IGNORE skips if rows already exist from copy above)
INSERT OR IGNORE INTO settings (key, value) VALUES ('naming.ebook.bookFile', '"{Author Name} - {Book Title}"');
INSERT OR IGNORE INTO settings (key, value) VALUES ('naming.ebook.authorFolder', '"{Author Name}"');
INSERT OR IGNORE INTO settings (key, value) VALUES ('naming.ebook.bookFolder', '"{Book Title} ({Release Year})"');
INSERT OR IGNORE INTO settings (key, value) VALUES ('naming.audiobook.bookFile', '"{Author Name} - {Book Title} - Part {PartNumber:00}"');
INSERT OR IGNORE INTO settings (key, value) VALUES ('naming.audiobook.authorFolder', '"{Author Name}"');
INSERT OR IGNORE INTO settings (key, value) VALUES ('naming.audiobook.bookFolder', '"{Book Title} ({Release Year})"');
INSERT OR IGNORE INTO settings (key, value) VALUES ('mediaManagement.ebook.extraFileExtensions', '""');
INSERT OR IGNORE INTO settings (key, value) VALUES ('mediaManagement.audiobook.extraFileExtensions', '".cue,.nfo"');
```

- [ ] **Step 3: Register migration in journal**

Add entry to `drizzle/meta/_journal.json` entries array:

```json
{
  "idx": 7,
  "version": "6",
  "when": 1774224000000,
  "tag": "0007_multi_file_metadata",
  "breakpoints": true
}
```

- [ ] **Step 4: Apply migration**

Run: `bun run db:migrate`
Expected: Migration applies cleanly. Verify with: `bun run db:studio` — check `book_files` has new columns, `settings` has new per-type keys and old keys are gone.

- [ ] **Step 5: Commit**

```bash
git add src/db/schema/book-files.ts drizzle/0007_multi_file_metadata.sql drizzle/meta/_journal.json
git commit -m "feat: add book_files metadata columns and per-type naming settings migration"
```

---

### Task 2: Media Probe Module

**Files:**

- Create: `src/server/media-probe.ts`

**Dependencies:** Requires `adm-zip` package for EPUB parsing.

- [ ] **Step 1: Install adm-zip**

Run: `bun add adm-zip && bun add -d @types/adm-zip`

- [ ] **Step 2: Create media-probe.ts**

Create `src/server/media-probe.ts`. This module has three public functions:

```ts
// oxlint-disable no-console -- Media probe logs are intentional server-side diagnostics
import AdmZip from "adm-zip";
import fs from "node:fs";

// ─── Types ──────────────────────────────────────────────────────────────────

export type AudioMeta = {
  duration: number; // seconds
  bitrate: number; // kbps
  sampleRate: number; // Hz
  channels: number;
  codec: string;
};

export type EbookMeta = {
  pageCount: number | null;
  language: string | null;
};

// ─── ffprobe availability ───────────────────────────────────────────────────

let probeAvailable: boolean | null = null;

/** Check if ffprobe is available in $PATH. Result is cached for process lifetime. */
export function isProbeAvailable(): boolean {
  if (probeAvailable !== null) {
    return probeAvailable;
  }
  try {
    const result = Bun.spawnSync(["ffprobe", "-version"]);
    probeAvailable = result.exitCode === 0;
  } catch {
    // Bun.spawnSync throws when binary is not in $PATH
    probeAvailable = false;
  }
  return probeAvailable;
}

// ─── Audio probing ──────────────────────────────────────────────────────────

/** Extract audio metadata from a file using ffprobe. Returns null if unavailable. */
export async function probeAudioFile(
  filePath: string,
): Promise<AudioMeta | null> {
  if (!isProbeAvailable()) {
    return null;
  }

  try {
    const proc = Bun.spawn([
      "ffprobe",
      "-v",
      "quiet",
      "-print_format",
      "json",
      "-show_format",
      "-show_streams",
      filePath,
    ]);
    const output = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;
    if (exitCode !== 0) {
      return null;
    }

    const data = JSON.parse(output) as {
      format?: { duration?: string; bit_rate?: string };
      streams?: Array<{
        codec_type?: string;
        codec_name?: string;
        sample_rate?: string;
        channels?: number;
      }>;
    };

    const audioStream = data.streams?.find((s) => s.codec_type === "audio");

    return {
      duration: Math.round(Number(data.format?.duration ?? 0)),
      bitrate: Math.round(Number(data.format?.bit_rate ?? 0) / 1000),
      sampleRate: Number(audioStream?.sample_rate ?? 0),
      channels: audioStream?.channels ?? 0,
      codec: audioStream?.codec_name ?? "unknown",
    };
  } catch (error) {
    console.warn(
      `[media-probe] Failed to probe audio "${filePath}": ${error instanceof Error ? error.message : "Unknown error"}`,
    );
    return null;
  }
}

// ─── Ebook probing ──────────────────────────────────────────────────────────

/** Extract metadata from an EPUB file (ZIP archive with OPF manifest). */
function probeEpub(filePath: string): EbookMeta | null {
  try {
    const zip = new AdmZip(filePath);

    // Find OPF file via container.xml
    const containerEntry = zip.getEntry("META-INF/container.xml");
    if (!containerEntry) {
      return null;
    }
    const containerXml = containerEntry.getData().toString("utf8");

    // Extract rootfile path from container.xml
    const rootfileMatch = containerXml.match(/full-path="([^"]+)"/);
    if (!rootfileMatch) {
      return null;
    }

    const opfEntry = zip.getEntry(rootfileMatch[1]);
    if (!opfEntry) {
      return null;
    }
    const opfXml = opfEntry.getData().toString("utf8");

    // Extract language from <dc:language>
    const langMatch = opfXml.match(/<dc:language[^>]*>([^<]+)<\/dc:language>/i);
    const language = langMatch ? langMatch[1].trim() : null;

    // Extract page count from Calibre metadata
    const pageCountMatch = opfXml.match(
      /<meta\s+name="calibre:page_count"\s+content="(\d+)"/i,
    );
    const pageCount = pageCountMatch ? Number(pageCountMatch[1]) : null;

    return { pageCount, language };
  } catch {
    return null;
  }
}

/** Extract page count from a PDF by scanning for /Count in the page tree. Best-effort heuristic. */
function probePdf(filePath: string): EbookMeta | null {
  try {
    // Read first 64KB — page tree root is typically near the start
    const fd = fs.openSync(filePath, "r");
    const buffer = Buffer.alloc(65536);
    const bytesRead = fs.readSync(fd, buffer, 0, buffer.length, 0);
    fs.closeSync(fd);

    const content = buffer.subarray(0, bytesRead).toString("latin1");

    // Look for /Type /Pages ... /Count N pattern
    const countMatch = content.match(/\/Type\s*\/Pages[^>]*\/Count\s+(\d+)/);
    const pageCount = countMatch ? Number(countMatch[1]) : null;

    // PDF language is in the document catalog /Lang entry
    const langMatch = content.match(/\/Lang\s*\(([^)]+)\)/);
    const language = langMatch ? langMatch[1].trim() : null;

    return { pageCount, language };
  } catch {
    return null;
  }
}

/** Extract ebook metadata. Works without ffprobe. Returns null on failure. */
export function probeEbookFile(filePath: string): EbookMeta | null {
  const ext = filePath.toLowerCase();
  if (ext.endsWith(".epub")) {
    return probeEpub(filePath);
  }
  if (ext.endsWith(".pdf")) {
    return probePdf(filePath);
  }
  // MOBI, AZW3, AZW — no lightweight parser available, return null
  return null;
}
```

- [ ] **Step 3: Verify module compiles**

Run: `bun build src/server/media-probe.ts --no-bundle --outdir /tmp/probe-check`
Expected: No compilation errors.

- [ ] **Step 4: Commit**

```bash
git add src/server/media-probe.ts package.json bun.lock
git commit -m "feat: add media-probe module for ffprobe audio and ebook metadata extraction"
```

---

### Task 3: Refactor file-import.ts — Import Helpers & Naming

**Files:**

- Modify: `src/server/file-import.ts`

This task refactors the import helpers and adds per-type naming. It does NOT add metadata extraction yet (that's Task 4).

- [ ] **Step 1: Add ImportResult type and media type constants**

At the top of `src/server/file-import.ts`, after the existing imports, add the media-probe import and type constants:

```ts
import { probeAudioFile, probeEbookFile } from "./media-probe";

type ImportResult = {
  bookFileId: number | null;
  destPath: string;
} | null;

const AUDIO_EXTENSIONS = new Set([".mp3", ".m4b", ".flac"]);
const EBOOK_EXTENSIONS = new Set([".pdf", ".epub", ".mobi", ".azw3", ".azw"]);

type MediaType = "ebook" | "audiobook";

function getMediaType(filePath: string): MediaType {
  const ext = path.extname(filePath).toLowerCase();
  return AUDIO_EXTENSIONS.has(ext) ? "audiobook" : "ebook";
}
```

- [ ] **Step 2: Update applyNamingTemplate to support padded tokens**

Replace the existing `applyNamingTemplate()` function:

```ts
function applyNamingTemplate(
  template: string,
  vars: Record<string, string>,
): string {
  // First pass: handle padded tokens like {PartNumber:00}
  // The number of 0 chars after the colon = minimum output width
  let result = template.replaceAll(
    /\{([\w\s]+):(0+)\}/g,
    (_match, key: string, zeros: string) => {
      const value = vars[key.trim()] ?? "";
      return value ? value.padStart(zeros.length, "0") : "";
    },
  );
  // Second pass: handle plain tokens like {Author Name}
  for (const [key, value] of Object.entries(vars)) {
    result = result.replaceAll(`{${key}}`, value);
  }
  return result;
}
```

- [ ] **Step 3: Refactor importFile() to return ImportResult**

Replace the existing `importFile()` function. Key changes: return `ImportResult` instead of `boolean`, and add `part`/`partCount` params:

```ts
function importFile(
  filePath: string,
  destDir: string,
  bookId: number | null,
  useHardLinks: boolean,
  applyPermissions: boolean,
  fileChmod: string,
  part: number | null,
  partCount: number | null,
): ImportResult {
  const filename = path.basename(filePath);
  const destPath = path.join(destDir, filename);

  try {
    if (useHardLinks) {
      try {
        fs.linkSync(filePath, destPath);
      } catch {
        fs.copyFileSync(filePath, destPath);
      }
    } else {
      fs.copyFileSync(filePath, destPath);
    }

    if (applyPermissions && fileChmod) {
      fs.chmodSync(destPath, Number.parseInt(fileChmod, 8));
    }

    const quality = matchFormat({
      title: filename,
      size: fs.statSync(filePath).size,
      indexerFlags: 0,
    });

    if (bookId) {
      const inserted = db
        .insert(bookFiles)
        .values({
          bookId,
          path: destPath,
          size: fs.statSync(destPath).size,
          quality: {
            quality: { id: quality.id, name: quality.name },
            revision: { version: 1, real: 0 },
          },
          part,
          partCount,
        })
        .returning({ id: bookFiles.id })
        .get();
      return { bookFileId: inserted.id, destPath };
    }

    return { bookFileId: null, destPath };
  } catch (error) {
    console.error(
      `[file-import] Failed to import ${filename}: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
    return null;
  }
}
```

- [ ] **Step 4: Refactor importRenamedFile() to return ImportResult**

Same pattern as importFile — add `part`/`partCount` params, return `ImportResult`:

```ts
function importRenamedFile(
  filePath: string,
  destDir: string,
  newName: string,
  bookId: number | null,
  cfg: ImportSettings,
  part: number | null,
  partCount: number | null,
): ImportResult {
  const destPath = path.join(destDir, newName);
  try {
    if (cfg.useHardLinks) {
      try {
        fs.linkSync(filePath, destPath);
      } catch {
        fs.copyFileSync(filePath, destPath);
      }
    } else {
      fs.copyFileSync(filePath, destPath);
    }
    if (cfg.applyPermissions && cfg.fileChmod) {
      fs.chmodSync(destPath, Number.parseInt(cfg.fileChmod, 8));
    }
    const quality = matchFormat({
      title: path.basename(destPath),
      size: fs.statSync(filePath).size,
      indexerFlags: 0,
    });
    if (bookId) {
      const inserted = db
        .insert(bookFiles)
        .values({
          bookId,
          path: destPath,
          size: fs.statSync(destPath).size,
          quality: {
            quality: { id: quality.id, name: quality.name },
            revision: { version: 1, real: 0 },
          },
          part,
          partCount,
        })
        .returning({ id: bookFiles.id })
        .get();
      return { bookFileId: inserted.id, destPath };
    }
    return { bookFileId: null, destPath };
  } catch (error) {
    console.error(
      `[file-import] Failed to import ${path.basename(filePath)}: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
    return null;
  }
}
```

- [ ] **Step 5: Refactor importFiles() to accept media type, do batched processing with metadata**

Replace the existing `importFiles()` function. It now accepts a `mediaType` parameter, uses per-type naming, assigns part numbers for audio batches, and probes metadata:

```ts
/** Natural sort comparator for filenames (handles "Chapter 1" vs "Chapter 10") */
function naturalCompare(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}

async function importFiles(
  files: string[],
  destDir: string,
  bookId: number | null,
  namingVars: Record<string, string>,
  cfg: ImportSettings,
  mediaType: MediaType,
): Promise<number> {
  // Sort files for deterministic part numbering
  const sorted = [...files].sort((a, b) =>
    naturalCompare(path.basename(a), path.basename(b)),
  );

  // Assign part numbers for multi-file audio imports
  const isMultiPart = mediaType === "audiobook" && sorted.length > 1;
  const partCount = isMultiPart ? sorted.length : null;

  // Get per-type naming template
  const templateKey =
    mediaType === "audiobook"
      ? "naming.audiobook.bookFile"
      : "naming.ebook.bookFile";
  const defaultTemplate =
    mediaType === "audiobook"
      ? "{Author Name} - {Book Title} - Part {PartNumber:00}"
      : "{Author Name} - {Book Title}";

  let count = 0;
  for (let i = 0; i < sorted.length; i += 1) {
    const filePath = sorted[i];
    const part = isMultiPart ? i + 1 : null;

    // Set part vars for this file
    const fileVars = {
      ...namingVars,
      PartNumber: part ? String(part) : "",
      PartCount: partCount ? String(partCount) : "",
    };

    let result: ImportResult;
    if (cfg.renameBooks) {
      const template = getMediaSetting(templateKey, defaultTemplate);
      const ext = path.extname(filePath);
      const newName =
        sanitizePath(applyNamingTemplate(template, fileVars)) + ext;
      result = importRenamedFile(
        filePath,
        destDir,
        newName,
        bookId,
        cfg,
        part,
        partCount,
      );
    } else {
      result = importFile(
        filePath,
        destDir,
        bookId,
        cfg.useHardLinks,
        cfg.applyPermissions,
        cfg.fileChmod,
        part,
        partCount,
      );
    }

    if (result) {
      count += 1;

      // Probe metadata and write back to the bookFile row
      if (result.bookFileId) {
        if (mediaType === "audiobook") {
          const meta = await probeAudioFile(result.destPath);
          if (meta) {
            db.update(bookFiles)
              .set({
                duration: meta.duration,
                bitrate: meta.bitrate,
                sampleRate: meta.sampleRate,
                channels: meta.channels,
                codec: meta.codec,
              })
              .where(eq(bookFiles.id, result.bookFileId))
              .run();
          }
        } else {
          const meta = probeEbookFile(result.destPath);
          if (meta) {
            db.update(bookFiles)
              .set({
                pageCount: meta.pageCount,
                language: meta.language,
              })
              .where(eq(bookFiles.id, result.bookFileId))
              .run();
          }
        }
      }
    }
  }
  return count;
}
```

- [ ] **Step 6: Update importCompletedDownload() for file batching and per-type folders**

In `importCompletedDownload()`, replace the section from the `namingVars` declaration through the `importFiles()` call. The key changes are:

1. Use ebook folder templates for `destDir` computation.
2. Split files into audio and ebook batches.
3. Build per-type extra file extension sets.
4. Call `importFiles()` once per batch.

Find the line:

```ts
const importedCount = importFiles(files, destDir, td.bookId, namingVars, cfg);
```

Replace the block from `const namingVars` through `const importedCount = importFiles(...)` with:

```ts
const namingVars: Record<string, string> = {
  "Author Name": authorName,
  "Book Title": bookTitle,
  "Release Year": year ? String(year) : "",
  "Book Series": "",
  "Book SeriesPosition": "",
  PartNumber: "",
  PartCount: "",
};

const authorFolderName = sanitizePath(
  applyNamingTemplate(
    getMediaSetting("naming.ebook.authorFolder", "{Author Name}"),
    namingVars,
  ),
);
const bookFolderName = sanitizePath(
  applyNamingTemplate(
    getMediaSetting("naming.ebook.bookFolder", "{Book Title} ({Release Year})"),
    namingVars,
  ),
);

const destDir = path.join(rootFolderPath, authorFolderName, bookFolderName);
fs.mkdirSync(destDir, { recursive: true });

if (cfg.applyPermissions && cfg.folderChmod) {
  fs.chmodSync(destDir, Number.parseInt(cfg.folderChmod, 8));
}

// Split files by media type
const audioFiles = files.filter((f) =>
  AUDIO_EXTENSIONS.has(path.extname(f).toLowerCase()),
);
const ebookFiles = files.filter((f) =>
  EBOOK_EXTENSIONS.has(path.extname(f).toLowerCase()),
);

let importedCount = 0;
if (ebookFiles.length > 0) {
  importedCount += await importFiles(
    ebookFiles,
    destDir,
    td.bookId,
    namingVars,
    cfg,
    "ebook",
  );
}
if (audioFiles.length > 0) {
  importedCount += await importFiles(
    audioFiles,
    destDir,
    td.bookId,
    namingVars,
    cfg,
    "audiobook",
  );
}
```

Also remove `extraFileExtensions` from the `ImportSettings` type and `readImportSettings()` — this field is now dead since per-type settings are read directly in `buildScanExtensions()`. Remove the `extraFileExtensions` property from the `ImportSettings` type and the corresponding `getMediaSetting("mediaManagement.extraFileExtensions", "")` line from `readImportSettings()`.

Then update `buildScanExtensions()` to use per-type extra file extensions (it no longer uses `cfg.extraFileExtensions`):

```ts
function buildScanExtensions(cfg: ImportSettings): Set<string> {
  const extensions = new Set(SUPPORTED_EXTENSIONS);
  if (cfg.importExtraFiles) {
    const ebookExtra = getMediaSetting(
      "mediaManagement.ebook.extraFileExtensions",
      "",
    );
    const audioExtra = getMediaSetting(
      "mediaManagement.audiobook.extraFileExtensions",
      "",
    );
    for (const extStr of [ebookExtra, audioExtra]) {
      for (const ext of extStr.split(",")) {
        const trimmed = ext.trim();
        if (trimmed) {
          extensions.add(trimmed.startsWith(".") ? trimmed : `.${trimmed}`);
        }
      }
    }
  }
  return extensions;
}
```

Since `importFiles()` is now async, update `importCompletedDownload()` — it's already async so just add `await` to the calls.

- [ ] **Step 7: Verify build**

Run: `bun run build`
Expected: Builds without errors.

- [ ] **Step 8: Commit**

```bash
git add src/server/file-import.ts
git commit -m "feat: refactor import pipeline for file batching, part numbering, and metadata extraction"
```

---

### Task 4: Disk Scan Updates

**Files:**

- Modify: `src/server/disk-scan.ts`

- [ ] **Step 1: Add imports and media type constants**

At the top of `src/server/disk-scan.ts`, add:

```ts
import { probeAudioFile, probeEbookFile } from "src/server/media-probe";
```

Also add the extension sets (or import from a shared location — for now, duplicate since they're small):

```ts
const AUDIO_EXTENSIONS = new Set([".mp3", ".m4b", ".flac"]);
```

- [ ] **Step 2: Update scanBookDirectory to sort files and assign parts**

In `scanBookDirectory()`, after getting the `files` list from `readdirSync`, add explicit sorting and part assignment for audio files:

```ts
function scanBookDirectory(
  bookPath: string,
  bookId: number,
  discoveredFiles: Map<string, DiscoveredFile>,
  stats: ScanStats,
): void {
  let files: fs.Dirent[];
  try {
    files = fs
      .readdirSync(bookPath, { withFileTypes: true })
      .filter((e) => e.isFile() && isBookFile(e.name));
  } catch {
    return;
  }

  // Sort by name for deterministic part assignment
  files.sort((a, b) =>
    a.name.localeCompare(b.name, undefined, {
      numeric: true,
      sensitivity: "base",
    }),
  );

  // Count audio files for part assignment
  const audioFiles = files.filter((f) =>
    AUDIO_EXTENSIONS.has(path.extname(f.name).toLowerCase()),
  );
  const isMultiPartAudio = audioFiles.length > 1;
  let audioIndex = 0;

  for (const file of files) {
    const absolutePath = path.join(bookPath, file.name);
    const ext = path.extname(file.name).toLowerCase();
    const isAudio = AUDIO_EXTENSIONS.has(ext);

    try {
      const fileStat = fs.statSync(absolutePath);
      const quality = matchFormat({
        title: file.name,
        size: fileStat.size,
        indexerFlags: null,
      });

      let part: number | null = null;
      let partCount: number | null = null;
      if (isAudio && isMultiPartAudio) {
        audioIndex += 1;
        part = audioIndex;
        partCount = audioFiles.length;
      }

      discoveredFiles.set(absolutePath, {
        absolutePath,
        bookId,
        size: fileStat.size,
        quality: {
          quality: { id: quality.id, name: quality.name },
          revision: { version: 1, real: 0 },
        },
        part,
        partCount,
      });
    } catch (error) {
      stats.errors.push(
        `Could not stat file ${absolutePath}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
```

- [ ] **Step 3: Update DiscoveredFile type to include part fields**

```ts
type DiscoveredFile = {
  absolutePath: string;
  bookId: number;
  size: number;
  quality: {
    quality: { id: number; name: string };
    revision: { version: number; real: number };
  };
  part: number | null;
  partCount: number | null;
};
```

- [ ] **Step 4: Update syncBookFiles to write part fields and probe metadata**

In `syncBookFiles()`, update the insert for new files to include part/partCount and trigger metadata probing:

```ts
if (!existing) {
  db.insert(bookFiles)
    .values({
      bookId: discovered.bookId,
      path: discovered.absolutePath,
      size: discovered.size,
      quality: discovered.quality,
      part: discovered.part,
      partCount: discovered.partCount,
    })
    .run();

  // ... existing history insert ...

  stats.filesAdded += 1;
}
```

- [ ] **Step 5: Add metadata probing after sync**

After `syncBookFiles()` returns in `rescanRootFolder()`, add a pass that probes files missing metadata:

```ts
// Probe metadata for files missing it
const filesNeedingMeta = db
  .select()
  .from(bookFiles)
  .where(
    and(
      like(bookFiles.path, `${rootFolderPath}%`),
      sql`(${bookFiles.duration} IS NULL AND ${bookFiles.pageCount} IS NULL)`,
    ),
  )
  .all();

for (const file of filesNeedingMeta) {
  const ext = path.extname(file.path).toLowerCase();
  if (AUDIO_EXTENSIONS.has(ext)) {
    const meta = await probeAudioFile(file.path);
    if (meta) {
      db.update(bookFiles)
        .set({
          duration: meta.duration,
          bitrate: meta.bitrate,
          sampleRate: meta.sampleRate,
          channels: meta.channels,
          codec: meta.codec,
        })
        .where(eq(bookFiles.id, file.id))
        .run();
    }
  } else {
    const meta = probeEbookFile(file.path);
    if (meta) {
      db.update(bookFiles)
        .set({
          pageCount: meta.pageCount,
          language: meta.language,
        })
        .where(eq(bookFiles.id, file.id))
        .run();
    }
  }
}
```

Since `probeAudioFile` is async, `rescanRootFolder()` needs to become async. Update its signature to `export async function rescanRootFolder(rootFolderPath: string): Promise<ScanStats>`.

Add `and` and `sql` to the existing drizzle-orm import in `disk-scan.ts` (they are **not** currently imported):

```ts
import { eq, like, and, sql } from "drizzle-orm";
```

Then update the caller in `src/server/scheduler/tasks/rescan-folders.ts` line 34 — change:

```ts
const result = rescanRootFolder(folderPath);
```

to:

```ts
const result = await rescanRootFolder(folderPath);
```

The handler is already `async`, so this is the only change needed in that file.

- [ ] **Step 6: Verify build**

Run: `bun run build`
Expected: Builds without errors.

- [ ] **Step 7: Commit**

```bash
git add src/server/disk-scan.ts src/server/scheduler/tasks/rescan-folders.ts
git commit -m "feat: add part assignment and metadata probing to disk scan"
```

---

### Task 5: System Health Check & Dockerfile

**Files:**

- Modify: `src/server/system-status.ts`
- Modify: `Dockerfile`

- [ ] **Step 1: Add ffprobe health check**

In `src/server/system-status.ts`, in the `runHealthChecks()` function, add this block after the existing Hardcover token check:

```ts
// Check system dependencies (ffprobe for audio metadata)
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

- [ ] **Step 2: Add ffmpeg to Dockerfile**

In `Dockerfile`, in the runtime stage (after `FROM oven/bun:1-alpine` for the runtime), add before the COPY commands:

```dockerfile
# Install ffmpeg for audio metadata extraction (provides ffprobe)
RUN apk add --no-cache ffmpeg
```

Add it after `WORKDIR /app` and before the first `COPY --from=builder` line.

- [ ] **Step 3: Verify build**

Run: `bun run build`
Expected: Builds without errors. The health check should show the ffprobe warning when running locally without ffmpeg installed.

- [ ] **Step 4: Commit**

```bash
git add src/server/system-status.ts Dockerfile
git commit -m "feat: add ffprobe health check and ffmpeg to Dockerfile"
```

---

### Task 6: Media Management UI — Per-Type Naming Tabs

**Files:**

- Modify: `src/routes/_authed/settings/media-management.tsx`

- [ ] **Step 1: Update state variables for per-type naming**

Replace the existing naming state variables in `MediaManagementPage()`. Remove the old `bookFile`, `authorFolder`, `bookFolder` state vars. Add per-type state:

```tsx
// Ebook Naming
const [ebookBookFile, setEbookBookFile] = useState(
  getSetting(settings, "naming.ebook.bookFile", "{Author Name} - {Book Title}"),
);
const [ebookAuthorFolder, setEbookAuthorFolder] = useState(
  getSetting(settings, "naming.ebook.authorFolder", "{Author Name}"),
);
const [ebookBookFolder, setEbookBookFolder] = useState(
  getSetting(
    settings,
    "naming.ebook.bookFolder",
    "{Book Title} ({Release Year})",
  ),
);
const [ebookExtraExtensions, setEbookExtraExtensions] = useState(
  getSetting(settings, "mediaManagement.ebook.extraFileExtensions", ""),
);

// Audiobook Naming
const [audiobookBookFile, setAudiobookBookFile] = useState(
  getSetting(
    settings,
    "naming.audiobook.bookFile",
    "{Author Name} - {Book Title} - Part {PartNumber:00}",
  ),
);
const [audiobookAuthorFolder, setAudiobookAuthorFolder] = useState(
  getSetting(settings, "naming.audiobook.authorFolder", "{Author Name}"),
);
const [audiobookBookFolder, setAudiobookBookFolder] = useState(
  getSetting(
    settings,
    "naming.audiobook.bookFolder",
    "{Book Title} ({Release Year})",
  ),
);
const [audiobookExtraExtensions, setAudiobookExtraExtensions] = useState(
  getSetting(
    settings,
    "mediaManagement.audiobook.extraFileExtensions",
    ".cue,.nfo",
  ),
);
```

- [ ] **Step 2: Add Tabs import**

Add to the imports at the top (if not already present):

```tsx
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "src/components/ui/tabs";
```

- [ ] **Step 3: Update the naming tokens constant**

Update `NAMING_TOKENS` to have separate versions:

```tsx
const EBOOK_NAMING_TOKENS =
  "{Author Name}, {Book Title}, {Book Series}, {Book SeriesPosition}, {Release Year}";
const AUDIOBOOK_NAMING_TOKENS =
  "{Author Name}, {Book Title}, {Book Series}, {Book SeriesPosition}, {Release Year}, {PartNumber}, {PartNumber:00}, {PartCount}";
```

- [ ] **Step 4: Replace the Book Naming card content with tabs**

Replace the entire `{/* Book Naming */}` Card with a tabbed version. The Card structure stays, but the CardContent gets ebook/audiobook tabs:

```tsx
<Card>
  <CardHeader>
    <CardTitle>Book Naming</CardTitle>
    <CardDescription>
      Configure how book files and folders are named per media type.
    </CardDescription>
  </CardHeader>
  <CardContent className="space-y-6">
    <div className="flex items-center justify-between">
      <div className="space-y-0.5">
        <Label>Rename Books</Label>
        <p className="text-sm text-muted-foreground">
          Rename imported book files using the configured format.
        </p>
      </div>
      <Switch checked={renameBooks} onCheckedChange={setRenameBooks} />
    </div>

    <div className="flex items-center justify-between">
      <div className="space-y-0.5">
        <Label>Replace Illegal Characters</Label>
        <p className="text-sm text-muted-foreground">
          Replace characters that are not allowed in file paths.
        </p>
      </div>
      <Switch
        checked={replaceIllegalCharacters}
        onCheckedChange={setReplaceIllegalCharacters}
      />
    </div>

    <Tabs defaultValue="ebook">
      <TabsList>
        <TabsTrigger value="ebook">Ebook</TabsTrigger>
        <TabsTrigger value="audiobook">Audiobook</TabsTrigger>
      </TabsList>

      <TabsContent value="ebook" className="space-y-4 pt-4">
        <div className="space-y-2">
          <Label>Standard Book Format</Label>
          <Input
            value={ebookBookFile}
            onChange={(e) => setEbookBookFile(e.target.value)}
            disabled={!renameBooks}
          />
          <p className="text-xs text-muted-foreground">
            Available tokens: {EBOOK_NAMING_TOKENS}
          </p>
        </div>
        <div className="space-y-2">
          <Label>Author Folder Format</Label>
          <Input
            value={ebookAuthorFolder}
            onChange={(e) => setEbookAuthorFolder(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label>Book Folder Format</Label>
          <Input
            value={ebookBookFolder}
            onChange={(e) => setEbookBookFolder(e.target.value)}
          />
        </div>
        {importExtraFiles && (
          <div className="space-y-2">
            <Label>Extra File Extensions</Label>
            <Input
              value={ebookExtraExtensions}
              onChange={(e) => setEbookExtraExtensions(e.target.value)}
              placeholder=".opf"
            />
          </div>
        )}
      </TabsContent>

      <TabsContent value="audiobook" className="space-y-4 pt-4">
        <div className="space-y-2">
          <Label>Standard Book Format</Label>
          <Input
            value={audiobookBookFile}
            onChange={(e) => setAudiobookBookFile(e.target.value)}
            disabled={!renameBooks}
          />
          <p className="text-xs text-muted-foreground">
            Available tokens: {AUDIOBOOK_NAMING_TOKENS}
          </p>
        </div>
        <div className="space-y-2">
          <Label>Author Folder Format</Label>
          <Input
            value={audiobookAuthorFolder}
            onChange={(e) => setAudiobookAuthorFolder(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label>Book Folder Format</Label>
          <Input
            value={audiobookBookFolder}
            onChange={(e) => setAudiobookBookFolder(e.target.value)}
          />
        </div>
        {importExtraFiles && (
          <div className="space-y-2">
            <Label>Extra File Extensions</Label>
            <Input
              value={audiobookExtraExtensions}
              onChange={(e) => setAudiobookExtraExtensions(e.target.value)}
              placeholder=".cue,.nfo,.jpg"
            />
          </div>
        )}
      </TabsContent>
    </Tabs>
  </CardContent>
</Card>
```

- [ ] **Step 5: Remove the old Extra File Extensions from the Importing card**

In the Importing card, remove the `importExtraFiles` switch and `extraFileExtensions` input — these are now per-type inside the naming tabs. Keep the `importExtraFiles` toggle but move it into the naming card (it's already referenced by the per-type tabs above via the `importExtraFiles` state).

Actually, keep the `importExtraFiles` toggle in the Importing card as a global on/off, and the per-type extension fields in the naming tabs are conditional on it being enabled. The Importing card just loses the old `extraFileExtensions` input.

Remove from the Importing card:

```tsx
{
  importExtraFiles && (
    <div className="space-y-2">
      <Label>Extra File Extensions</Label>
      <Input
        value={extraFileExtensions}
        onChange={(e) => setExtraFileExtensions(e.target.value)}
        placeholder=".cue,.nfo,.jpg"
      />
    </div>
  );
}
```

Remove the `extraFileExtensions` state variable.

- [ ] **Step 6: Update handleSave**

Replace the naming-related entries in `handleSave()`:

```tsx
const handleSave = () => {
  updateSettings.mutate([
    { key: "mediaManagement.renameBooks", value: String(renameBooks) },
    {
      key: "mediaManagement.replaceIllegalCharacters",
      value: String(replaceIllegalCharacters),
    },
    // Per-type naming
    { key: "naming.ebook.bookFile", value: ebookBookFile },
    { key: "naming.ebook.authorFolder", value: ebookAuthorFolder },
    { key: "naming.ebook.bookFolder", value: ebookBookFolder },
    { key: "naming.audiobook.bookFile", value: audiobookBookFile },
    { key: "naming.audiobook.authorFolder", value: audiobookAuthorFolder },
    { key: "naming.audiobook.bookFolder", value: audiobookBookFolder },
    // Per-type extra files
    {
      key: "mediaManagement.ebook.extraFileExtensions",
      value: ebookExtraExtensions,
    },
    {
      key: "mediaManagement.audiobook.extraFileExtensions",
      value: audiobookExtraExtensions,
    },
    // Folders
    {
      key: "mediaManagement.createEmptyAuthorFolders",
      value: String(createEmptyAuthorFolders),
    },
    {
      key: "mediaManagement.deleteEmptyAuthorFolders",
      value: String(deleteEmptyAuthorFolders),
    },
    // Importing
    { key: "mediaManagement.useHardLinks", value: String(useHardLinks) },
    {
      key: "mediaManagement.skipFreeSpaceCheck",
      value: String(skipFreeSpaceCheck),
    },
    {
      key: "mediaManagement.minimumFreeSpace",
      value: String(minimumFreeSpace),
    },
    {
      key: "mediaManagement.importExtraFiles",
      value: String(importExtraFiles),
    },
    // File management
    {
      key: "mediaManagement.propersAndRepacks",
      value: propersAndRepacks,
    },
    {
      key: "mediaManagement.ignoreDeletedBooks",
      value: String(ignoreDeletedBooks),
    },
    { key: "mediaManagement.changeFileDate", value: changeFileDate },
    { key: "mediaManagement.recyclingBin", value: recyclingBin },
    {
      key: "mediaManagement.recyclingBinCleanup",
      value: String(recyclingBinCleanup),
    },
    // Permissions
    { key: "mediaManagement.setPermissions", value: String(setPermissions) },
    { key: "mediaManagement.fileChmod", value: fileChmod },
    { key: "mediaManagement.folderChmod", value: folderChmod },
    { key: "mediaManagement.chownGroup", value: chownGroup },
  ]);
};
```

- [ ] **Step 7: Verify build and visually test**

Run: `bun run dev`
Navigate to Settings > Media Management. Verify:

- Ebook/Audiobook tabs appear in the naming card
- Each tab has its own naming fields + extra file extensions
- Save works without errors

- [ ] **Step 8: Commit**

```bash
git add src/routes/_authed/settings/media-management.tsx
git commit -m "feat: add ebook/audiobook tabs to media management naming settings"
```

---

### Task 7: Update file-import.ts references to old naming keys

**Files:**

- Modify: `src/server/file-import.ts`

After the settings migration, any remaining references to the old `naming.bookFile`, `naming.authorFolder`, `naming.bookFolder` keys in `file-import.ts` need to be updated to the ebook variants (since ebook is the primary type used for folder computation).

- [ ] **Step 1: Search for old key references**

Check if any old key references remain in `file-import.ts` after Task 3 changes. The folder computation should already use `naming.ebook.authorFolder` and `naming.ebook.bookFolder` from Task 3's step 6. The old `naming.bookFile` reference should be gone (replaced by per-type logic in `importFiles()`).

If any old references remain, update them. Also check `src/server/settings-reader.ts` and any other files that reference the old keys.

Run: `grep -rn "naming\.bookFile\|naming\.authorFolder\|naming\.bookFolder" src/`
Expected: No matches (all converted to per-type keys).

Also run: `grep -rn "mediaManagement\.extraFileExtensions" src/`
Expected: Only per-type references (`mediaManagement.ebook.extraFileExtensions` and `mediaManagement.audiobook.extraFileExtensions`).

- [ ] **Step 2: Fix any remaining references**

If any old references are found, update them to the per-type equivalents.

- [ ] **Step 3: Run full build**

Run: `bun run build`
Expected: Clean build.

- [ ] **Step 4: Commit (if changes were needed)**

```bash
git add -A
git commit -m "fix: update remaining old naming key references to per-type keys"
```

---

### Task 8: End-to-End Verification

- [ ] **Step 1: Run the dev server and verify the full flow**

Run: `bun run dev`

Manual verification checklist:

1. Settings > Media Management shows ebook/audiobook tabs
2. Both tabs have correct default values
3. System Status shows ffprobe warning (unless ffmpeg is installed locally)
4. Save settings, refresh, verify values persist

- [ ] **Step 2: Audit E2E tests for Media Management UI changes**

Search for E2E tests that interact with the old Media Management page structure:

Run: `grep -rn "naming.bookFile\|extraFileExtensions\|Standard Book Format\|Extra File Extensions\|media-management" e2e/`

If any tests reference the old single naming fields or the old `extraFileExtensions` input, update them to work with the new tabbed layout. Key changes: tests may need to click the "Ebook" or "Audiobook" tab before interacting with naming fields.

- [ ] **Step 3: Run existing E2E tests**

Run: `bunx playwright test`
Expected: All existing tests pass. The settings migration should not break existing behavior since old naming keys are migrated to new per-type keys.

- [ ] **Step 3: Run build**

Run: `bun run build`
Expected: Clean production build.

- [ ] **Step 4: Final commit if any fixes were needed**

```bash
git add -A
git commit -m "fix: resolve issues found during end-to-end verification"
```
