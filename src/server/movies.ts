import * as fs from "node:fs";
import { createServerFn } from "@tanstack/react-start";
import { and, eq, sql } from "drizzle-orm";
import { db } from "src/db";
import {
	history,
	movieCollectionDownloadProfiles,
	movieCollectionMovies,
	movieCollections,
	movieDownloadProfiles,
	movieFiles,
	movieImportListExclusions,
	movies,
} from "src/db/schema";
import {
	addMovieSchema,
	deleteMovieSchema,
	monitorMovieProfileSchema,
	refreshMovieSchema,
	unmonitorMovieProfileSchema,
	updateMovieSchema,
} from "src/lib/tmdb-validators";
import { searchForMovie } from "./auto-search";
import type { CommandHandler } from "./commands";
import { submitCommand } from "./commands";
import { requireAdmin, requireAuth } from "./middleware";
import { tmdbFetch } from "./tmdb/client";
import type { TmdbCollectionDetail, TmdbMovieDetail } from "./tmdb/types";
import {
	generateSortTitle,
	mapMovieStatus,
	transformImagePath,
} from "./utils/movie-helpers";

async function populateCollectionCache(
	collectionDbId: number,
	tmdbCollectionId: number,
): Promise<void> {
	const raw = await tmdbFetch<TmdbCollectionDetail>(
		`/collection/${tmdbCollectionId}`,
	);
	for (const part of raw.parts) {
		const year = part.release_date
			? Number.parseInt(part.release_date.split("-")[0], 10) || null
			: null;
		db.insert(movieCollectionMovies)
			.values({
				collectionId: collectionDbId,
				tmdbId: part.id,
				title: part.title,
				overview: part.overview,
				posterUrl: transformImagePath(part.poster_path, "w500"),
				releaseDate: part.release_date ?? "",
				year,
			})
			.onConflictDoUpdate({
				target: [
					movieCollectionMovies.collectionId,
					movieCollectionMovies.tmdbId,
				],
				set: {
					title: part.title,
					overview: part.overview,
					posterUrl: transformImagePath(part.poster_path, "w500"),
					releaseDate: part.release_date ?? "",
					year,
				},
			})
			.run();
	}
}

