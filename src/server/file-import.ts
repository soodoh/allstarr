import fs from "node:fs";
import path from "node:path";
import { and, eq } from "drizzle-orm";
import * as fuzz from "fuzzball";
import { db } from "src/db";
import {
	authors,
	bookFiles,
	books,
	booksAuthors,
	downloadProfiles,
	episodeFiles,
	episodes,
	history,
	seasons,
	showDownloadProfiles,
	shows,
	trackedDownloads,
} from "src/db/schema";
import {
	applyNamingTemplate,
	buildBookAuthorFolderName,
	buildBookFolderName,
	sanitizePath,
} from "./book-paths";
import { eventBus } from "./event-bus";
import { mapBookFiles, mapTvFiles } from "./import-mapping";
import { matchFormat } from "./indexers/format-parser";
import { logError, logInfo, logWarn } from "./logger";
import { probeAudioFile, probeEbookFile } from "./media-probe";
import getMediaSetting from "./settings-reader";
import {
	claimTrackedDownloadImport,
	markTrackedDownloadFailed,
	markTrackedDownloadImported,
} from "./tracked-download-state";

type ImportResult = {
	bookFileId: number | null;
	destPath: string;
} | null;

export function buildManagedEpisodeDestination({
	rootFolderPath,
	showTitle,
	showYear,
	seasonNumber,
	useSeasonFolder,
	sourcePath,
}: {
	rootFolderPath: string;
	seasonNumber: number;
	showTitle: string;
	showYear?: number | null;
	sourcePath: string;
	useSeasonFolder: boolean;
}): string {
	const showFolderName = sanitizePath(
		applyNamingTemplate(
			getMediaSetting("naming.tv.showFolder", "{Show Title} ({Year})"),
			{
				"Show Title": showTitle,
				Year: showYear ? String(showYear) : "",
			},
		),
	);

	const seasonFolderName = sanitizePath(
		applyNamingTemplate(
			getMediaSetting("naming.tv.seasonFolder", "Season {Season:00}"),
			{ Season: String(seasonNumber) },
		),
	);

	const baseDir = useSeasonFolder
		? path.join(rootFolderPath, showFolderName, seasonFolderName)
		: path.join(rootFolderPath, showFolderName);

	return path.join(baseDir, path.basename(sourcePath));
}

export function buildManagedMovieDestination({
	rootFolderPath,
	movieTitle,
	movieYear,
	sourcePath,
}: {
	rootFolderPath: string;
	movieTitle: string;
	movieYear?: number | null;
	sourcePath: string;
}): string {
	const movieFolderName = sanitizePath(
		movieYear ? `${movieTitle} (${movieYear})` : movieTitle,
	);

	return path.join(rootFolderPath, movieFolderName, path.basename(sourcePath));
}

const AUDIO_EXTENSIONS = new Set([".mp3", ".m4b", ".flac"]);
const EBOOK_EXTENSIONS = new Set([".pdf", ".epub", ".mobi", ".azw3", ".azw"]);

