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
  manga,
  mangaChapters,
  mangaVolumes,
  mangaFiles,
  shows,
  seasons,
  episodes,
  episodeFiles,
  showDownloadProfiles,
} from "src/db/schema";
import { eq, and } from "drizzle-orm";
import * as fuzz from "fuzzball";
import { matchFormat } from "./indexers/format-parser";
import { eventBus } from "./event-bus";
import getMediaSetting from "./settings-reader";
import { probeAudioFile, probeEbookFile } from "./media-probe";
import { mapTvFiles, mapBookFiles, mapMangaFiles } from "./import-mapping";

type ImportResult = {
  bookFileId: number | null;
  destPath: string;
} | null;

const AUDIO_EXTENSIONS = new Set([".mp3", ".m4b", ".flac"]);
const EBOOK_EXTENSIONS = new Set([".pdf", ".epub", ".mobi", ".azw3", ".azw"]);
const MANGA_EXTENSIONS = new Set([".cbz", ".cbr", ".pdf", ".epub"]);

type MediaType = "ebook" | "audio";

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

function resolveMangaRootFolder(_mangaId: number): string | null {
  // Use any manga-type download profile's root folder
  const profile = db
    .select()
    .from(downloadProfiles)
    .where(eq(downloadProfiles.contentType, "manga"))
    .get();
  return profile?.rootFolderPath ?? null;
}

const VIDEO_EXTENSIONS = new Set([
  ".mkv",
  ".mp4",
  ".avi",
  ".wmv",
  ".flv",
  ".webm",
  ".ts",
]);

function resolveShowRootFolder(showId: number): string | null {
  const link = db
    .select({ downloadProfileId: showDownloadProfiles.downloadProfileId })
    .from(showDownloadProfiles)
    .where(eq(showDownloadProfiles.showId, showId))
    .get();
  if (link) {
    const profile = db
      .select()
      .from(downloadProfiles)
      .where(eq(downloadProfiles.id, link.downloadProfileId))
      .get();
    if (profile?.rootFolderPath) {
      return profile.rootFolderPath;
    }
  }
  // Fallback: any tv-type profile
  const fallback = db
    .select()
    .from(downloadProfiles)
    .where(eq(downloadProfiles.contentType, "tv"))
    .get();
  return fallback?.rootFolderPath ?? null;
}

type BookCandidate = { id: number; title: string; releaseYear: number | null };

/** Find the best fuzzy match for an extracted title against a list of book candidates */
function fuzzyMatchBook(
  extractedTitle: string,
  candidates: BookCandidate[],
): BookCandidate | null {
  let bestMatch: BookCandidate | null = null;
  let bestScore = 0;
  const lower = extractedTitle.toLowerCase();
  for (const book of candidates) {
    const bookLower = book.title.toLowerCase();
    const tokenSet = fuzz.token_set_ratio(lower, bookLower);
    const partial = fuzz.partial_ratio(lower, bookLower);
    const score = Math.max(tokenSet, partial);
    if (score > bestScore && score >= 70) {
      bestScore = score;
      bestMatch = book;
    }
  }
  return bestMatch;
}

/** Import a single book file from a pack and probe its metadata */
async function importAndProbeBookFile(
  filePath: string,
  destDir: string,
  bookId: number,
  cfg: ImportSettings,
): Promise<boolean> {
  const result = importFile(
    filePath,
    destDir,
    bookId,
    cfg.useHardLinks,
    cfg.applyPermissions,
    cfg.fileChmod,
    null,
    null,
  );
  if (!result?.bookFileId) {
    return false;
  }

  const ext = path.extname(filePath).toLowerCase();
  if (AUDIO_EXTENSIONS.has(ext)) {
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
        .set({ pageCount: meta.pageCount, language: meta.language })
        .where(eq(bookFiles.id, result.bookFileId))
        .run();
    }
  }
  return true;
}