const addMovieHandler: CommandHandler = async (
	body,
	updateProgress,
	setTitle,
) => {
	const data = body as ReturnType<typeof addMovieSchema.parse>;

	// Check if movie already exists
	const existing = db
		.select({ id: movies.id })
		.from(movies)
		.where(eq(movies.tmdbId, data.tmdbId))
		.get();

	if (existing) {
		throw new Error("Movie already exists");
	}

	// Fetch movie detail from TMDB
	updateProgress("Fetching movie details...");
	const raw = await tmdbFetch<TmdbMovieDetail>(`/movie/${data.tmdbId}`);

	// Upsert collection if movie belongs to one
	let collectionId: number | null = null;
	if (raw.belongs_to_collection) {
		const col = raw.belongs_to_collection;
		updateProgress(`Loading collection: ${col.name}`);
		const existingCol = db
			.select({ id: movieCollections.id })
			.from(movieCollections)
			.where(eq(movieCollections.tmdbId, col.id))
			.get();

		if (existingCol) {
			collectionId = existingCol.id;
			db.update(movieCollections)
				.set({
					title: col.name,
					sortTitle: generateSortTitle(col.name),
					posterUrl: transformImagePath(col.poster_path, "w500"),
					fanartUrl: transformImagePath(col.backdrop_path, "w1280"),
					updatedAt: new Date(),
				})
				.where(eq(movieCollections.id, existingCol.id))
				.run();
		} else {
			const inserted = db
				.insert(movieCollections)
				.values({
					title: col.name,
					sortTitle: generateSortTitle(col.name),
					tmdbId: col.id,
					posterUrl: transformImagePath(col.poster_path, "w500"),
					fanartUrl: transformImagePath(col.backdrop_path, "w1280"),
					minimumAvailability: data.minimumAvailability,
				})
				.returning()
				.get();
			collectionId = inserted.id;
		}

		// Populate the collection movies cache from TMDB
		await populateCollectionCache(collectionId, col.id);
	}

	const title = raw.title;
	setTitle(title);
	const sortTitle = generateSortTitle(title);
	const status = mapMovieStatus(raw.status);
	const studio = raw.production_companies[0]?.name ?? "";
	const year = raw.release_date
		? Number.parseInt(raw.release_date.split("-")[0], 10)
		: 0;
	const runtime = raw.runtime ?? 0;
	const genres = raw.genres.map((g) => g.name);
	const posterUrl = transformImagePath(raw.poster_path, "w500") ?? "";
	const fanartUrl = transformImagePath(raw.backdrop_path, "w1280") ?? "";
	const imdbId = raw.imdb_id ?? null;

	// Insert movie
	updateProgress("Saving movie...");
	const movie = db
		.insert(movies)
		.values({
			title,
			sortTitle,
			overview: raw.overview,
			tmdbId: data.tmdbId,
			imdbId,
			status,
			studio,
			year,
			runtime,
			genres,
			posterUrl,
			fanartUrl,
			minimumAvailability: data.minimumAvailability,
			collectionId,
		})
		.returning()
		.get();

	// Assign download profiles based on monitor option
	if (data.monitorOption !== "none") {
		for (const profileId of data.downloadProfileIds) {
			db.insert(movieDownloadProfiles)
				.values({ movieId: movie.id, downloadProfileId: profileId })
				.run();
		}
	}

	// Propagate settings to collection on every add
	if (collectionId) {
		const collectionUpdates: Record<string, unknown> = {
			minimumAvailability: data.minimumAvailability,
			updatedAt: new Date(),
		};
		if (data.monitorOption === "movieAndCollection") {
			collectionUpdates.monitored = true;
		}
		db.update(movieCollections)
			.set(collectionUpdates)
			.where(eq(movieCollections.id, collectionId))
			.run();

		// Update collection download profiles to match (skip when not monitoring)
		if (data.monitorOption !== "none") {
			db.delete(movieCollectionDownloadProfiles)
				.where(eq(movieCollectionDownloadProfiles.collectionId, collectionId))
				.run();
			for (const profileId of data.downloadProfileIds) {
				db.insert(movieCollectionDownloadProfiles)
					.values({ collectionId, downloadProfileId: profileId })
					.run();
			}
		}
	}

	// Search if requested
	if (data.searchOnAdd && data.monitorOption !== "none") {
		updateProgress("Searching for available releases...");
		void searchForMovie(movie.id).catch((error) =>
			console.error("Search after add failed:", error),
		);
	}

	// Insert history event
	db.insert(history)
		.values({
			eventType: "movieAdded",
			movieId: movie.id,
			data: { title },
		})
		.run();

	return { movieId: movie.id, title: movie.title } as Record<string, unknown>;
};

export const addMovieFn = createServerFn({ method: "POST" })
	.inputValidator((d: unknown) => addMovieSchema.parse(d))
	.handler(async ({ data }) => {
		await requireAdmin();
		return submitCommand({
			commandType: "addMovie",
			name: `Add movie: ${data.tmdbId}`,
			body: data as unknown as Record<string, unknown>,
			dedupeKey: "tmdbId",
			handler: addMovieHandler,
		});
	});

export const getMoviesFn = createServerFn({ method: "GET" }).handler(
	async () => {
		await requireAuth();

		const rows = db
			.select({
				id: movies.id,
				title: movies.title,
				sortTitle: movies.sortTitle,
				overview: movies.overview,
				tmdbId: movies.tmdbId,
				imdbId: movies.imdbId,
				status: movies.status,
				studio: movies.studio,
				year: movies.year,
				runtime: movies.runtime,
				genres: movies.genres,
				tags: movies.tags,
				posterUrl: movies.posterUrl,
				fanartUrl: movies.fanartUrl,
				minimumAvailability: movies.minimumAvailability,
				path: movies.path,
				createdAt: movies.createdAt,
				updatedAt: movies.updatedAt,
				hasFile: sql<boolean>`CASE WHEN COUNT(${movieFiles.id}) > 0 THEN 1 ELSE 0 END`,
			})
			.from(movies)
			.leftJoin(movieFiles, eq(movieFiles.movieId, movies.id))
			.groupBy(movies.id)
			.all();

		// Fetch movie-level download profile links
		const movieProfileLinks = db
			.select({
				movieId: movieDownloadProfiles.movieId,
				downloadProfileId: movieDownloadProfiles.downloadProfileId,
			})
			.from(movieDownloadProfiles)
			.all();

		const profilesByMovie = new Map<number, number[]>();
		for (const link of movieProfileLinks) {
			const arr = profilesByMovie.get(link.movieId) ?? [];
			arr.push(link.downloadProfileId);
			profilesByMovie.set(link.movieId, arr);
		}

		return rows.map((row) =>
			Object.assign(row, {
				downloadProfileIds: profilesByMovie.get(row.id) ?? [],
			}),
		);
	},
);

