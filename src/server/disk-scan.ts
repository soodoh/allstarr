// oxlint-disable no-console -- Disk scan logs are intentional server-side diagnostics
import fs from "node:fs";
import path from "node:path";
import { db } from "src/db";
import {
  authors,
  books,
  booksAuthors,
  bookFiles,
  qualityProfiles,
  history,
} from "src/db/schema";
import { eq, like } from "drizzle-orm";
import { matchQuality } from "src/server/indexers/quality-parser";

export function getRootFolderPaths(): string[] {
  const rows = db
    .select({ rootFolderPath: qualityProfiles.rootFolderPath })
    .from(qualityProfiles)
    .all();
  return [...new Set(rows.map((r) => r.rootFolderPath).filter(Boolean))];
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

export type ScanStats = {
  filesAdded: number;
  filesRemoved: number;
  filesUnchanged: number;
  filesUpdated: number;
  unmatchedFiles: number;
  errors: string[];
};

type DiscoveredFile = {
  absolutePath: string;
  bookId: number;
  size: number;
  quality: {
    quality: { id: number; name: string };
    revision: { version: number; real: number };
  };
};

function normalize(name: string): string {
  return name.toLowerCase().trim().replaceAll(/\s+/g, " ");
}

function parseBookFolder(dirName: string): {
  title: string;
  year: number | null;
} {
  const match = dirName.match(/^(.+?)\s*\((\d{4})\)\s*$/);
  if (match) {
    return { title: match[1].trim(), year: Number(match[2]) };
  }
  return { title: dirName.trim(), year: null };
}

function isBookFile(filename: string): boolean {
  const ext = path.extname(filename).toLowerCase();
  return SUPPORTED_EXTENSIONS.has(ext);
}

function buildAuthorLookup(): Map<string, { id: number; name: string }> {
  const rows = db
    .select({ id: authors.id, name: authors.name })
    .from(authors)
    .all();
  const map = new Map<string, { id: number; name: string }>();
  for (const row of rows) {
    map.set(normalize(row.name), row);
  }
  return map;
}

function buildBookLookup(
  authorId: number,
): Map<string, { id: number; title: string; releaseYear: number | null }> {
  const rows = db
    .select({
      id: books.id,
      title: books.title,
      releaseYear: books.releaseYear,
    })
    .from(books)
    .innerJoin(booksAuthors, eq(booksAuthors.bookId, books.id))
    .where(eq(booksAuthors.authorId, authorId))
    .all();
  const map = new Map<
    string,
    { id: number; title: string; releaseYear: number | null }
  >();
  for (const row of rows) {
    map.set(normalize(row.title), row);
  }
  return map;
}

function countBookFiles(dirPath: string): number {
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    return entries.filter((e) => e.isFile() && isBookFile(e.name)).length;
  } catch {
    return 0;
  }
}

/** Walk the two-level directory structure and discover book files on disk. */
function walkDirectories(
  rootFolderPath: string,
  authorLookup: Map<string, { id: number; name: string }>,
  stats: ScanStats,
): Map<string, DiscoveredFile> {
  const discoveredFiles = new Map<string, DiscoveredFile>();

  let authorDirs: fs.Dirent[];
  try {
    authorDirs = fs
      .readdirSync(rootFolderPath, { withFileTypes: true })
      .filter((e) => e.isDirectory());
  } catch (error) {
    stats.errors.push(
      `Could not read root folder: ${error instanceof Error ? error.message : String(error)}`,
    );
    return discoveredFiles;
  }

  for (const authorDir of authorDirs) {
    const authorPath = path.join(rootFolderPath, authorDir.name);
    const author = authorLookup.get(normalize(authorDir.name));

    if (!author) {
      stats.unmatchedFiles += countUnmatchedInDir(authorPath);
      continue;
    }

    scanAuthorDirectory(authorPath, author.id, discoveredFiles, stats);
  }

  return discoveredFiles;
}

function countUnmatchedInDir(authorPath: string): number {
  let count = 0;
  try {
    const bookDirs = fs
      .readdirSync(authorPath, { withFileTypes: true })
      .filter((e) => e.isDirectory());
    for (const bookDir of bookDirs) {
      count += countBookFiles(path.join(authorPath, bookDir.name));
    }
    count += countBookFiles(authorPath);
  } catch {
    // Skip unreadable directories
  }
  return count;
}

