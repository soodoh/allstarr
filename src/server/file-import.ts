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

function scanForBookFiles(dir: string): string[] {
  const results: string[] = [];
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        results.push(...scanForBookFiles(fullPath));
      } else if (
        SUPPORTED_EXTENSIONS.has(path.extname(entry.name).toLowerCase())
      ) {
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
): boolean {
  const filename = path.basename(filePath);
  const destPath = path.join(destDir, filename);

  try {
    try {
      fs.linkSync(filePath, destPath);
    } catch {
      fs.copyFileSync(filePath, destPath);
    }

    const quality = matchFormat({
      title: filename,
      size: fs.statSync(filePath).size,
      indexerFlags: 0,
    });

    if (bookId) {
      db.insert(bookFiles)
        .values({
          bookId,
          path: destPath,
          size: fs.statSync(destPath).size,
          quality: {
            quality: { id: quality.id, name: quality.name },
            revision: { version: 1, real: 0 },
          },
        })
        .run();
    }

    return true;
  } catch (error) {
    console.error(
      `[file-import] Failed to import ${filename}: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
    return false;
  }
}

function markFailed(id: number, message: string): void {
  db.update(trackedDownloads)
    .set({ state: "failed", message, updatedAt: new Date() })
    .where(eq(trackedDownloads.id, id))
    .run();
  console.warn(`[file-import] Failed: ${message}`);
}

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

  let sourceDir: string;
  try {
    const stat = fs.statSync(td.outputPath);
    sourceDir = stat.isDirectory()
      ? td.outputPath
      : path.dirname(td.outputPath);
  } catch {
    markFailed(td.id, "Download output path not found");
    return;
  }

  const files = scanForBookFiles(sourceDir);
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

  const book = td.bookId
    ? db.select().from(books).where(eq(books.id, td.bookId)).get()
    : null;
  const bookTitle = book?.title ?? td.releaseTitle;
  const year = book?.releaseYear;
  const bookFolder = year ? `${bookTitle} (${year})` : bookTitle;
  const destDir = path.join(
    rootFolderPath,
    sanitizePath(authorName),
    sanitizePath(bookFolder),
  );

  fs.mkdirSync(destDir, { recursive: true });

  let importedCount = 0;
  for (const filePath of files) {
    if (importFile(filePath, destDir, td.bookId)) {
      importedCount += 1;
    }
  }

  if (importedCount === 0) {
    markFailed(td.id, "All file imports failed");
    return;
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