export const getMovieDetailFn = createServerFn({ method: "GET" })
	.inputValidator((d: { id: number }) => d)
	.handler(async ({ data }) => {
		await requireAuth();

		const movie = db.select().from(movies).where(eq(movies.id, data.id)).get();

		if (!movie) {
			throw new Error("Movie not found");
		}

		// Get movie files
		const files = db
			.select()
			.from(movieFiles)
			.where(eq(movieFiles.movieId, data.id))
			.all();

		// Get download profile IDs
		const profileLinks = db
			.select({
				downloadProfileId: movieDownloadProfiles.downloadProfileId,
			})
			.from(movieDownloadProfiles)
			.where(eq(movieDownloadProfiles.movieId, data.id))
			.all();
		const downloadProfileIds = profileLinks.map((l) => l.downloadProfileId);

		return {
			...movie,
			downloadProfileIds,
			files,
		};
	});

export const updateMovieFn = createServerFn({ method: "POST" })
	.inputValidator((d: unknown) => updateMovieSchema.parse(d))
	.handler(async ({ data }) => {
		await requireAdmin();

		const { id, downloadProfileIds, ...updates } = data;

		const movie = db.select().from(movies).where(eq(movies.id, id)).get();

		if (!movie) {
			throw new Error("Movie not found");
		}

		db.update(movies)
			.set({ ...updates, updatedAt: new Date() })
			.where(eq(movies.id, id))
			.run();

		// Update download profile junctions if provided
		if (downloadProfileIds !== undefined) {
			db.delete(movieDownloadProfiles)
				.where(eq(movieDownloadProfiles.movieId, id))
				.run();
			for (const profileId of downloadProfileIds) {
				db.insert(movieDownloadProfiles)
					.values({ movieId: id, downloadProfileId: profileId })
					.run();
			}
		}

		const row = db.select().from(movies).where(eq(movies.id, id)).get();
		if (!row) throw new Error(`Movie ${id} not found after update`);
		return row;
	});

export const deleteMovieFn = createServerFn({ method: "POST" })
	.inputValidator((d: unknown) => deleteMovieSchema.parse(d))
	.handler(async ({ data }) => {
		await requireAdmin();

		const movie = db.select().from(movies).where(eq(movies.id, data.id)).get();

		if (!movie) {
			throw new Error("Movie not found");
		}

		// Add to import exclusion list if requested
		if (data.addImportExclusion) {
			db.insert(movieImportListExclusions)
				.values({
					tmdbId: movie.tmdbId,
					title: movie.title,
					year: movie.year || null,
				})
				.onConflictDoNothing()
				.run();
		}

		// If deleteFiles, find and delete all movie files from disk
		if (data.deleteFiles) {
			const files = db
				.select({ path: movieFiles.path })
				.from(movieFiles)
				.where(eq(movieFiles.movieId, data.id))
				.all();

			for (const file of files) {
				try {
					fs.unlinkSync(file.path);
				} catch {
					// File may already be missing — continue
				}
			}
		}

		// Delete movie — cascades remove files and join table
		db.delete(movies).where(eq(movies.id, data.id)).run();

		// Clean up orphaned collection
		if (movie.collectionId) {
			const remaining = db
				.select({ count: sql<number>`count(*)` })
				.from(movies)
				.where(eq(movies.collectionId, movie.collectionId))
				.get();

			if (remaining && remaining.count === 0) {
				db.delete(movieCollections)
					.where(eq(movieCollections.id, movie.collectionId))
					.run();
			}
		}

		db.insert(history)
			.values({
				eventType: "movieDeleted",
				data: { title: movie.title },
			})
			.run();

		return { success: true };
	});

