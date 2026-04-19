import * as path from "node:path";
import { createServerFn } from "@tanstack/react-start";
import { and, count, eq, like, or } from "drizzle-orm";
import { db } from "src/db";
import {
	bookFiles,
	books,
	booksAuthors,
	downloadProfiles,
	episodeFiles,
	episodes,
	history,
	movieFiles,
	seasons,
	shows,
	unmappedFiles,
} from "src/db/schema";
import {
	buildBookAuthorFolderName,
	buildBookFolderName,
} from "src/server/book-paths";
import { eventBus } from "src/server/event-bus";
import { buildManagedEpisodeDestination } from "src/server/file-import";
import { logWarn } from "src/server/logger";
import { requireAdmin, requireAuth } from "src/server/middleware";
import { z } from "zod";

// ─── Helpers ───────────────────────────────────────────────────────────────

const AUDIO_EXTENSIONS = new Set([".mp3", ".m4b", ".flac"]);
const VIDEO_EXTENSIONS = new Set([".mkv", ".mp4", ".avi", ".ts"]);
const TV_SIDECAR_EXTENSIONS = new Set([
	".ass",
	".idx",
	".nfo",
	".srt",
	".ssa",
	".sub",
	".vtt",
	".xml",
]);
const TV_EPISODE_PATTERN = /S(\d{1,2})E(\d{1,3})/i;

function naturalSort(a: string, b: string): number {
	return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}

function stripFileExtension(filename: string): string {
	const dotIndex = filename.lastIndexOf(".");
	return dotIndex >= 0 ? filename.slice(0, dotIndex) : filename;
}

function getTvEpisodeToken(filePath: string): string | null {
	const match = path.basename(filePath).match(TV_EPISODE_PATTERN);
	return match ? match[0].toUpperCase() : null;
}

function isRelatedTvSidecar(
	sourcePath: string,
	candidatePath: string,
): boolean {
	const candidateExt = path.extname(candidatePath).toLowerCase();
	if (!TV_SIDECAR_EXTENSIONS.has(candidateExt)) {
		return false;
	}

	const sourceStem = stripFileExtension(path.basename(sourcePath));
	const candidateStem = stripFileExtension(path.basename(candidatePath));
	if (candidateStem === sourceStem) {
		return true;
	}

	const sourceToken = getTvEpisodeToken(sourcePath);
	const candidateToken = getTvEpisodeToken(candidatePath);
	return sourceToken != null && candidateToken === sourceToken;
}

function buildManagedTvEpisodePath({
	rootFolderPath,
	showTitle,
	showYear,
	seasonNumber,
	episodeNumber,
	sourcePath,
	useSeasonFolder,
}: {
	episodeNumber: number;
	rootFolderPath: string;
	seasonNumber: number;
	showTitle: string;
	showYear: number | null;
	sourcePath: string;
	useSeasonFolder: boolean;
}): string {
	const managedFilename = `${showTitle} S${String(seasonNumber).padStart(2, "0")}E${String(episodeNumber).padStart(2, "0")}${path.extname(sourcePath)}`;
	return buildManagedEpisodeDestination({
		rootFolderPath,
		showTitle,
		showYear,
		seasonNumber,
		useSeasonFolder,
		sourcePath: path.join(path.dirname(sourcePath), managedFilename),
	});
}

function buildManagedTvSidecarPath(
	managedEpisodePath: string,
	sidecarPath: string,
): string {
	return path.join(
		path.dirname(managedEpisodePath),
		`${stripFileExtension(path.basename(managedEpisodePath))}${path.extname(sidecarPath)}`,
	);
}

function moveFileToManagedPath(
	fs: typeof import("node:fs"),
	sourcePath: string,
	destPath: string,
): void {
	fs.mkdirSync(path.dirname(destPath), { recursive: true });

	try {
		fs.renameSync(sourcePath, destPath);
		return;
	} catch (error) {
		if (
			!(error instanceof Error) ||
			!("code" in error) ||
			error.code !== "EXDEV"
		) {
			throw error;
		}
	}

	fs.copyFileSync(sourcePath, destPath);
	try {
		fs.unlinkSync(sourcePath);
	} catch (error) {
		try {
			fs.unlinkSync(destPath);
		} catch {
			// Ignore cleanup failures so the original unlink error is preserved.
		}
		throw error;
	}
}