/** Import a single manga file for a chapter in a pack */
function importMangaPackFile(
  filePath: string,
  destPath: string,
  chapterId: number,
  cfg: ImportSettings,
): boolean {
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

    const ext = path.extname(filePath).toLowerCase();
    const quality = matchFormat({
      title: path.basename(filePath),
      size: fs.statSync(filePath).size,
      indexerFlags: 0,
    });

    db.insert(mangaFiles)
      .values({
        chapterId,
        path: destPath,
        size: fs.statSync(destPath).size,
        format: ext.replace(".", ""),
        quality: JSON.stringify({
          quality: { id: quality.id, name: quality.name },
          revision: { version: 1, real: 0 },
        }),
        dateAdded: new Date(),
      })
      .run();

    db.update(mangaChapters)
      .set({ hasFile: true })
      .where(eq(mangaChapters.id, chapterId))
      .run();

    return true;
  } catch (error) {
    console.error(
      `[file-import] Failed to import manga pack file ${path.basename(filePath)}: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
    return false;
  }
}

type MangaChapterInfo = {
  id: number;
  chapterNumber: string;
  hasFile: boolean | null;
  mangaVolumeId: number;
  volumeNumber: number | null;
};

/** Match a mapped manga file to a chapter by chapter or volume number */
function matchMangaChapter(
  mf: { chapter: number | null; volume: number | null },
  chapters: MangaChapterInfo[],
): MangaChapterInfo | undefined {
  if (mf.chapter !== null) {
    return chapters.find((ch) => Number(ch.chapterNumber) === mf.chapter);
  }
  if (mf.volume !== null) {
    return chapters.find((ch) => ch.volumeNumber === mf.volume && !ch.hasFile);
  }
  return undefined;
}

/** Build destination directory and file path for a manga pack chapter */
function buildMangaPackDest(
  chapter: MangaChapterInfo,
  mangaRow: { title: string; year: string | null },
  rootFolderPath: string,
  mangaFolderName: string,
  sourcePath: string,
  cfg: ImportSettings,
): { destDir: string; destPath: string } {
  const volume = db
    .select()
    .from(mangaVolumes)
    .where(eq(mangaVolumes.id, chapter.mangaVolumeId))
    .get();

  const namingVars: Record<string, string> = {
    "Manga Title": mangaRow.title,
    Volume:
      volume?.volumeNumber === null || volume?.volumeNumber === undefined
        ? ""
        : String(volume.volumeNumber),
    Chapter: chapter.chapterNumber,
    "Chapter Title": "",
    "Scanlation Group": "",
    Year: mangaRow.year ?? "",
  };

  const volumeFolderName =
    volume?.volumeNumber === null || volume?.volumeNumber === undefined
      ? ""
      : sanitizePath(
          applyNamingTemplate(
            getMediaSetting("naming.manga.volumeFolder", "Volume {Volume:00}"),
            namingVars,
          ),
        );

  const destDir = volumeFolderName
    ? path.join(rootFolderPath, mangaFolderName, volumeFolderName)
    : path.join(rootFolderPath, mangaFolderName);

  fs.mkdirSync(destDir, { recursive: true });
  if (cfg.applyPermissions && cfg.folderChmod) {
    fs.chmodSync(destDir, Number.parseInt(cfg.folderChmod, 8));
  }

  const ext = path.extname(sourcePath).toLowerCase();
  const chapterTemplate = getMediaSetting(
    "naming.manga.chapterFile",
    "{Manga Title} - Chapter {Chapter:000}",
  );
  const newName =
    sanitizePath(applyNamingTemplate(chapterTemplate, namingVars)) + ext;
  const destPath = path.join(destDir, newName);

  return { destDir, destPath };
}

function importEpisodeFile(
  filePath: string,
  destDir: string,
  episodeId: number,
  cfg: ImportSettings,
): { destPath: string; fileId: number } | null {
  const filename = path.basename(filePath);
  const destPath = path.join(destDir, filename);
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
      title: filename,
      size: fs.statSync(filePath).size,
      indexerFlags: 0,
    });

    const inserted = db
      .insert(episodeFiles)
      .values({
        episodeId,
        path: destPath,
        size: fs.statSync(destPath).size,
        quality: {
          quality: { id: quality.id, name: quality.name },
          revision: { version: 1, real: 0 },
        },
        container: path.extname(filePath).replace(".", ""),
      })
      .returning({ id: episodeFiles.id })
      .get();

    return { destPath, fileId: inserted.id };
  } catch (error) {
    console.error(
      `[file-import] Failed to import episode file ${filename}: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
    return null;
  }
}

