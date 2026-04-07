import fs from "node:fs";
import path from "node:path";
import { and, eq, like, sql } from "drizzle-orm";
import { db } from "src/db";
import {
	authors,
	bookFiles,
	books,
	booksAuthors,
	downloadProfiles,
	episodeFiles,
	history,
	movieFiles,
	unmappedFiles,
} from "src/db/schema";
import { extractHints } from "src/server/hint-extractor";
import { matchFormat } from "src/server/indexers/format-parser";
import { probeAudioFile, probeEbookFile } from "src/server/media-probe";
import { getRootFolderPaths } from "src/server/root-folders";

export { getRootFolderPaths };

const AUDIO_EXTENSIONS = new Set([".mp3", ".m4b", ".flac"]);

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

const VIDEO_EXTENSIONS = new Set([".mkv", ".mp4", ".avi", ".ts"]);

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
	part: number | null;
	partCount: number | null;
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

type UnmappedFileInfo = {
	absolutePath: string;
	size: number;
	format: string;
};

function collectAllFiles(
	dirPath: string,
	extensions: Set<string>,
): UnmappedFileInfo[] {
	const results: UnmappedFileInfo[] = [];

	function walkDir(currentPath: string): void {
		let entries: fs.Dirent[];
		try {
			entries = fs.readdirSync(currentPath, { withFileTypes: true });
		} catch {
			return;
		}

		for (const entry of entries) {
			const fullPath = path.join(currentPath, entry.name);
			if (entry.isDirectory()) {
				walkDir(fullPath);
			} else if (entry.isFile()) {
				const ext = path.extname(entry.name).toLowerCase();
				if (extensions.has(ext)) {
					try {
						const stat = fs.statSync(fullPath);
						results.push({
							absolutePath: fullPath,
							size: stat.size,
							format: ext.slice(1),
						});
					} catch {
						// Skip unreadable files
					}
				}
			}
		}
	}

	walkDir(dirPath);
	return results;
}

function getContentTypeForRootFolder(rootFolderPath: string): string | null {
	const profiles = db
		.select({ contentType: downloadProfiles.contentType })
		.from(downloadProfiles)
		.where(eq(downloadProfiles.rootFolderPath, rootFolderPath))
		.all();

	if (profiles.length === 0) return null;
	return profiles[0].contentType;
}