function resolveManagedRootFolder(downloadProfileId: number): string | null {
	const profile = db
		.select()
		.from(downloadProfiles)
		.where(eq(downloadProfiles.id, downloadProfileId))
		.get();

	if (profile?.rootFolderPath) {
		return profile.rootFolderPath;
	}

	const fallback = db.select().from(downloadProfiles).get();
	return fallback?.rootFolderPath ?? null;
}

// ─── getUnmappedFilesFn ────────────────────────────────────────────────────

const getUnmappedFilesSchema = z.object({
	showIgnored: z.boolean().optional().default(false),
	contentType: z.string().optional(),
	search: z.string().optional(),
});

export const getUnmappedFilesFn = createServerFn({ method: "GET" })
	.inputValidator((d: unknown) => getUnmappedFilesSchema.parse(d))
	.handler(async ({ data }) => {
		await requireAuth();

		const conditions = [];
		if (!data.showIgnored) {
			conditions.push(eq(unmappedFiles.ignored, false));
		}
		if (data.contentType) {
			conditions.push(eq(unmappedFiles.contentType, data.contentType));
		}
		if (data.search) {
			conditions.push(like(unmappedFiles.path, `%${data.search}%`));
		}

		const where = conditions.length > 0 ? and(...conditions) : undefined;

		const rows = db.select().from(unmappedFiles).where(where).all();

		// Group by rootFolderPath
		const grouped = new Map<
			string,
			{
				rootFolderPath: string;
				profileName: string | null;
				contentType: string;
				files: typeof rows;
			}
		>();

		for (const row of rows) {
			let group = grouped.get(row.rootFolderPath);
			if (!group) {
				// Look up profile name for this root folder
				const profile = db
					.select({ name: downloadProfiles.name })
					.from(downloadProfiles)
					.where(eq(downloadProfiles.rootFolderPath, row.rootFolderPath))
					.limit(1)
					.get();

				group = {
					rootFolderPath: row.rootFolderPath,
					profileName: profile?.name ?? null,
					contentType: row.contentType,
					files: [],
				};
				grouped.set(row.rootFolderPath, group);
			}
			group.files.push(row);
		}

		return Array.from(grouped.values());
	});

// ─── getUnmappedFileCountFn ────────────────────────────────────────────────

export const getUnmappedFileCountFn = createServerFn({ method: "GET" }).handler(
	async () => {
		await requireAuth();

		const result = db
			.select({ count: count() })
			.from(unmappedFiles)
			.where(eq(unmappedFiles.ignored, false))
			.get();

		return result?.count ?? 0;
	},
);

// ─── ignoreUnmappedFilesFn ─────────────────────────────────────────────────

const ignoreUnmappedFilesSchema = z.object({
	ids: z.array(z.number()),
	ignored: z.boolean(),
});

export const ignoreUnmappedFilesFn = createServerFn({ method: "POST" })
	.inputValidator((d: unknown) => ignoreUnmappedFilesSchema.parse(d))
	.handler(async ({ data }) => {
		await requireAdmin();

		for (const id of data.ids) {
			db.update(unmappedFiles)
				.set({ ignored: data.ignored })
				.where(eq(unmappedFiles.id, id))
				.run();
		}

		eventBus.emit({ type: "unmappedFilesUpdated" });
		return { success: true };
	});

// ─── deleteUnmappedFilesFn ─────────────────────────────────────────────────

const deleteUnmappedFilesSchema = z.object({
	ids: z.array(z.number()),
});