async function importEpisodePackDownload(
  td: typeof trackedDownloads.$inferSelect,
): Promise<void> {
  if (!td.outputPath || !td.showId) {
    markFailed(td.id, "Missing output path or show ID for episode pack");
    return;
  }

  const sourceDir = resolveSourceDir(td.outputPath);
  if (!sourceDir) {
    markFailed(td.id, "Download output path not found");
    return;
  }

  const allFiles = scanForBookFiles(sourceDir, VIDEO_EXTENSIONS);
  if (allFiles.length === 0) {
    markFailed(td.id, "No video files found in episode pack download");
    return;
  }

  const show = db.select().from(shows).where(eq(shows.id, td.showId)).get();
  if (!show) {
    markFailed(td.id, `Show ${td.showId} not found`);
    return;
  }

  const rootFolderPath = resolveShowRootFolder(td.showId);
  if (!rootFolderPath) {
    markFailed(td.id, "No root folder configured for TV download profiles");
    return;
  }

  const cfg = readImportSettings("ebook"); // reuse generic settings

  if (!cfg.skipFreeSpaceCheck) {
    const spaceError = checkFreeSpace(rootFolderPath, cfg.minimumFreeSpace);
    if (spaceError) {
      markFailed(td.id, spaceError);
      return;
    }
  }

  // Map files to season/episode numbers
  const mapped = mapTvFiles(allFiles);
  if (mapped.length === 0) {
    markFailed(td.id, "No files matched S##E## pattern in episode pack");
    return;
  }

  // Load all episodes for this show
  const showEpisodes = db
    .select({
      id: episodes.id,
      seasonNumber: seasons.seasonNumber,
      episodeNumber: episodes.episodeNumber,
      hasFile: episodes.hasFile,
    })
    .from(episodes)
    .innerJoin(seasons, eq(episodes.seasonId, seasons.id))
    .where(eq(episodes.showId, td.showId))
    .all();

  const showFolderName = sanitizePath(
    applyNamingTemplate(
      getMediaSetting("naming.tv.showFolder", "{Show Title} ({Year})"),
      { "Show Title": show.title, Year: show.year ? String(show.year) : "" },
    ),
  );

  let importedCount = 0;
  for (const mf of mapped) {
    const ep = showEpisodes.find(
      (e) => e.seasonNumber === mf.season && e.episodeNumber === mf.episode,
    );
    if (!ep) {
      continue;
    }

    // Skip episodes that already have files (no upgrade logic for pack)
    if (ep.hasFile) {
      continue;
    }

    // Build destination path: rootFolder / showFolder / seasonFolder / file
    const seasonFolderName = sanitizePath(
      applyNamingTemplate(
        getMediaSetting("naming.tv.seasonFolder", "Season {Season:00}"),
        { Season: String(mf.season) },
      ),
    );
    const destDir = show.useSeasonFolder
      ? path.join(rootFolderPath, showFolderName, seasonFolderName)
      : path.join(rootFolderPath, showFolderName);

    fs.mkdirSync(destDir, { recursive: true });
    if (cfg.applyPermissions && cfg.folderChmod) {
      fs.chmodSync(destDir, Number.parseInt(cfg.folderChmod, 8));
    }

    const result = importEpisodeFile(mf.path, destDir, ep.id, cfg);
    if (result) {
      importedCount += 1;
      db.update(episodes)
        .set({ hasFile: true })
        .where(eq(episodes.id, ep.id))
        .run();
    }
  }

  if (importedCount === 0) {
    markFailed(td.id, "No episode files matched or imported from pack");
    return;
  }

  db.insert(history)
    .values({
      eventType: "episodePackImported",
      showId: td.showId,
      data: {
        title: show.title,
        releaseTitle: td.releaseTitle,
        filesImported: importedCount,
      },
    })
    .run();

  db.update(trackedDownloads)
    .set({ state: "imported", updatedAt: new Date() })
    .where(eq(trackedDownloads.id, td.id))
    .run();

  console.log(
    `[file-import] Imported ${importedCount} episode(s) from pack for "${show.title}"`,
  );
}

