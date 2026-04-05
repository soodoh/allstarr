import { createServerFn } from "@tanstack/react-start";
import { eq, inArray } from "drizzle-orm";
import { db } from "src/db";
import {
	history,
	movieCollectionDownloadProfiles,
	movieCollectionMovies,
	movieCollections,
	movieDownloadProfiles,
	movieImportListExclusions,
	movies,
} from "src/db/schema";
import {
	addMissingCollectionMoviesSchema,
	addMovieImportExclusionSchema,
	updateMovieCollectionSchema,
} from "src/lib/tmdb-validators";
import { searchForMovie } from "./auto-search";
import { requireAdmin, requireAuth } from "./middleware";
import { tmdbFetch } from "./tmdb/client";
import type { TmdbCollectionDetail, TmdbMovieDetail } from "./tmdb/types";
import {
	generateSortTitle,
	mapMovieStatus,
	transformImagePath,
} from "./utils/movie-helpers";

// ─── Get All Collections ─────────────────────────────────────────────────

export const getMovieCollectionsFn = createServerFn({ method: "GET" }).handler(
	async () => {
		await requireAuth();

		const collections = db.select().from(movieCollections).all();
		const allCollectionMovies = db.select().from(movieCollectionMovies).all();
		const allProfileLinks = db
			.select()
			.from(movieCollectionDownloadProfiles)
			.all();

		// Map existing movie tmdbIds to internal IDs
		const existingMovies = db
			.select({ id: movies.id, tmdbId: movies.tmdbId })
			.from(movies)
			.all();
		const existingByTmdbId = new Map(
			existingMovies.map((m) => [m.tmdbId, m.id]),
		);

		// Get excluded tmdbIds
		const exclusions = db
			.select({ tmdbId: movieImportListExclusions.tmdbId })
			.from(movieImportListExclusions)
			.all();
		const excludedTmdbIds = new Set(exclusions.map((e) => e.tmdbId));

		return collections.map((collection) =>
			annotateCollection(
				collection,
				allCollectionMovies,
				allProfileLinks,
				existingByTmdbId,
				excludedTmdbIds,
			),
		);
	},
);

// ─── Update Collection ───────────────────────────────────────────────────

export const updateMovieCollectionFn = createServerFn({ method: "POST" })
	.inputValidator((d: unknown) => updateMovieCollectionSchema.parse(d))
	.handler(async ({ data }) => {
		await requireAdmin();

		const { id, downloadProfileIds, ...updates } = data;

		db.update(movieCollections)
			.set({ ...updates, updatedAt: new Date() })
			.where(eq(movieCollections.id, id))
			.run();

		if (downloadProfileIds !== undefined) {
			db.delete(movieCollectionDownloadProfiles)
				.where(eq(movieCollectionDownloadProfiles.collectionId, id))
				.run();
			for (const profileId of downloadProfileIds) {
				db.insert(movieCollectionDownloadProfiles)
					.values({ collectionId: id, downloadProfileId: profileId })
					.run();
			}
		}

		return { success: true };
	});

// ─── Refresh All Monitored Collections ───────────────────────────────────

export const refreshCollectionsFn = createServerFn({
	method: "POST",
}).handler(async () => {
	await requireAuth();

	const monitoredCollections = db
		.select()
		.from(movieCollections)
		.where(eq(movieCollections.monitored, true))
		.all();

	if (monitoredCollections.length === 0) {
		return { added: 0 };
	}

	const excludedTmdbIds = new Set(
		db
			.select({ tmdbId: movieImportListExclusions.tmdbId })
			.from(movieImportListExclusions)
			.all()
			.map((r) => r.tmdbId),
	);
	const existingTmdbIds = new Set(
		db
			.select({ tmdbId: movies.tmdbId })
			.from(movies)
			.all()
			.map((r) => r.tmdbId),
	);

	let totalAdded = 0;

	for (const collection of monitoredCollections) {
		const added = await syncCollection(
			collection,
			excludedTmdbIds,
			existingTmdbIds,
		);
		totalAdded += added;
	}

	return { added: totalAdded };
});

// ─── Add Missing Movies From Single Collection ──────────────────────────