export const deleteUnmappedFilesFn = createServerFn({ method: "POST" })
	.inputValidator((d: unknown) => deleteUnmappedFilesSchema.parse(d))
	.handler(async ({ data }) => {
		await requireAdmin();
		const fs = await import("node:fs");

		for (const id of data.ids) {
			const file = db
				.select()
				.from(unmappedFiles)
				.where(eq(unmappedFiles.id, id))
				.get();

			if (!file) continue;

			// Delete from disk
			try {
				fs.unlinkSync(file.path);
			} catch (error) {
				logWarn(
					"unmapped-files",
					`Failed to delete file from disk: ${file.path}: ${error instanceof Error ? error.message : String(error)}`,
				);
			}

			// Delete from DB
			db.delete(unmappedFiles).where(eq(unmappedFiles.id, id)).run();
		}

		eventBus.emit({ type: "unmappedFilesUpdated" });
		return { success: true };
	});

// ─── mapUnmappedFileFn ─────────────────────────────────────────────────────

const tvMappingSchema = z.object({
	unmappedFileId: z.number(),
	episodeId: z.number(),
});

const mapUnmappedFileSchema = z.union([
	z
		.object({
			entityType: z.enum(["book", "movie"]),
			unmappedFileIds: z.array(z.number()),
			entityId: z.number(),
			downloadProfileId: z.number(),
		})
		.strict(),
	z
		.object({
			entityType: z.literal("episode"),
			unmappedFileIds: z.array(z.number()),
			entityId: z.number(),
			downloadProfileId: z.number(),
		})
		.strict(),
	z
		.object({
			entityType: z.literal("episode"),
			downloadProfileId: z.number(),
			moveRelatedSidecars: z.boolean().default(false),
			tvMappings: z.array(tvMappingSchema).min(1),
		})
		.strict(),
]);