async function importBookPackDownload(
  td: typeof trackedDownloads.$inferSelect,
): Promise<void> {
  if (!td.outputPath || !td.authorId) {
    markFailed(td.id, "Missing output path or author ID for book pack");
    return;
  }

  const sourceDir = resolveSourceDir(td.outputPath);
  if (!sourceDir) {
    markFailed(td.id, "Download output path not found");
    return;
  }

  const files = scanForBookFiles(sourceDir, buildScanExtensions());
  if (files.length === 0) {
    markFailed(td.id, "No book files found in book pack download");
    return;
  }

  const author = db
    .select()
    .from(authors)
    .where(eq(authors.id, td.authorId))
    .get();
  if (!author) {
    markFailed(td.id, `Author ${td.authorId} not found`);
    return;
  }

  const rootFolderPath = resolveRootFolder(td.downloadProfileId);
  if (!rootFolderPath) {
    markFailed(td.id, "No root folder configured in download profiles");
    return;
  }

  const primaryType = resolveProfileType(td.downloadProfileId);
  const cfg = readImportSettings(primaryType);

  if (!cfg.skipFreeSpaceCheck) {
    const spaceError = checkFreeSpace(rootFolderPath, cfg.minimumFreeSpace);
    if (spaceError) {
      markFailed(td.id, spaceError);
      return;
    }
  }

  // Map files to extracted titles
  const mapped = mapBookFiles(files);
  if (mapped.length === 0) {
    markFailed(td.id, "No book files could be parsed from pack");
    return;
  }

  // Load all books for this author
  const authorBooks = db
    .select({
      id: books.id,
      title: books.title,
      releaseYear: books.releaseYear,
    })
    .from(books)
    .innerJoin(booksAuthors, eq(booksAuthors.bookId, books.id))
    .where(
      and(
        eq(booksAuthors.authorId, td.authorId),
        eq(booksAuthors.isPrimary, true),
      ),
    )
    .all();

  // Check which books already have files
  const booksWithFiles = new Set(
    db
      .select({ bookId: bookFiles.bookId })
      .from(bookFiles)
      .all()
      .filter((bf) => authorBooks.some((ab) => ab.id === bf.bookId))
      .map((bf) => bf.bookId),
  );

  const authorFolderName = sanitizePath(
    applyNamingTemplate(
      getMediaSetting(
        `naming.book.${primaryType}.authorFolder`,
        "{Author Name}",
      ),
      { "Author Name": author.name },
    ),
  );

  let importedCount = 0;
  for (const mf of mapped) {
    const bestMatch = fuzzyMatchBook(mf.extractedTitle, authorBooks);
    if (!bestMatch || booksWithFiles.has(bestMatch.id)) {
      continue;
    }

    const namingVars: Record<string, string> = {
      "Author Name": author.name,
      "Book Title": bestMatch.title,
      "Release Year": bestMatch.releaseYear
        ? String(bestMatch.releaseYear)
        : "",
      "Book Series": "",
      "Book SeriesPosition": "",
      PartNumber: "",
      PartCount: "",
    };

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

    const imported = await importAndProbeBookFile(
      mf.path,
      destDir,
      bestMatch.id,
      cfg,
    );
    if (imported) {
      importedCount += 1;
      booksWithFiles.add(bestMatch.id);
    }
  }

  if (importedCount === 0) {
    markFailed(td.id, "No book files matched or imported from pack");
    return;
  }

  db.insert(history)
    .values({
      eventType: "bookPackImported",
      authorId: td.authorId,
      data: {
        authorName: author.name,
        releaseTitle: td.releaseTitle,
        filesImported: importedCount,
      },
    })
    .run();

  db.update(trackedDownloads)
    .set({ state: "imported", updatedAt: new Date() })
    .where(eq(trackedDownloads.id, td.id))
    .run();

  eventBus.emit({
    type: "importCompleted",
    bookId: null,
    bookTitle: `${author.name} (pack: ${importedCount} books)`,
  });

  console.log(
    `[file-import] Imported ${importedCount} book(s) from pack for author "${author.name}"`,
  );
}

