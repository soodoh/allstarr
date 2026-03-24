// oxlint-disable no-console -- File import logs are intentional server-side diagnostics
// oxlint-disable import/prefer-default-export -- named export used by download-manager
import fs from "node:fs";
import path from "node:path";
import { db } from "src/db";
import {
  trackedDownloads,
  books,
  authors,
  booksAuthors,
  bookFiles,
  downloadProfiles,
  history,
} from "src/db/schema";
import { eq, and } from "drizzle-orm";
import { matchFormat } from "./indexers/format-parser";
import { eventBus } from "./event-bus";
import getMediaSetting from "./settings-reader";
import { probeAudioFile, probeEbookFile } from "./media-probe";

type ImportResult = {
  bookFileId: number | null;
  destPath: string;
} | null;

const AUDIO_EXTENSIONS = new Set([".mp3", ".m4b", ".flac"]);
const EBOOK_EXTENSIONS = new Set([".pdf", ".epub", ".mobi", ".azw3", ".azw"]);

type MediaType = "ebook" | "audio";

function getMediaType(filePath: string): MediaType {
  const ext = path.extname(filePath).toLowerCase();
  return AUDIO_EXTENSIONS.has(ext) ? "audio" : "ebook";
}

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

const SUPPORTED_EXTENSIONS = new Set([
  ".pdf",
  ".mobi",
  ".epub",
  ".azw3",
  ".azw",
  ".mp3",
  ".m4b",
  ".flac",
]);

function sanitizePath(name: string): string {
  return name.replaceAll(/[<>:"/\\|?*]/g, "_").trim();
}

function resolveAuthorName(
  authorId: number | null,
  bookId: number | null,
): string {
  if (authorId) {
    const author = db
      .select()
      .from(authors)
      .where(eq(authors.id, authorId))
      .get();
    if (author) {
      return author.name;
    }
  }
  if (bookId) {
    const ba = db
      .select({ authorName: booksAuthors.authorName })
      .from(booksAuthors)
      .where(
        and(eq(booksAuthors.bookId, bookId), eq(booksAuthors.isPrimary, true)),
      )
      .get();
    if (ba) {
      return ba.authorName;
    }
  }
  return "Unknown Author";
}

function resolveRootFolder(downloadProfileId: number | null): string | null {
  if (downloadProfileId) {
    const profile = db
      .select()
      .from(downloadProfiles)
      .where(eq(downloadProfiles.id, downloadProfileId))
      .get();
    if (profile?.rootFolderPath) {
      return profile.rootFolderPath;
    }
  }
  const fallback = db.select().from(downloadProfiles).get();
  return fallback?.rootFolderPath ?? null;
}

function resolveProfileType(downloadProfileId: number | null): MediaType {
  if (downloadProfileId) {
    const profile = db
      .select({ contentType: downloadProfiles.contentType })
      .from(downloadProfiles)
      .where(eq(downloadProfiles.id, downloadProfileId))
      .get();
    if (profile?.contentType === "audiobook") {
      return "audio";
    }
  }
  return "ebook";
}

function scanForBookFiles(
  dir: string,
  extensions: Set<string> = SUPPORTED_EXTENSIONS,
): string[] {
  const results: string[] = [];
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        results.push(...scanForBookFiles(fullPath, extensions));
      } else if (extensions.has(path.extname(entry.name).toLowerCase())) {
        results.push(fullPath);
      }
    }
  } catch {
    // Directory not accessible
  }
  return results;
}

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

type ImportSettings = {
  useHardLinks: boolean;
  skipFreeSpaceCheck: boolean;
  minimumFreeSpace: number;
  renameBooks: boolean;
  applyPermissions: boolean;
  fileChmod: string;
  folderChmod: string;
  importExtraFiles: boolean;
};

function readImportSettings(_type: MediaType): ImportSettings {
  return {
    useHardLinks: getMediaSetting("mediaManagement.book.useHardLinks", true),
    skipFreeSpaceCheck: getMediaSetting(
      "mediaManagement.book.skipFreeSpaceCheck",
      false,
    ),
    minimumFreeSpace: getMediaSetting(
      "mediaManagement.book.minimumFreeSpace",
      100,
    ),
    renameBooks: getMediaSetting("mediaManagement.book.renameBooks", false),
    applyPermissions: getMediaSetting(
      "mediaManagement.book.setPermissions",
      false,
    ),
    fileChmod: getMediaSetting("mediaManagement.book.fileChmod", "0644"),
    folderChmod: getMediaSetting("mediaManagement.book.folderChmod", "0755"),
    importExtraFiles: getMediaSetting(
      "mediaManagement.book.importExtraFiles",
      false,
    ),
  };
}

function buildScanExtensions(): Set<string> {
  const extensions = new Set(SUPPORTED_EXTENSIONS);
  const importExtra = getMediaSetting(
    "mediaManagement.book.importExtraFiles",
    false,
  );
  if (importExtra) {
    const extraExtensions = getMediaSetting(
      "mediaManagement.book.extraFileExtensions",
      "",
    );
    for (const ext of extraExtensions.split(",")) {
      const trimmed = ext.trim();
      if (trimmed) {
        extensions.add(trimmed.startsWith(".") ? trimmed : `.${trimmed}`);
      }
    }
  }
  return extensions;
}

function checkFreeSpace(
  rootFolderPath: string,
  minimumFreeSpace: number,
): string | null {
  try {
    const stat = fs.statfsSync(rootFolderPath);
    const freeSpaceMB = (stat.bsize * stat.bavail) / (1024 * 1024);
    if (freeSpaceMB < minimumFreeSpace) {
      return `Insufficient free space: ${Math.round(freeSpaceMB)}MB available, ${minimumFreeSpace}MB required`;
    }
  } catch {
    console.warn("[file-import] Could not check free space, proceeding anyway");
  }
  return null;
}

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