type MediaType = "ebook" | "audio";

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
		logError(
			"file-import",
			`Failed to import ${filename}: ${error instanceof Error ? error.message : "Unknown error"}`,
			error,
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
		logWarn("file-import", "Could not check free space, proceeding anyway");
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
		logError(
			"file-import",
			`Failed to import ${path.basename(filePath)}: ${error instanceof Error ? error.message : "Unknown error"}`,
			error,
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
			const defaultTemplate =
				mediaType === "audio" && isMultiPart
					? "{Author Name} - {Book Title} - Part {PartNumber:00}"
					: "{Author Name} - {Book Title}";
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
	markTrackedDownloadFailed(id, message);
	logWarn("file-import", `Failed: ${message}`);
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
		logError(
			"file-import",
			`Failed to import episode file ${filename}: ${error instanceof Error ? error.message : "Unknown error"}`,
			error,
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

		const destDir = path.dirname(
			buildManagedEpisodeDestination({
				rootFolderPath,
				showTitle: show.title,
				showYear: show.year,
				seasonNumber: mf.season,
				useSeasonFolder: Boolean(show.useSeasonFolder),
				sourcePath: path.join(
					rootFolderPath,
					`${show.title} S${String(mf.season).padStart(2, "0")}E${String(mf.episode).padStart(2, "0")}${path.extname(mf.path)}`,
				),
			}),
		);

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

	markTrackedDownloadImported(td.id);

	logInfo(
		"file-import",
		`Imported ${importedCount} episode(s) from pack for "${show.title}"`,
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

	let importedCount = 0;
	for (const mf of mapped) {
		const bestMatch = fuzzyMatchBook(mf.extractedTitle, authorBooks);
		if (!bestMatch || booksWithFiles.has(bestMatch.id)) {
			continue;
		}

		const authorFolderName = buildBookAuthorFolderName({
			mediaType: primaryType,
			authorName: author.name,
			bookTitle: bestMatch.title,
			releaseYear: bestMatch.releaseYear,
			authorFolderVarsMode: "author-only",
		});
		const bookFolderName = buildBookFolderName({
			mediaType: primaryType,
			authorName: author.name,
			bookTitle: bestMatch.title,
			releaseYear: bestMatch.releaseYear,
		});

		const destDir = path.join(rootFolderPath, authorFolderName, bookFolderName);
		fs.mkdirSync(destDir, { recursive: true });
		if (cfg.applyPermissions && cfg.folderChmod) {
			fs.chmodSync(destDir, Number.parseInt(cfg.folderChmod, 8));
		}

		const mediaType = AUDIO_EXTENSIONS.has(path.extname(mf.path).toLowerCase())
			? "audio"
			: "ebook";
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
		const imported = await importFiles(
			[mf.path],
			destDir,
			bestMatch.id,
			namingVars,
			cfg,
			mediaType,
		);
		if (imported > 0) {
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

	markTrackedDownloadImported(td.id);

	eventBus.emit({
		type: "importCompleted",
		bookId: null,
		bookTitle: `${author.name} (pack: ${importedCount} books)`,
	});

	logInfo(
		"file-import",
		`Imported ${importedCount} book(s) from pack for author "${author.name}"`,
	);
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

	claimTrackedDownloadImport(td.id);

	try {
		await importCompletedTrackedDownload(td);
	} catch (error) {
		const message = error instanceof Error ? error.message : "Unknown error";
		try {
			markTrackedDownloadFailed(td.id, message);
		} catch (markError) {
			logError(
				"file-import",
				`Failed to mark tracked download ${td.id} failed: ${markError instanceof Error ? markError.message : "Unknown error"}`,
				markError,
			);
		}
		throw error;
	}
}

async function importCompletedTrackedDownload(
	td: typeof trackedDownloads.$inferSelect,
): Promise<void> {
	// Pack download detection — parent ID set but item ID null
	const isEpisodePack = td.showId && !td.episodeId;
	const isBookPack = td.authorId && !td.bookId;

	if (isEpisodePack) {
		await importEpisodePackDownload(td);
		return;
	}
	if (isBookPack) {
		await importBookPackDownload(td);
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

	const authorFolderName = buildBookAuthorFolderName({
		mediaType: primaryType,
		authorName,
		bookTitle,
		releaseYear: year,
	});
	const bookFolderName = buildBookFolderName({
		mediaType: primaryType,
		authorName,
		bookTitle,
		releaseYear: year,
	});

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
		logInfo(
			"file-import",
			`Cleaned up ${existingFiles.length} old file(s) for "${bookTitle}"`,
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

	markTrackedDownloadImported(td.id);

	eventBus.emit({ type: "importCompleted", bookId: td.bookId, bookTitle });

	logInfo(
		"file-import",
		`Imported ${importedCount} files for "${bookTitle}" to ${destDir}`,
	);
}