export const checkMovieExistsFn = createServerFn({ method: "GET" })
	.inputValidator((d: { tmdbId: number }) => d)
	.handler(async ({ data }) => {
		await requireAuth();
		const movie = db
			.select({ id: movies.id })
			.from(movies)
			.where(eq(movies.tmdbId, data.tmdbId))
			.get();
		return movie !== undefined;
	});

export async function refreshMovieInternal(
	movieId: number,
): Promise<{ success: boolean }> {
	const movie = db
		.select({ id: movies.id, tmdbId: movies.tmdbId })
		.from(movies)
		.where(eq(movies.id, movieId))
		.get();

	if (!movie) {
		throw new Error("Movie not found");
	}

	const raw = await tmdbFetch<TmdbMovieDetail>(`/movie/${movie.tmdbId}`);

	// Upsert collection if movie belongs to one
	let collectionId: number | null = null;
	if (raw.belongs_to_collection) {
		const col = raw.belongs_to_collection;
		const existing = db
			.select({ id: movieCollections.id })
			.from(movieCollections)
			.where(eq(movieCollections.tmdbId, col.id))
			.get();

		if (existing) {
			collectionId = existing.id;
			db.update(movieCollections)
				.set({
					title: col.name,
					sortTitle: generateSortTitle(col.name),
					posterUrl: transformImagePath(col.poster_path, "w500"),
					fanartUrl: transformImagePath(col.backdrop_path, "w1280"),
					updatedAt: new Date(),
				})
				.where(eq(movieCollections.id, existing.id))
				.run();
		} else {
			const inserted = db
				.insert(movieCollections)
				.values({
					title: col.name,
					sortTitle: generateSortTitle(col.name),
					tmdbId: col.id,
					posterUrl: transformImagePath(col.poster_path, "w500"),
					fanartUrl: transformImagePath(col.backdrop_path, "w1280"),
				})
				.returning()
				.get();
			collectionId = inserted.id;
		}

		// Populate the collection movies cache from TMDB
		await populateCollectionCache(collectionId, col.id);
	}

	const title = raw.title;
	const sortTitle = generateSortTitle(title);
	const status = mapMovieStatus(raw.status);
	const studio = raw.production_companies[0]?.name ?? "";
	const year = raw.release_date
		? Number.parseInt(raw.release_date.split("-")[0], 10)
		: 0;
	const runtime = raw.runtime ?? 0;
	const genres = raw.genres.map((g) => g.name);
	const posterUrl = transformImagePath(raw.poster_path, "w500") ?? "";
	const fanartUrl = transformImagePath(raw.backdrop_path, "w1280") ?? "";
	const imdbId = raw.imdb_id ?? null;

	db.update(movies)
		.set({
			title,
			sortTitle,
			overview: raw.overview,
			imdbId,
			status,
			studio,
			year,
			runtime,
			genres,
			posterUrl,
			fanartUrl,
			collectionId,
		})
		.where(eq(movies.id, movieId))
		.run();

	return { success: true };
}

export const refreshMovieMetadataFn = createServerFn({ method: "POST" })
	.inputValidator((d: unknown) => refreshMovieSchema.parse(d))
	.handler(async ({ data }) => {
		await requireAdmin();
		return refreshMovieInternal(data.movieId);
	});

export const monitorMovieProfileFn = createServerFn({ method: "POST" })
	.inputValidator((d: unknown) => monitorMovieProfileSchema.parse(d))
	.handler(async ({ data }) => {
		await requireAdmin();

		db.insert(movieDownloadProfiles)
			.values({
				movieId: data.movieId,
				downloadProfileId: data.downloadProfileId,
			})
			.onConflictDoNothing()
			.run();

		return { success: true };
	});

export const unmonitorMovieProfileFn = createServerFn({ method: "POST" })
	.inputValidator((d: unknown) => unmonitorMovieProfileSchema.parse(d))
	.handler(async ({ data }) => {
		await requireAdmin();

		db.delete(movieDownloadProfiles)
			.where(
				and(
					eq(movieDownloadProfiles.movieId, data.movieId),
					eq(movieDownloadProfiles.downloadProfileId, data.downloadProfileId),
				),
			)
			.run();

		return { success: true };
	});