function scanAuthorDirectory(
  authorPath: string,
  authorId: number,
  discoveredFiles: Map<string, DiscoveredFile>,
  stats: ScanStats,
): void {
  const bookLookup = buildBookLookup(authorId);

  let bookDirs: fs.Dirent[];
  try {
    bookDirs = fs
      .readdirSync(authorPath, { withFileTypes: true })
      .filter((e) => e.isDirectory());
  } catch {
    return;
  }

  for (const bookDir of bookDirs) {
    const bookPath = path.join(authorPath, bookDir.name);
    const parsed = parseBookFolder(bookDir.name);
    const book = bookLookup.get(normalize(parsed.title));

    if (!book) {
      stats.unmatchedFiles += countBookFiles(bookPath);
      continue;
    }

    scanBookDirectory(bookPath, book.id, discoveredFiles, stats);
  }
}

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

  for (const file of files) {
    const absolutePath = path.join(bookPath, file.name);
    try {
      const fileStat = fs.statSync(absolutePath);
      const quality = matchQuality({
        title: file.name,
        size: fileStat.size,
        indexerFlags: null,
      });

      discoveredFiles.set(absolutePath, {
        absolutePath,
        bookId,
        size: fileStat.size,
        quality: {
          quality: { id: quality.id, name: quality.name },
          revision: { version: 1, real: 0 },
        },
      });
    } catch (error) {
      stats.errors.push(
        `Could not stat file ${absolutePath}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}

/** Diff discovered files against DB and sync: insert new, update changed, delete stale. */
function syncBookFiles(
  rootFolderPath: string,
  discoveredFiles: Map<string, DiscoveredFile>,
  stats: ScanStats,
): void {
  const existingFiles = db
    .select()
    .from(bookFiles)
    .where(like(bookFiles.path, `${rootFolderPath}%`))
    .all();

  const existingByPath = new Map(existingFiles.map((f) => [f.path, f]));

  // Process discovered files
  for (const [, discovered] of discoveredFiles) {
    const existing = existingByPath.get(discovered.absolutePath);
    if (!existing) {
      db.insert(bookFiles)
        .values({
          bookId: discovered.bookId,
          path: discovered.absolutePath,
          size: discovered.size,
          quality: discovered.quality,
        })
        .run();
      db.insert(history)
        .values({
          eventType: "bookFileAdded",
          bookId: discovered.bookId,
          data: {
            path: discovered.absolutePath,
            size: discovered.size,
            quality: discovered.quality.quality.name,
          },
        })
        .run();
      stats.filesAdded += 1;
    } else if (existing.size === discovered.size) {
      stats.filesUnchanged += 1;
    } else {
      db.update(bookFiles)
        .set({
          size: discovered.size,
          quality: discovered.quality,
        })
        .where(eq(bookFiles.id, existing.id))
        .run();
      stats.filesUpdated += 1;
    }
  }

  // Remove stale files
  for (const [filePath, existing] of existingByPath) {
    if (!discoveredFiles.has(filePath)) {
      db.delete(bookFiles).where(eq(bookFiles.id, existing.id)).run();
      db.insert(history)
        .values({
          eventType: "bookFileRemoved",
          bookId: existing.bookId,
          data: {
            path: existing.path,
            size: existing.size,
            quality:
              (existing.quality as { quality: { name: string } } | null)
                ?.quality?.name ?? "Unknown",
          },
        })
        .run();
      stats.filesRemoved += 1;
    }
  }
}

export function rescanRootFolder(rootFolderPath: string): ScanStats {
  const stats: ScanStats = {
    filesAdded: 0,
    filesRemoved: 0,
    filesUnchanged: 0,
    filesUpdated: 0,
    unmatchedFiles: 0,
    errors: [],
  };

  if (!fs.existsSync(rootFolderPath)) {
    stats.errors.push(`Root folder does not exist: ${rootFolderPath}`);
    return stats;
  }

  // Walk directories and discover files
  const authorLookup = buildAuthorLookup();
  const discoveredFiles = walkDirectories(rootFolderPath, authorLookup, stats);

  // Sync discovered files with DB
  syncBookFiles(rootFolderPath, discoveredFiles, stats);

  return stats;
}
