import fs from "node:fs";
import path from "node:path";
import { createServerFn } from "@tanstack/react-start";
import { and, count, eq, like, or } from "drizzle-orm";
import { db } from "src/db";
import {
	bookFiles,
	downloadProfiles,
	episodeFiles,
	history,
	movieFiles,
	unmappedFiles,
} from "src/db/schema";
import { eventBus } from "src/server/event-bus";
import {
	probeAudioFile,
	probeEbookFile,
	probeVideoFile,
} from "src/server/media-probe";
import { requireAdmin, requireAuth } from "src/server/middleware";
import { z } from "zod";

// ─── Helpers ───────────────────────────────────────────────────────────────

const AUDIO_EXTENSIONS = new Set([".mp3", ".m4b", ".flac"]);
const VIDEO_EXTENSIONS = new Set([".mkv", ".mp4", ".avi", ".ts"]);

function naturalSort(a: string, b: string): number {
	return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
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
				console.warn(
					`[unmapped-files] Failed to delete file from disk: ${file.path}: ${error instanceof Error ? error.message : String(error)}`,
				);
			}

			// Delete from DB
			db.delete(unmappedFiles).where(eq(unmappedFiles.id, id)).run();
		}

		eventBus.emit({ type: "unmappedFilesUpdated" });
		return { success: true };
	});

// ─── mapUnmappedFileFn ─────────────────────────────────────────────────────

const mapUnmappedFileSchema = z.object({
	unmappedFileIds: z.array(z.number()),
	entityType: z.enum(["book", "movie", "episode"]),
	entityId: z.number(),
	downloadProfileId: z.number(),
});

export const mapUnmappedFileFn = createServerFn({ method: "POST" })
	.inputValidator((d: unknown) => mapUnmappedFileSchema.parse(d))
	.handler(async ({ data }) => {
		await requireAdmin();

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

				db.insert(bookFiles)
					.values({
						bookId: data.entityId,
						path: file.path,
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

				db.insert(history)
					.values({
						eventType: "bookFileAdded",
						bookId: data.entityId,
						data: {
							path: file.path,
							size: file.size,
							quality: file.quality?.quality?.name ?? "Unknown",
							source: "unmappedFileMapping",
						},
					})
					.run();
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

			// Remove from unmapped files
			db.delete(unmappedFiles).where(eq(unmappedFiles.id, file.id)).run();
			mappedCount++;
		}

		eventBus.emit({ type: "unmappedFilesUpdated" });
		return { success: true, mappedCount };
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