export const addMissingCollectionMoviesFn = createServerFn({ method: "POST" })
	.inputValidator((d: unknown) => addMissingCollectionMoviesSchema.parse(d))
	.handler(async ({ data }) => {
		await requireAdmin();

		const collection = db
			.select()
			.from(movieCollections)
			.where(eq(movieCollections.id, data.collectionId))
			.get();

		if (!collection) {
			throw new Error("Collection not found");
		}

		// Update collection settings from user choices
		const collectionUpdates: Record<string, unknown> = {
			minimumAvailability: data.minimumAvailability,
			updatedAt: new Date(),
		};
		if (data.monitorOption === "movieAndCollection") {
			collectionUpdates.monitored = true;
		}
		db.update(movieCollections)
			.set(collectionUpdates)
			.where(eq(movieCollections.id, collection.id))
			.run();

		// Update collection download profiles
		db.delete(movieCollectionDownloadProfiles)
			.where(eq(movieCollectionDownloadProfiles.collectionId, collection.id))
			.run();
		for (const profileId of data.downloadProfileIds) {
			db.insert(movieCollectionDownloadProfiles)
				.values({
					collectionId: collection.id,
					downloadProfileId: profileId,
				})
				.run();
		}

		// Get missing movies
		const excludedTmdbIds = new Set(
			db
				.select({ tmdbId: movieImportListExclusions.tmdbId })
				.from(movieImportListExclusions)
				.all()
				.map((r) => r.tmdbId),
		);
		const existingTmdbIds = new Set(
			db
				.select({ tmdbId: movies.tmdbId })
				.from(movies)
				.all()
				.map((r) => r.tmdbId),
		);

		const collectionMoviesList = db
			.select()
			.from(movieCollectionMovies)
			.where(eq(movieCollectionMovies.collectionId, collection.id))
			.all();

		let added = 0;
		for (const cm of collectionMoviesList) {
			if (existingTmdbIds.has(cm.tmdbId)) {
				continue;
			}
			if (excludedTmdbIds.has(cm.tmdbId)) {
				continue;
			}

			const detail = await tmdbFetch<TmdbMovieDetail>(`/movie/${cm.tmdbId}`);

			const title = detail.title;
			const sortTitle = generateSortTitle(title);
			const status = mapMovieStatus(detail.status);
			const studio = detail.production_companies[0]?.name ?? "";
			const year = detail.release_date
				? Number.parseInt(detail.release_date.split("-")[0], 10)
				: 0;
			const runtime = detail.runtime ?? 0;
			const genres = detail.genres.map((g) => g.name);
			const posterUrl = transformImagePath(detail.poster_path, "w500") ?? "";
			const fanartUrl = transformImagePath(detail.backdrop_path, "w1280") ?? "";
			const imdbId = detail.imdb_id ?? null;

			const movie = db
				.insert(movies)
				.values({
					title,
					sortTitle,
					overview: detail.overview,
					tmdbId: cm.tmdbId,
					imdbId,
					status,
					studio,
					year,
					runtime,
					genres,
					posterUrl,
					fanartUrl,
					minimumAvailability: data.minimumAvailability,
					collectionId: collection.id,
				})
				.returning()
				.get();

			if (data.monitorOption !== "none") {
				for (const profileId of data.downloadProfileIds) {
					db.insert(movieDownloadProfiles)
						.values({ movieId: movie.id, downloadProfileId: profileId })
						.run();
				}
			}

			db.insert(history)
				.values({
					eventType: "movieAdded",
					movieId: movie.id,
					data: { title },
				})
				.run();

			if (data.searchOnAdd && data.monitorOption !== "none") {
				void searchForMovie(movie.id).catch((error) =>
					console.error("Search after bulk add failed:", error),
				);
			}

			existingTmdbIds.add(cm.tmdbId);
			added += 1;
		}

		return { added };
	});

// ─── Add Movie Import Exclusion ─────────────────────────────────────────

export const addMovieImportExclusionFn = createServerFn({ method: "POST" })
	.inputValidator((d: unknown) => addMovieImportExclusionSchema.parse(d))
	.handler(async ({ data }) => {
		await requireAdmin();
		db.insert(movieImportListExclusions)
			.values({
				tmdbId: data.tmdbId,
				title: data.title,
				year: data.year ?? null,
			})
			.onConflictDoNothing()
			.run();
		return { success: true };
	});

// ─── Internal Helpers ────────────────────────────────────────────────────

function annotateCollectionMovie(
	cm: typeof movieCollectionMovies.$inferSelect,
	existingByTmdbId: Map<number, number>,
	excludedTmdbIds: Set<number>,
) {
	const movieId = existingByTmdbId.get(cm.tmdbId) ?? null;
	return {
		...cm,
		isExisting: movieId !== null,
		isExcluded: excludedTmdbIds.has(cm.tmdbId),
		movieId,
	};
}