function syncUnmappedFiles(
	rootFolderPath: string,
	discoveredFiles: Map<string, DiscoveredFile>,
	contentType: string,
): void {
	const extensions =
		contentType === "movie" || contentType === "tv"
			? VIDEO_EXTENSIONS
			: SUPPORTED_EXTENSIONS;

	const allFiles = collectAllFiles(rootFolderPath, extensions);

	// Filter out files matched in pass 1
	const unmapped = allFiles.filter((f) => !discoveredFiles.has(f.absolutePath));

	// Also filter out files already tracked in content file tables
	const existingTrackedPaths = new Set<string>();

	for (const row of db
		.select({ path: bookFiles.path })
		.from(bookFiles)
		.where(like(bookFiles.path, `${rootFolderPath}%`))
		.all()) {
		existingTrackedPaths.add(row.path);
	}

	for (const row of db
		.select({ path: movieFiles.path })
		.from(movieFiles)
		.where(like(movieFiles.path, `${rootFolderPath}%`))
		.all()) {
		existingTrackedPaths.add(row.path);
	}

	for (const row of db
		.select({ path: episodeFiles.path })
		.from(episodeFiles)
		.where(like(episodeFiles.path, `${rootFolderPath}%`))
		.all()) {
		existingTrackedPaths.add(row.path);
	}

	const trulyUnmapped = unmapped.filter(
		(f) => !existingTrackedPaths.has(f.absolutePath),
	);

	// Get existing unmapped file paths for this root folder
	const existingUnmapped = new Map(
		db
			.select({ id: unmappedFiles.id, path: unmappedFiles.path })
			.from(unmappedFiles)
			.where(eq(unmappedFiles.rootFolderPath, rootFolderPath))
			.all()
			.map((r) => [r.path, r.id] as const),
	);

	const discoveredPaths = new Set(trulyUnmapped.map((f) => f.absolutePath));

	// Upsert unmapped files
	for (const file of trulyUnmapped) {
		let hints = extractHints(file.absolutePath, contentType);
		// Try EPUB metadata extraction if filename parsing didn't work
		if (!hints && file.format === "epub") {
			const meta = probeEbookFile(file.absolutePath);
			if (meta?.language) {
				hints = { source: "metadata" };
			}
		}

		const quality = matchFormat({
			title: path.basename(file.absolutePath),
			size: file.size,
			indexerFlags: null,
		});

		if (existingUnmapped.has(file.absolutePath)) {
			db.update(unmappedFiles)
				.set({
					size: file.size,
					format: file.format,
					hints,
					quality: {
						quality: { id: quality.id, name: quality.name },
						revision: { version: 1, real: 0 },
					},
				})
				.where(eq(unmappedFiles.path, file.absolutePath))
				.run();
		} else {
			db.insert(unmappedFiles)
				.values({
					path: file.absolutePath,
					size: file.size,
					rootFolderPath,
					contentType,
					format: file.format,
					hints,
					quality: {
						quality: { id: quality.id, name: quality.name },
						revision: { version: 1, real: 0 },
					},
				})
				.run();
		}
	}

	// Remove unmapped files that no longer exist on disk
	for (const [existingPath, existingId] of existingUnmapped) {
		if (!discoveredPaths.has(existingPath)) {
			db.delete(unmappedFiles).where(eq(unmappedFiles.id, existingId)).run();
		}
	}

	// Remove any unmapped files that were matched in pass 1
	for (const [matchedPath] of discoveredFiles) {
		if (existingUnmapped.has(matchedPath)) {
			db.delete(unmappedFiles).where(eq(unmappedFiles.path, matchedPath)).run();
		}
	}
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

	// Sort with natural order so part numbers are assigned correctly
	files.sort((a, b) =>
		a.name.localeCompare(b.name, undefined, {
			numeric: true,
			sensitivity: "base",
		}),
	);

	const audioFiles = files.filter((f) =>
		AUDIO_EXTENSIONS.has(path.extname(f.name).toLowerCase()),
	);
	const audioCount = audioFiles.length;
	let audioIndex = 0;

	for (const file of files) {
		const absolutePath = path.join(bookPath, file.name);
		const ext = path.extname(file.name).toLowerCase();
		const isAudio = AUDIO_EXTENSIONS.has(ext);

		let part: number | null = null;
		let partCount: number | null = null;
		if (isAudio && audioCount > 1) {
			audioIndex += 1;
			part = audioIndex;
			partCount = audioCount;
		}

		try {
			const fileStat = fs.statSync(absolutePath);
			const quality = matchFormat({
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
					part: discovered.part,
					partCount: discovered.partCount,
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

export async function rescanRootFolder(
	rootFolderPath: string,
): Promise<ScanStats> {
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

	// Determine content type and profile for this root folder
	const contentType = getContentTypeForRootFolder(rootFolderPath);

	// Look up the profile ID for setting downloadProfileId on matched files
	const profile = db
		.select({ id: downloadProfiles.id })
		.from(downloadProfiles)
		.where(eq(downloadProfiles.rootFolderPath, rootFolderPath))
		.limit(1)
		.get();

	// Walk directories and discover files
	const authorLookup = buildAuthorLookup();
	const discoveredFiles = walkDirectories(rootFolderPath, authorLookup, stats);

	// Sync discovered files with DB
	syncBookFiles(rootFolderPath, discoveredFiles, stats);

	// Set downloadProfileId on newly added files that don't have one
	if (profile) {
		db.update(bookFiles)
			.set({ downloadProfileId: profile.id })
			.where(
				and(
					like(bookFiles.path, `${rootFolderPath}%`),
					sql`${bookFiles.downloadProfileId} IS NULL`,
				),
			)
			.run();
	}

	// Pass 2: Collect unmapped files
	if (contentType) {
		syncUnmappedFiles(rootFolderPath, discoveredFiles, contentType);
	}

	// Probe metadata for files that don't have it yet
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

	return stats;
}