export const mapUnmappedFileFn = createServerFn({ method: "POST" })
	.inputValidator((d: unknown) => mapUnmappedFileSchema.parse(d))
	.handler(async ({ data }) => {
		await requireAdmin();
		const fs = await import("node:fs");
		const { probeAudioFile, probeEbookFile, probeVideoFile } = await import(
			"src/server/media-probe"
		);

		if (data.entityType === "episode" && "tvMappings" in data) {
			const profile = db
				.select()
				.from(downloadProfiles)
				.where(eq(downloadProfiles.id, data.downloadProfileId))
				.get();

			if (!profile) {
				throw new Error(`Download profile ${data.downloadProfileId} not found`);
			}

			const managedRootPath = resolveManagedRootFolder(profile.id);
			if (!managedRootPath) {
				throw new Error(
					`Download profile ${data.downloadProfileId} has no root folder configured`,
				);
			}

			const mappedIds = new Set(
				data.tvMappings.map((mapping) => mapping.unmappedFileId),
			);
			let mappedCount = 0;

			for (const row of data.tvMappings) {
				const file = db
					.select()
					.from(unmappedFiles)
					.where(eq(unmappedFiles.id, row.unmappedFileId))
					.get();

				if (!file) continue;

				const episode = db
					.select({
						episodeNumber: episodes.episodeNumber,
						seasonNumber: seasons.seasonNumber,
						showTitle: shows.title,
						showYear: shows.year,
						useSeasonFolder: shows.useSeasonFolder,
					})
					.from(episodes)
					.innerJoin(seasons, eq(seasons.id, episodes.seasonId))
					.innerJoin(shows, eq(shows.id, episodes.showId))
					.where(eq(episodes.id, row.episodeId))
					.limit(1)
					.get();

				if (!episode) {
					throw new Error(`Episode ${row.episodeId} not found`);
				}

				let duration: number | null = null;
				let codec: string | null = null;
				let container: string | null = null;

				if (VIDEO_EXTENSIONS.has(path.extname(file.path).toLowerCase())) {
					const meta = await probeVideoFile(file.path);
					if (meta) {
						duration = meta.duration;
						codec = meta.codec;
						container = meta.container;
					}
				}

				const managedEpisodePath = buildManagedTvEpisodePath({
					rootFolderPath: managedRootPath,
					showTitle: episode.showTitle,
					showYear: episode.showYear,
					seasonNumber: episode.seasonNumber,
					episodeNumber: episode.episodeNumber,
					sourcePath: file.path,
					useSeasonFolder: Boolean(episode.useSeasonFolder),
				});
				const movedFiles: Array<{ destPath: string; sourcePath: string }> = [];
				const movedSidecarIds: number[] = [];

				try {
					moveFileToManagedPath(fs, file.path, managedEpisodePath);
					movedFiles.push({
						destPath: managedEpisodePath,
						sourcePath: file.path,
					});

					if (data.moveRelatedSidecars) {
						const candidates = db
							.select()
							.from(unmappedFiles)
							.where(eq(unmappedFiles.rootFolderPath, file.rootFolderPath))
							.all();

						for (const candidate of candidates) {
							if (
								candidate.id === file.id ||
								mappedIds.has(candidate.id) ||
								!isRelatedTvSidecar(file.path, candidate.path)
							) {
								continue;
							}

							const sidecarDest = buildManagedTvSidecarPath(
								managedEpisodePath,
								candidate.path,
							);
							moveFileToManagedPath(fs, candidate.path, sidecarDest);
							movedFiles.push({
								destPath: sidecarDest,
								sourcePath: candidate.path,
							});
							movedSidecarIds.push(candidate.id);
						}
					}

					db.transaction((tx) => {
						tx.insert(episodeFiles)
							.values({
								episodeId: row.episodeId,
								path: managedEpisodePath,
								size: file.size,
								quality: file.quality,
								downloadProfileId: data.downloadProfileId,
								duration,
								codec,
								container,
							})
							.run();

						tx.insert(history)
							.values({
								eventType: "episodeFileAdded",
								episodeId: row.episodeId,
								data: {
									path: managedEpisodePath,
									size: file.size,
									quality: file.quality?.quality?.name ?? "Unknown",
									source: "unmappedFileMapping",
								},
							})
							.run();

						tx.delete(unmappedFiles).where(eq(unmappedFiles.id, file.id)).run();
						for (const sidecarId of movedSidecarIds) {
							tx.delete(unmappedFiles)
								.where(eq(unmappedFiles.id, sidecarId))
								.run();
						}
					});

					mappedCount++;
				} catch (error) {
					for (const moved of [...movedFiles].reverse()) {
						try {
							moveFileToManagedPath(fs, moved.destPath, moved.sourcePath);
						} catch (rollbackError) {
							logWarn(
								"unmapped-files",
								`Failed to roll back TV file move for ${moved.sourcePath}: ${rollbackError instanceof Error ? rollbackError.message : String(rollbackError)}`,
							);
						}
					}
					throw error;
				}
			}

			eventBus.emit({ type: "unmappedFilesUpdated" });
			return { success: true, mappedCount };
		}

		// Validate profile exists
		const profile = db
			.select()
			.from(downloadProfiles)
			.where(eq(downloadProfiles.id, data.downloadProfileId))
			.get();

		if (!profile) {
			throw new Error(`Download profile ${data.downloadProfileId} not found`);
		}

		// Fetch all unmapped files and sort naturally for part numbering
		const files = data.unmappedFileIds
			.map((id) =>
				db.select().from(unmappedFiles).where(eq(unmappedFiles.id, id)).get(),
			)
			.filter((f): f is NonNullable<typeof f> => f != null)
			.sort((a, b) => naturalSort(a.path, b.path));

		let mappedCount = 0;

		// Determine if this is a multi-part audiobook
		const audioFiles = files.filter((f) =>
			AUDIO_EXTENSIONS.has(path.extname(f.path).toLowerCase()),
		);
		const audioCount = audioFiles.length;

		for (let i = 0; i < files.length; i++) {
			const file = files[i];
			const ext = path.extname(file.path).toLowerCase();
			const isAudio = AUDIO_EXTENSIONS.has(ext);
			const isVideo = VIDEO_EXTENSIONS.has(ext);

			if (data.entityType === "book") {
				const book = db
					.select({
						authorName: booksAuthors.authorName,
						releaseYear: books.releaseYear,
						title: books.title,
					})
					.from(books)
					.leftJoin(
						booksAuthors,
						and(
							eq(booksAuthors.bookId, books.id),
							eq(booksAuthors.isPrimary, true),
						),
					)
					.where(eq(books.id, data.entityId))
					.limit(1)
					.get();

				if (!book) {
					throw new Error(`Book ${data.entityId} not found`);
				}

				const mediaType =
					profile.contentType === "audiobook" ? "audio" : "ebook";
				const authorFolderName = buildBookAuthorFolderName({
					mediaType,
					authorName: book.authorName ?? "Unknown Author",
					bookTitle: book.title,
					releaseYear: book.releaseYear,
					authorFolderVarsMode: "author-only",
				});
				const bookFolderName = buildBookFolderName({
					mediaType,
					authorName: book.authorName ?? "Unknown Author",
					bookTitle: book.title,
					releaseYear: book.releaseYear,
				});
				const managedRootPath = resolveManagedRootFolder(
					data.downloadProfileId,
				);
				if (!managedRootPath) {
					throw new Error(
						`Download profile ${data.downloadProfileId} has no root folder configured`,
					);
				}

				// Probe metadata
				let duration: number | null = null;
				let bitrate: number | null = null;
				let sampleRate: number | null = null;
				let channels: number | null = null;
				let codec: string | null = null;
				let pageCount: number | null = null;
				let language: string | null = null;
				let part: number | null = null;
				let partCount: number | null = null;

				if (isAudio) {
					const meta = await probeAudioFile(file.path);
					if (meta) {
						duration = meta.duration;
						bitrate = meta.bitrate;
						sampleRate = meta.sampleRate;
						channels = meta.channels;
						codec = meta.codec;
					}
					if (audioCount > 1) {
						part = audioFiles.indexOf(file) + 1;
						partCount = audioCount;
					}
				} else {
					const meta = probeEbookFile(file.path);
					if (meta) {
						pageCount = meta.pageCount;
						language = meta.language;
					}
				}

				const destPath = path.join(
					managedRootPath,
					authorFolderName,
					bookFolderName,
					path.basename(file.path),
				);
				moveFileToManagedPath(fs, file.path, destPath);

				try {
					db.transaction((tx) => {
						tx.insert(bookFiles)
							.values({
								bookId: data.entityId,
								path: destPath,
								size: file.size,
								quality: file.quality,
								downloadProfileId: data.downloadProfileId,
								duration,
								bitrate,
								sampleRate,
								channels,
								codec,
								pageCount,
								language,
								part,
								partCount,
							})
							.run();

						tx.insert(history)
							.values({
								eventType: "bookFileAdded",
								bookId: data.entityId,
								data: {
									path: destPath,
									size: file.size,
									quality: file.quality?.quality?.name ?? "Unknown",
									source: "unmappedFileMapping",
								},
							})
							.run();

						tx.delete(unmappedFiles).where(eq(unmappedFiles.id, file.id)).run();
					});
				} catch (error) {
					try {
						moveFileToManagedPath(fs, destPath, file.path);
					} catch (rollbackError) {
						logWarn(
							"unmapped-files",
							`Failed to roll back file move for ${file.path}: ${rollbackError instanceof Error ? rollbackError.message : String(rollbackError)}`,
						);
					}
					throw error;
				}
			} else if (data.entityType === "movie") {
				// Probe video metadata
				let duration: number | null = null;
				let codec: string | null = null;
				let container: string | null = null;

				if (isVideo) {
					const meta = await probeVideoFile(file.path);
					if (meta) {
						duration = meta.duration;
						codec = meta.codec;
						container = meta.container;
					}
				}

				db.insert(movieFiles)
					.values({
						movieId: data.entityId,
						path: file.path,
						size: file.size,
						quality: file.quality,
						downloadProfileId: data.downloadProfileId,
						duration,
						codec,
						container,
					})
					.run();

				db.insert(history)
					.values({
						eventType: "movieFileAdded",
						movieId: data.entityId,
						data: {
							path: file.path,
							size: file.size,
							quality: file.quality?.quality?.name ?? "Unknown",
							source: "unmappedFileMapping",
						},
					})
					.run();
			} else if (data.entityType === "episode") {
				// Probe video metadata
				let duration: number | null = null;
				let codec: string | null = null;
				let container: string | null = null;

				if (isVideo) {
					const meta = await probeVideoFile(file.path);
					if (meta) {
						duration = meta.duration;
						codec = meta.codec;
						container = meta.container;
					}
				}

				db.insert(episodeFiles)
					.values({
						episodeId: data.entityId,
						path: file.path,
						size: file.size,
						quality: file.quality,
						downloadProfileId: data.downloadProfileId,
						duration,
						codec,
						container,
					})
					.run();

				db.insert(history)
					.values({
						eventType: "episodeFileAdded",
						episodeId: data.entityId,
						data: {
							path: file.path,
							size: file.size,
							quality: file.quality?.quality?.name ?? "Unknown",
							source: "unmappedFileMapping",
						},
					})
					.run();
			}

			if (data.entityType !== "book") {
				db.delete(unmappedFiles).where(eq(unmappedFiles.id, file.id)).run();
			}
			mappedCount++;
		}

		eventBus.emit({ type: "unmappedFilesUpdated" });
		return { success: true, mappedCount };
	});