function annotateCollection(
	collection: typeof movieCollections.$inferSelect,
	allCollectionMovies: Array<typeof movieCollectionMovies.$inferSelect>,
	allProfileLinks: Array<typeof movieCollectionDownloadProfiles.$inferSelect>,
	existingByTmdbId: Map<number, number>,
	excludedTmdbIds: Set<number>,
) {
	const collectionMoviesList = allCollectionMovies.filter(
		(cm) => cm.collectionId === collection.id,
	);
	const profileIds = allProfileLinks
		.filter((pl) => pl.collectionId === collection.id)
		.map((pl) => pl.downloadProfileId);

	const annotatedMovies = collectionMoviesList.map((cm) =>
		annotateCollectionMovie(cm, existingByTmdbId, excludedTmdbIds),
	);

	const missingMovies = annotatedMovies.filter(
		(m) => !m.isExisting && !m.isExcluded,
	).length;

	return {
		...collection,
		downloadProfileIds: profileIds,
		movies: annotatedMovies,
		missingMovies,
	};
}

async function syncCollection(
	collection: typeof movieCollections.$inferSelect,
	excludedTmdbIds: Set<number>,
	existingTmdbIds: Set<number>,
): Promise<number> {
	const raw = await tmdbFetch<TmdbCollectionDetail>(
		`/collection/${collection.tmdbId}`,
	);

	// Update collection metadata
	db.update(movieCollections)
		.set({
			title: raw.name,
			sortTitle: generateSortTitle(raw.name),
			overview: raw.overview,
			posterUrl: transformImagePath(raw.poster_path, "w500"),
			fanartUrl: transformImagePath(raw.backdrop_path, "w1280"),
			lastInfoSync: new Date(),
			updatedAt: new Date(),
		})
		.where(eq(movieCollections.id, collection.id))
		.run();

	// Upsert cached parts
	const tmdbPartIds = new Set(raw.parts.map((p) => p.id));
	for (const part of raw.parts) {
		const year = part.release_date
			? Number.parseInt(part.release_date.split("-")[0], 10) || null
			: null;
		db.insert(movieCollectionMovies)
			.values({
				collectionId: collection.id,
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

	// Delete cached parts no longer in TMDB response
	const cachedParts = db
		.select({
			id: movieCollectionMovies.id,
			tmdbId: movieCollectionMovies.tmdbId,
		})
		.from(movieCollectionMovies)
		.where(eq(movieCollectionMovies.collectionId, collection.id))
		.all();
	const toDelete = cachedParts.filter((p) => !tmdbPartIds.has(p.tmdbId));
	if (toDelete.length > 0) {
		db.delete(movieCollectionMovies)
			.where(
				inArray(
					movieCollectionMovies.id,
					toDelete.map((p) => p.id),
				),
			)
			.run();
	}

	// Get collection's download profile IDs
	const profileLinks = db
		.select({
			downloadProfileId: movieCollectionDownloadProfiles.downloadProfileId,
		})
		.from(movieCollectionDownloadProfiles)
		.where(eq(movieCollectionDownloadProfiles.collectionId, collection.id))
		.all();

	// Add missing movies
	let added = 0;
	for (const part of raw.parts) {
		if (existingTmdbIds.has(part.id)) {
			continue;
		}
		if (excludedTmdbIds.has(part.id)) {
			continue;
		}

		const detail = await tmdbFetch<TmdbMovieDetail>(`/movie/${part.id}`);

		const title = detail.title;
		const sortTitle = generateSortTitle(title);
		const status = mapMovieStatus(detail.status);
		const studio = detail.production_companies[0]?.name ?? "";
		const year = detail.release_date
			? Number.parseInt(detail.release_date.split("-")[0], 10)
			: 0;
		const runtime = detail.runtime ?? 0;
		const genres = detail.genres.map((g) => g.name);
		const posterUrl = transformImagePath(detail.poster_path, "w500") ?? "";
		const fanartUrl = transformImagePath(detail.backdrop_path, "w1280") ?? "";
		const imdbId = detail.imdb_id ?? null;

		const movie = db
			.insert(movies)
			.values({
				title,
				sortTitle,
				overview: detail.overview,
				tmdbId: part.id,
				imdbId,
				status,
				studio,
				year,
				runtime,
				genres,
				posterUrl,
				fanartUrl,
				minimumAvailability: collection.minimumAvailability,
				collectionId: collection.id,
			})
			.returning()
			.get();

		for (const link of profileLinks) {
			db.insert(movieDownloadProfiles)
				.values({
					movieId: movie.id,
					downloadProfileId: link.downloadProfileId,
				})
				.run();
		}

		db.insert(history)
			.values({
				eventType: "movieAdded",
				movieId: movie.id,
				data: { title },
			})
			.run();

		existingTmdbIds.add(part.id);
		added += 1;
	}

	return added;
}
