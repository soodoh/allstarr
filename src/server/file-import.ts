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
import { getMediaSetting } from "./settings-reader";

function applyNamingTemplate(
  template: string,
  vars: Record<string, string>,
): string {
  let result = template;
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
): boolean {
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

type ImportSettings = {
  useHardLinks: boolean;
  skipFreeSpaceCheck: boolean;
  minimumFreeSpace: number;
  renameBooks: boolean;
  applyPermissions: boolean;
  fileChmod: string;
  folderChmod: string;
  importExtraFiles: boolean;
  extraFileExtensions: string;
};

function readImportSettings(): ImportSettings {
  return {
    useHardLinks: getMediaSetting("mediaManagement.useHardLinks", true),
    skipFreeSpaceCheck: getMediaSetting(
      "mediaManagement.skipFreeSpaceCheck",
      false,
    ),
    minimumFreeSpace: getMediaSetting("mediaManagement.minimumFreeSpace", 100),
    renameBooks: getMediaSetting("mediaManagement.renameBooks", false),
    applyPermissions: getMediaSetting("mediaManagement.setPermissions", false),
    fileChmod: getMediaSetting("mediaManagement.fileChmod", "0644"),
    folderChmod: getMediaSetting("mediaManagement.folderChmod", "0755"),
    importExtraFiles: getMediaSetting(
      "mediaManagement.importExtraFiles",
      false,
    ),
    extraFileExtensions: getMediaSetting(
      "mediaManagement.extraFileExtensions",
      "",
    ),
  };
}

function buildScanExtensions(cfg: ImportSettings): Set<string> {
  const extensions = new Set(SUPPORTED_EXTENSIONS);
  if (cfg.importExtraFiles && cfg.extraFileExtensions) {
    for (const ext of cfg.extraFileExtensions.split(",")) {
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
): boolean {
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
      `[file-import] Failed to import ${path.basename(filePath)}: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
    return false;
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

function importFiles(
  files: string[],
  destDir: string,
  bookId: number | null,
  namingVars: Record<string, string>,
  cfg: ImportSettings,
): number {
  let count = 0;
  for (const filePath of files) {
    if (cfg.renameBooks) {
      const template = getMediaSetting(
        "naming.bookFile",
        "{Author Name} - {Book Title}",
      );
      const ext = path.extname(filePath);
      const newName =
        sanitizePath(applyNamingTemplate(template, namingVars)) + ext;
      if (importRenamedFile(filePath, destDir, newName, bookId, cfg)) {
        count += 1;
      }
    } else if (
      importFile(
        filePath,
        destDir,
        bookId,
        cfg.useHardLinks,
        cfg.applyPermissions,
        cfg.fileChmod,
      )
    ) {
      count += 1;
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

  const cfg = readImportSettings();
  const files = scanForBookFiles(sourceDir, buildScanExtensions(cfg));
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
  };

  const authorFolderName = sanitizePath(
    applyNamingTemplate(
      getMediaSetting("naming.authorFolder", "{Author Name}"),
      namingVars,
    ),
  );
  const bookFolderName = sanitizePath(
    applyNamingTemplate(
      getMediaSetting("naming.bookFolder", "{Book Title} ({Release Year})"),
      namingVars,
    ),
  );

  const destDir = path.join(rootFolderPath, authorFolderName, bookFolderName);
  fs.mkdirSync(destDir, { recursive: true });

  if (cfg.applyPermissions && cfg.folderChmod) {
    fs.chmodSync(destDir, Number.parseInt(cfg.folderChmod, 8));
  }

  const importedCount = importFiles(files, destDir, td.bookId, namingVars, cfg);

  if (importedCount === 0) {
    markFailed(td.id, "All file imports failed");
    return;
  }

  // Clean up old book files on upgrade
  if (existingFiles.length > 0) {
    const recyclingBin = getMediaSetting("mediaManagement.recyclingBin", "");
    for (const oldFile of existingFiles) {
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