// ─── suggestUnmappedTvMappingsFn ──────────────────────────────────────────

const suggestUnmappedTvMappingsSchema = z.object({
	rows: z.array(
		z.object({
			fileId: z.number(),
			contentType: z.literal("tv"),
			path: z.string(),
			hints: z
				.object({
					title: z.string().optional(),
					season: z.number().optional(),
					episode: z.number().optional(),
					source: z.enum(["filename", "path", "metadata"]).optional(),
				})
				.nullable(),
		}),
	),
});

export const suggestUnmappedTvMappingsFn = createServerFn({ method: "GET" })
	.inputValidator((d: unknown) => suggestUnmappedTvMappingsSchema.parse(d))
	.handler(async ({ data }) => {
		await requireAuth();

		const { episodes, seasons, shows } = await import("src/db/schema");

		return {
			rows: data.rows.map((row) => {
				const hintTitle = row.hints?.title?.trim();
				const hintSeason = row.hints?.season;
				const hintEpisode = row.hints?.episode;

				if (!hintTitle || hintSeason == null || hintEpisode == null) {
					return {
						fileId: row.fileId,
						contentType: row.contentType,
						path: row.path,
						hints: row.hints,
						suggestedEpisodeId: null,
						subtitle: "",
					};
				}

				const candidates = db
					.select({
						id: episodes.id,
						episodeNumber: episodes.episodeNumber,
						seasonNumber: seasons.seasonNumber,
						showTitle: shows.title,
						title: episodes.title,
					})
					.from(episodes)
					.innerJoin(seasons, eq(seasons.id, episodes.seasonId))
					.innerJoin(shows, eq(shows.id, episodes.showId))
					.where(
						and(
							like(shows.title, `%${hintTitle}%`),
							eq(seasons.seasonNumber, hintSeason),
							eq(episodes.episodeNumber, hintEpisode),
						),
					)
					.limit(10)
					.all();

				const match = candidates[0];

				return {
					fileId: row.fileId,
					contentType: row.contentType,
					path: row.path,
					hints: row.hints,
					suggestedEpisodeId: match?.id ?? null,
					subtitle: match
						? `S${String(match.seasonNumber).padStart(2, "0")}E${String(match.episodeNumber).padStart(2, "0")} - ${match.title}`
						: "",
				};
			}),
		};
	});