function resolveSourceDir(outputPath: string): string | null {
  try {
    const stat = fs.statSync(outputPath);
    return stat.isDirectory() ? outputPath : path.dirname(outputPath);
  } catch {
    return null;
  }
}

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
  const sorted = [...files].toSorted((a, b) =>
    naturalCompare(path.basename(a), path.basename(b)),
  );
  const isMultiPart = mediaType === "audio" && sorted.length > 1;
  const partCount = isMultiPart ? sorted.length : null;

  const templateKey =
    mediaType === "audio"
      ? "naming.book.audio.bookFile"
      : "naming.book.ebook.bookFile";
  const defaultTemplate =
    mediaType === "audio"
      ? "{Author Name} - {Book Title} - Part {PartNumber:00}"
      : "{Author Name} - {Book Title}";

  let count = 0;
  for (let i = 0; i < sorted.length; i += 1) {
    const filePath = sorted[i];
    const part = isMultiPart ? i + 1 : null;
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
      if (result.bookFileId) {
        if (mediaType === "audio") {
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

function markFailed(id: number, message: string): void {
  db.update(trackedDownloads)
    .set({ state: "failed", message, updatedAt: new Date() })
    .where(eq(trackedDownloads.id, id))
    .run();
  console.warn(`[file-import] Failed: ${message}`);
}

// oxlint-disable-next-line complexity -- Import pipeline with many validation and cleanup steps
export async function importCompletedDownload(
  trackedDownloadId: number,
): Promise<void> {
  const td = db
    .select()
    .from(trackedDownloads)
    .where(eq(trackedDownloads.id, trackedDownloadId))
    .get();

  if (!td) {
    throw new Error(`Tracked download ${trackedDownloadId} not found`);
  }

  db.update(trackedDownloads)
    .set({ state: "importPending", updatedAt: new Date() })
    .where(eq(trackedDownloads.id, td.id))
    .run();

  if (!td.outputPath) {
    markFailed(td.id, "Download output path not set");
    return;
  }

  const sourceDir = resolveSourceDir(td.outputPath);
  if (!sourceDir) {
    markFailed(td.id, "Download output path not found");
    return;
  }

  const primaryType = resolveProfileType(td.downloadProfileId);
  const cfg = readImportSettings(primaryType);
  const files = scanForBookFiles(sourceDir, buildScanExtensions());
  if (files.length === 0) {
    markFailed(td.id, "No book files found in download");
    return;
  }

  const authorName = resolveAuthorName(td.authorId, td.bookId);
  const rootFolderPath = resolveRootFolder(td.downloadProfileId);
  if (!rootFolderPath) {
    markFailed(td.id, "No root folder configured in download profiles");
    return;
  }

  if (!cfg.skipFreeSpaceCheck) {
    const spaceError = checkFreeSpace(rootFolderPath, cfg.minimumFreeSpace);
    if (spaceError) {
      markFailed(td.id, spaceError);
      return;
    }
  }

  // Record existing files before import so we can clean them up on upgrade
  const existingFiles = td.bookId
    ? db
        .select({ id: bookFiles.id, path: bookFiles.path })
        .from(bookFiles)
        .where(eq(bookFiles.bookId, td.bookId))
        .all()
    : [];

  const book = td.bookId
    ? db.select().from(books).where(eq(books.id, td.bookId)).get()
    : null;
  const bookTitle = book?.title ?? td.releaseTitle;
  const year = book?.releaseYear;

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
      getMediaSetting(
        `naming.book.${primaryType}.authorFolder`,
        "{Author Name}",
      ),
      namingVars,
    ),
  );
  const bookFolderName = sanitizePath(
    applyNamingTemplate(
      getMediaSetting(
        `naming.book.${primaryType}.bookFolder`,
        "{Book Title} ({Release Year})",
      ),
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
      "audio",
    );
  }

  if (importedCount === 0) {
    markFailed(td.id, "All file imports failed");
    return;
  }

  // Clean up old book files on upgrade
  if (existingFiles.length > 0) {
    for (const oldFile of existingFiles) {
      const recyclingBin = getMediaSetting(
        "mediaManagement.book.recyclingBin",
        "",
      );
      try {
        if (recyclingBin) {
          fs.mkdirSync(recyclingBin, { recursive: true });
          const recycleDest = path.join(
            recyclingBin,
            path.basename(oldFile.path),
          );
          fs.renameSync(oldFile.path, recycleDest);
        } else {
          fs.unlinkSync(oldFile.path);
        }
      } catch {
        // File may already be gone
      }
      db.delete(bookFiles).where(eq(bookFiles.id, oldFile.id)).run();
    }
    console.log(
      `[file-import] Cleaned up ${existingFiles.length} old file(s) for "${bookTitle}"`,
    );
  }

  db.insert(history)
    .values({
      eventType: "bookImported",
      bookId: td.bookId,
      authorId: td.authorId,
      data: {
        title: bookTitle,
        releaseTitle: td.releaseTitle,
        filesImported: importedCount,
        destinationPath: destDir,
      },
    })
    .run();

  db.update(trackedDownloads)
    .set({ state: "imported", updatedAt: new Date() })
    .where(eq(trackedDownloads.id, td.id))
    .run();

  eventBus.emit({ type: "importCompleted", bookId: td.bookId, bookTitle });

  console.log(
    `[file-import] Imported ${importedCount} files for "${bookTitle}" to ${destDir}`,
  );
}