async function importMangaPackDownload(
  td: typeof trackedDownloads.$inferSelect,
): Promise<void> {
  if (!td.outputPath || !td.mangaId) {
    markFailed(td.id, "Missing output path or manga ID for manga pack");
    return;
  }

  const sourceDir = resolveSourceDir(td.outputPath);
  if (!sourceDir) {
    markFailed(td.id, "Download output path not found");
    return;
  }

  const allFiles = scanForBookFiles(sourceDir, MANGA_EXTENSIONS);
  if (allFiles.length === 0) {
    markFailed(td.id, "No manga files found in manga pack download");
    return;
  }

  const mangaRow = db
    .select()
    .from(manga)
    .where(eq(manga.id, td.mangaId))
    .get();
  if (!mangaRow) {
    markFailed(td.id, `Manga ${td.mangaId} not found`);
    return;
  }

  const rootFolderPath = resolveMangaRootFolder(td.mangaId);
  if (!rootFolderPath) {
    markFailed(td.id, "No root folder configured for manga download profiles");
    return;
  }

  const cfg = readImportSettings("ebook");

  if (!cfg.skipFreeSpaceCheck) {
    const spaceError = checkFreeSpace(rootFolderPath, cfg.minimumFreeSpace);
    if (spaceError) {
      markFailed(td.id, spaceError);
      return;
    }
  }

  // Map files to volume/chapter numbers
  const mapped = mapMangaFiles(allFiles);
  if (mapped.length === 0) {
    markFailed(td.id, "No files matched volume/chapter pattern in manga pack");
    return;
  }

  // Load all chapters for this manga with their volume info
  const allChapters = db
    .select({
      id: mangaChapters.id,
      chapterNumber: mangaChapters.chapterNumber,
      hasFile: mangaChapters.hasFile,
      mangaVolumeId: mangaChapters.mangaVolumeId,
      volumeNumber: mangaVolumes.volumeNumber,
    })
    .from(mangaChapters)
    .innerJoin(mangaVolumes, eq(mangaChapters.mangaVolumeId, mangaVolumes.id))
    .where(eq(mangaChapters.mangaId, td.mangaId))
    .all();

  const mangaFolderName = sanitizePath(
    applyNamingTemplate(
      getMediaSetting("naming.manga.mangaFolder", "{Manga Title} ({Year})"),
      { "Manga Title": mangaRow.title, Year: mangaRow.year ?? "" },
    ),
  );

  let importedCount = 0;
  for (const mf of mapped) {
    const matchedChapter = matchMangaChapter(mf, allChapters);
    if (!matchedChapter || matchedChapter.hasFile) {
      continue;
    }

    const { destPath } = buildMangaPackDest(
      matchedChapter,
      mangaRow,
      rootFolderPath,
      mangaFolderName,
      mf.path,
      cfg,
    );

    if (importMangaPackFile(mf.path, destPath, matchedChapter.id, cfg)) {
      importedCount += 1;
    }
  }

  if (importedCount === 0) {
    markFailed(td.id, "No manga files matched or imported from pack");
    return;
  }

  db.insert(history)
    .values({
      eventType: "mangaPackImported",
      mangaId: td.mangaId,
      data: {
        title: mangaRow.title,
        releaseTitle: td.releaseTitle,
        filesImported: importedCount,
      },
    })
    .run();

  db.update(trackedDownloads)
    .set({ state: "imported", updatedAt: new Date() })
    .where(eq(trackedDownloads.id, td.id))
    .run();

  eventBus.emit({
    type: "mangaImportCompleted",
    mangaId: td.mangaId,
    mangaTitle: mangaRow.title,
    chapter: `pack (${importedCount} chapters)`,
  });

  console.log(
    `[file-import] Imported ${importedCount} chapter(s) from pack for manga "${mangaRow.title}"`,
  );
}