// ─── rescanAllRootFoldersFn ────────────────────────────────────────────────

export const rescanAllRootFoldersFn = createServerFn({
	method: "POST",
}).handler(async () => {
	await requireAdmin();

	// Lazy import to break dependency cycles
	const { getRootFolderPaths, rescanRootFolder } = await import(
		"src/server/disk-scan"
	);

	const rootFolderPaths = getRootFolderPaths();
	const results = [];

	for (const rootFolderPath of rootFolderPaths) {
		const stats = await rescanRootFolder(rootFolderPath);
		results.push({ rootFolderPath, stats });
	}

	eventBus.emit({ type: "unmappedFilesUpdated" });
	return results;
});

// ─── rescanRootFolderFn ────────────────────────────────────────────────────

const rescanRootFolderSchema = z.object({
	rootFolderPath: z.string(),
});

export const rescanRootFolderFn = createServerFn({ method: "POST" })
	.inputValidator((d: unknown) => rescanRootFolderSchema.parse(d))
	.handler(async ({ data }) => {
		await requireAdmin();

		// Lazy import to break dependency cycles
		const { rescanRootFolder } = await import("src/server/disk-scan");

		const stats = await rescanRootFolder(data.rootFolderPath);

		eventBus.emit({ type: "unmappedFilesUpdated" });
		return stats;
	});

