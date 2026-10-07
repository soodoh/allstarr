import { createServerFn } from "@tanstack/react-start";
import { and, count, eq, like, or } from "drizzle-orm";
import { db } from "src/db";
import { downloadProfiles, unmappedFiles } from "src/db/schema";
import { eventBus } from "src/server/event-bus";
import { logWarn } from "src/server/logger";
import { requireAdmin, requireAuth } from "src/server/middleware";
import {
	executeMapping,
	mappingInputSchema,
	previewMappingAssets,
} from "src/server/unmapped-file-mapping";
import { z } from "zod";

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

export const mapUnmappedFileFn = createServerFn({ method: "POST" })
	.inputValidator((data: unknown) => mappingInputSchema.parse(data))
	.handler(async ({ data }) => {
		await requireAdmin();
		const result = await executeMapping(data);
		eventBus.emit({ type: "unmappedFilesUpdated" });
		return result;
	});

// ─── previewUnmappedImportAssetsFn ────────────────────────────────────────

const previewImportAssetRowsSchema = z.object({
	rows: z.array(
		z.object({
			contentType: z.enum(["audiobook", "book", "movie", "tv"]),
			fileId: z.number(),
			path: z.string(),
		}),
	),
});

export const previewUnmappedImportAssetsFn = createServerFn({ method: "GET" })
	.inputValidator((data: unknown) => previewImportAssetRowsSchema.parse(data))
	.handler(async ({ data }) => {
		await requireAuth();
		return previewMappingAssets(data);
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