// oxlint-disable-next-line complexity -- Manga import pipeline with validation, file tracking, and history
async function importMangaDownload(
  td: typeof trackedDownloads.$inferSelect,
): Promise<void> {
  if (!td.outputPath) {
    markFailed(td.id, "Download output path not set");
    return;
  }

  const sourceDir = resolveSourceDir(td.outputPath);
  if (!sourceDir) {
    markFailed(td.id, "Download output path not found");
    return;
  }

  const mangaFiles_ = scanForBookFiles(sourceDir, MANGA_EXTENSIONS);
  if (mangaFiles_.length === 0) {
    markFailed(td.id, "No manga files found in download");
    return;
  }

  if (!td.mangaId || !td.mangaChapterId) {
    markFailed(td.id, "Missing manga or chapter ID on tracked download");
    return;
  }

  const mangaRow = db
    .select()
    .from(manga)
    .where(eq(manga.id, td.mangaId))
    .get();
  if (!mangaRow) {
    markFailed(td.id, `Manga ${td.mangaId} not found`);
    return;
  }

  const chapter = db
    .select()
    .from(mangaChapters)
    .where(eq(mangaChapters.id, td.mangaChapterId))
    .get();
  if (!chapter) {
    markFailed(td.id, `Chapter ${td.mangaChapterId} not found`);
    return;
  }

  const volume = db
    .select()
    .from(mangaVolumes)
    .where(eq(mangaVolumes.id, chapter.mangaVolumeId))
    .get();

  const rootFolderPath = resolveMangaRootFolder(td.mangaId);
  if (!rootFolderPath) {
    markFailed(td.id, "No root folder configured for manga download profiles");
    return;
  }

  const cfg = readImportSettings("ebook"); // reuse book import settings

  if (!cfg.skipFreeSpaceCheck) {
    const spaceError = checkFreeSpace(rootFolderPath, cfg.minimumFreeSpace);
    if (spaceError) {
      markFailed(td.id, spaceError);
      return;
    }
  }

  // Record existing files for this chapter before import
  const existingFiles = db
    .select({ id: mangaFiles.id, path: mangaFiles.path })
    .from(mangaFiles)
    .where(eq(mangaFiles.chapterId, td.mangaChapterId))
    .all();

  // Build naming variables
  const namingVars: Record<string, string> = {
    "Manga Title": mangaRow.title,
    Volume:
      volume?.volumeNumber === null || volume?.volumeNumber === undefined
        ? ""
        : String(volume.volumeNumber),
    Chapter: chapter.chapterNumber,
    "Chapter Title": chapter.title ?? "",
    "Scanlation Group": chapter.scanlationGroup ?? "",
    Year: mangaRow.year ?? "",
  };

  // Build destination directory: root / mangaFolder / volumeFolder
  const mangaFolderName = sanitizePath(
    applyNamingTemplate(
      getMediaSetting("naming.manga.mangaFolder", "{Manga Title} ({Year})"),
      namingVars,
    ),
  );

  const volumeFolderName =
    volume?.volumeNumber === null || volume?.volumeNumber === undefined
      ? ""
      : sanitizePath(
          applyNamingTemplate(
            getMediaSetting("naming.manga.volumeFolder", "Volume {Volume:00}"),
            namingVars,
          ),
        );

  const destDir = volumeFolderName
    ? path.join(rootFolderPath, mangaFolderName, volumeFolderName)
    : path.join(rootFolderPath, mangaFolderName);

  fs.mkdirSync(destDir, { recursive: true });
  if (cfg.applyPermissions && cfg.folderChmod) {
    fs.chmodSync(destDir, Number.parseInt(cfg.folderChmod, 8));
  }

  // Determine chapter file naming
  const chapterTemplate = getMediaSetting(
    "naming.manga.chapterFile",
    "{Manga Title} - Chapter {Chapter:000}",
  );

  let importedCount = 0;
  for (const filePath of mangaFiles_) {
    const ext = path.extname(filePath).toLowerCase();
    const format = ext.replace(".", ""); // cbz, cbr, pdf, epub
    const fileSize = fs.statSync(filePath).size;

    // Build destination filename
    const newName =
      sanitizePath(applyNamingTemplate(chapterTemplate, namingVars)) + ext;
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
        title: path.basename(filePath),
        size: fileSize,
        indexerFlags: 0,
      });

      db.insert(mangaFiles)
        .values({
          chapterId: td.mangaChapterId!,
          path: destPath,
          size: fs.statSync(destPath).size,
          format,
          quality: JSON.stringify({
            quality: { id: quality.id, name: quality.name },
            revision: { version: 1, real: 0 },
          }),
          dateAdded: new Date(),
        })
        .run();

      importedCount += 1;
      // Only import the first manga file per chapter
      break;
    } catch (error) {
      console.error(
        `[file-import] Failed to import manga file ${path.basename(filePath)}: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  if (importedCount === 0) {
    markFailed(td.id, "All manga file imports failed");
    return;
  }

  // Mark chapter as having a file
  db.update(mangaChapters)
    .set({ hasFile: true })
    .where(eq(mangaChapters.id, td.mangaChapterId))
    .run();

  // Clean up old files on upgrade
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
      db.delete(mangaFiles).where(eq(mangaFiles.id, oldFile.id)).run();
    }
    console.log(
      `[file-import] Cleaned up ${existingFiles.length} old manga file(s) for "${mangaRow.title}" ch.${chapter.chapterNumber}`,
    );
  }

  db.insert(history)
    .values({
      eventType: "mangaChapterImported",
      mangaId: td.mangaId,
      mangaChapterId: td.mangaChapterId,
      data: {
        title: mangaRow.title,
        chapter: chapter.chapterNumber,
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

  const chapterLabel = `Ch. ${chapter.chapterNumber}`;
  eventBus.emit({
    type: "mangaImportCompleted",
    mangaId: td.mangaId,
    mangaTitle: mangaRow.title,
    chapter: chapterLabel,
  });

  console.log(
    `[file-import] Imported manga "${mangaRow.title}" ${chapterLabel} to ${destDir}`,
  );
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

  // Pack download detection — parent ID set but item ID null
  const isEpisodePack = td.showId && !td.episodeId;
  const isBookPack = td.authorId && !td.bookId;
  const isMangaPack = td.mangaId && !td.mangaChapterId;

  if (isEpisodePack) {
    await importEpisodePackDownload(td);
    return;
  }
  if (isBookPack) {
    await importBookPackDownload(td);
    return;
  }
  if (isMangaPack) {
    await importMangaPackDownload(td);
    return;
  }

  // Route manga downloads to dedicated import handler
  if (td.mangaId && td.mangaChapterId) {
    await importMangaDownload(td);
    return;
  }

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