// ─── searchLibraryFn ──────────────────────────────────────────────────────

const searchLibrarySchema = z.object({
	query: z.string().min(2).max(120),
	contentType: z.string(),
});

export const searchLibraryFn = createServerFn({ method: "GET" })
	.inputValidator((d: unknown) => searchLibrarySchema.parse(d))
	.handler(async ({ data }) => {
		await requireAuth();

		const library: Array<{
			id: number;
			title: string;
			subtitle: string;
			entityType: "book" | "movie" | "episode";
		}> = [];

		const searchPattern = `%${data.query}%`;

		if (data.contentType === "ebook" || data.contentType === "audiobook") {
			const { books, booksAuthors } = await import("src/db/schema");
			const bookResults = db
				.select({
					id: books.id,
					title: books.title,
					releaseYear: books.releaseYear,
					authorName: booksAuthors.authorName,
				})
				.from(books)
				.leftJoin(
					booksAuthors,
					and(
						eq(booksAuthors.bookId, books.id),
						eq(booksAuthors.isPrimary, true),
					),
				)
				.where(like(books.title, searchPattern))
				.limit(10)
				.all();

			for (const book of bookResults) {
				library.push({
					id: book.id,
					title: book.title,
					subtitle: [book.authorName, book.releaseYear]
						.filter(Boolean)
						.join(" · "),
					entityType: "book",
				});
			}
		} else if (data.contentType === "movie") {
			const { movies } = await import("src/db/schema");
			const movieResults = db
				.select({ id: movies.id, title: movies.title, year: movies.year })
				.from(movies)
				.where(like(movies.title, searchPattern))
				.limit(10)
				.all();

			for (const movie of movieResults) {
				library.push({
					id: movie.id,
					title: movie.title,
					subtitle: movie.year ? String(movie.year) : "",
					entityType: "movie",
				});
			}
		} else if (data.contentType === "tv") {
			const { episodes, seasons, shows } = await import("src/db/schema");
			const episodeResults = db
				.select({
					id: episodes.id,
					title: episodes.title,
					seasonNumber: seasons.seasonNumber,
					episodeNumber: episodes.episodeNumber,
					showTitle: shows.title,
				})
				.from(episodes)
				.innerJoin(seasons, eq(seasons.id, episodes.seasonId))
				.innerJoin(shows, eq(shows.id, episodes.showId))
				.where(
					or(
						like(episodes.title, searchPattern),
						like(shows.title, searchPattern),
					),
				)
				.limit(10)
				.all();

			for (const ep of episodeResults) {
				library.push({
					id: ep.id,
					title: ep.showTitle,
					subtitle: `S${String(ep.seasonNumber).padStart(2, "0")}E${String(ep.episodeNumber).padStart(2, "0")} - ${ep.title}`,
					entityType: "episode",
				});
			}
		}

		return {
			library,
			external: [] as Array<{
				foreignId: string;
				title: string;
				subtitle: string;
				entityType: "book" | "movie" | "episode";
			}>,
		};
	});
