import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
	const eq = vi.fn((left: unknown, right: unknown) => ({
		kind: "eq",
		left,
		right,
	}));
	const inArray = vi.fn((col: unknown, vals: unknown) => ({
		kind: "inArray",
		col,
		vals,
	}));

	const requireAuth = vi.fn();
	const requireAdmin = vi.fn();
	const tmdbFetch = vi.fn();
	const searchForMovie = vi.fn();
	const logError = vi.fn();
	const generateSortTitle = vi.fn((t: string) => t.toLowerCase());
	const mapMovieStatus = vi.fn((s: string) => s);
	const transformImagePath = vi.fn(
		(p: string | null, size: string) => p && `${size}${p}`,
	);

	const select = vi.fn();
	const insert = vi.fn();
	const update = vi.fn();
	const deleteFn = vi.fn();

	return {
		deleteFn,
		eq,
		generateSortTitle,
		inArray,
		insert,
		logError,
		mapMovieStatus,
		requireAdmin,
		requireAuth,
		searchForMovie,
		select,
		tmdbFetch,
		transformImagePath,
		update,
	};
});

const schemaMocks = vi.hoisted(
	() =>
		({
			history: { id: "history.id" },
			movieCollectionDownloadProfiles: {
				collectionId: "movieCollectionDownloadProfiles.collectionId",
				downloadProfileId: "movieCollectionDownloadProfiles.downloadProfileId",
			},
			movieCollectionMovies: {
				collectionId: "movieCollectionMovies.collectionId",
				id: "movieCollectionMovies.id",
				tmdbId: "movieCollectionMovies.tmdbId",
			},
			movieCollections: {
				id: "movieCollections.id",
				monitored: "movieCollections.monitored",
			},
			movieDownloadProfiles: {
				downloadProfileId: "movieDownloadProfiles.downloadProfileId",
				movieId: "movieDownloadProfiles.movieId",
			},
			movieImportListExclusions: {
				tmdbId: "movieImportListExclusions.tmdbId",
			},
			movies: {
				id: "movies.id",
				tmdbId: "movies.tmdbId",
			},
		}) as const,
);

// -- module mocks --

vi.mock("@tanstack/react-start", () => ({
	createServerFn: () => ({
		handler: (handler: (...args: unknown[]) => unknown) => handler,
		inputValidator: (validator: (input: unknown) => unknown) => ({
			handler:
				(handler: (input: { data: unknown }) => unknown) =>
				(input: { data: unknown }) =>
					handler({ data: validator(input.data) }),
		}),
	}),
}));

vi.mock("drizzle-orm", () => ({
	eq: mocks.eq,
	inArray: mocks.inArray,
}));

vi.mock("src/lib/tmdb-validators", () => ({
	addMissingCollectionMoviesSchema: { parse: (d: unknown) => d },
	addMovieImportExclusionSchema: { parse: (d: unknown) => d },
	updateMovieCollectionSchema: { parse: (d: unknown) => d },
}));

vi.mock("./auto-search", () => ({
	searchForMovie: mocks.searchForMovie,
}));

vi.mock("./logger", () => ({
	logError: mocks.logError,
}));

vi.mock("./middleware", () => ({
	requireAdmin: mocks.requireAdmin,
	requireAuth: mocks.requireAuth,
}));

vi.mock("./tmdb/client", () => ({
	tmdbFetch: mocks.tmdbFetch,
}));

vi.mock("./utils/movie-helpers", () => ({
	generateSortTitle: mocks.generateSortTitle,
	mapMovieStatus: mocks.mapMovieStatus,
	transformImagePath: mocks.transformImagePath,
}));

vi.mock("src/db/schema", () => schemaMocks);

// -- chainable DB helpers --

type SelectChain = {
	all: ReturnType<typeof vi.fn>;
	from: ReturnType<typeof vi.fn>;
	get: ReturnType<typeof vi.fn>;
	where: ReturnType<typeof vi.fn>;
};

function createSelectChain(
	result: unknown = undefined,
	allResult: unknown[] = [],
): SelectChain {
	const chain = {} as SelectChain;
	chain.all = vi.fn(() => allResult);
	chain.from = vi.fn(() => chain);
	chain.get = vi.fn(() => result);
	chain.where = vi.fn(() => chain);
	return chain;
}

type InsertChain = {
	get: ReturnType<typeof vi.fn>;
	onConflictDoNothing: ReturnType<typeof vi.fn>;
	onConflictDoUpdate: ReturnType<typeof vi.fn>;
	returning: ReturnType<typeof vi.fn>;
	run: ReturnType<typeof vi.fn>;
	values: ReturnType<typeof vi.fn>;
};

function createInsertChain(result: unknown = { id: 1 }): InsertChain {
	const chain = {} as InsertChain;
	chain.get = vi.fn(() => result);
	chain.onConflictDoNothing = vi.fn(() => chain);
	chain.onConflictDoUpdate = vi.fn(() => chain);
	chain.returning = vi.fn(() => chain);
	chain.run = vi.fn();
	chain.values = vi.fn(() => chain);
	return chain;
}

type UpdateChain = {
	run: ReturnType<typeof vi.fn>;
	set: ReturnType<typeof vi.fn>;
	where: ReturnType<typeof vi.fn>;
};

function createUpdateChain(): UpdateChain {
	const chain = {} as UpdateChain;
	chain.run = vi.fn();
	chain.set = vi.fn(() => chain);
	chain.where = vi.fn(() => chain);
	return chain;
}

type DeleteChain = {
	run: ReturnType<typeof vi.fn>;
	where: ReturnType<typeof vi.fn>;
};

function createDeleteChain(): DeleteChain {
	const chain = {} as DeleteChain;
	chain.run = vi.fn();
	chain.where = vi.fn(() => chain);
	return chain;
}

vi.mock("src/db", () => ({
	db: {
		delete: mocks.deleteFn,
		insert: mocks.insert,
		select: mocks.select,
		update: mocks.update,
	},
}));

// -- import module under test --

import {
	addMissingCollectionMoviesFn,
	addMovieImportExclusionFn,
	getMovieCollectionsFn,
	refreshCollectionsFn,
	updateMovieCollectionFn,
} from "./movie-collections";

// -- helpers --

function useDefaultMocks() {
	mocks.requireAuth.mockResolvedValue({ user: { id: 1 } });
	mocks.requireAdmin.mockResolvedValue({ user: { id: 1, role: "admin" } });
}

/** Standard TMDB movie detail response */
function makeTmdbMovieDetail(overrides: Record<string, unknown> = {}) {
	return {
		backdrop_path: "/backdrop.jpg",
		genres: [{ name: "Action" }],
		imdb_id: "tt1234567",
		overview: "A great movie",
		poster_path: "/poster.jpg",
		production_companies: [{ name: "Studio One" }],
		release_date: "2024-06-15",
		runtime: 120,
		status: "Released",
		title: "Test Movie",
		...overrides,
	};
}

/** Standard TMDB collection detail response */
function makeTmdbCollectionDetail(
	overrides: Record<string, unknown> = {},
	parts: Array<Record<string, unknown>> = [],
) {
	return {
		backdrop_path: "/col_backdrop.jpg",
		name: "Test Collection",
		overview: "A collection overview",
		poster_path: "/col_poster.jpg",
		parts:
			parts.length > 0
				? parts
				: [
						{
							id: 100,
							overview: "Part 1 overview",
							poster_path: "/part1.jpg",
							release_date: "2024-01-01",
							title: "Part 1",
						},
					],
		...overrides,
	};
}

describe("server/movie-collections", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		useDefaultMocks();
	});

	// ─── getMovieCollectionsFn ─────────────────────────────────────────────

	describe("getMovieCollectionsFn", () => {
		it("returns annotated collections with missing counts", async () => {
			const collections = [
				{ id: 1, title: "Marvel", minimumAvailability: "released" },
			];
			const collectionMovies = [
				{ collectionId: 1, tmdbId: 100, title: "Movie A" },
				{ collectionId: 1, tmdbId: 200, title: "Movie B" },
				{ collectionId: 1, tmdbId: 300, title: "Movie C" },
			];
			const profileLinks = [{ collectionId: 1, downloadProfileId: 10 }];
			const existingMovies = [{ id: 50, tmdbId: 100 }];
			const exclusions = [{ tmdbId: 300 }];

			let callIndex = 0;
			mocks.select.mockImplementation(() => {
				callIndex++;
				switch (callIndex) {
					case 1:
						return createSelectChain(undefined, collections);
					case 2:
						return createSelectChain(undefined, collectionMovies);
					case 3:
						return createSelectChain(undefined, profileLinks);
					case 4:
						return createSelectChain(undefined, existingMovies);
					case 5:
						return createSelectChain(undefined, exclusions);
					default:
						return createSelectChain();
				}
			});

			const result = await getMovieCollectionsFn();

			expect(mocks.requireAuth).toHaveBeenCalledTimes(1);
			expect(result).toHaveLength(1);
			expect(result[0].downloadProfileIds).toEqual([10]);
			expect(result[0].movies).toHaveLength(3);
			// tmdbId 100 exists -> isExisting=true
			expect(result[0].movies[0].isExisting).toBe(true);
			expect(result[0].movies[0].movieId).toBe(50);
			// tmdbId 200 -> missing (not existing, not excluded)
			expect(result[0].movies[1].isExisting).toBe(false);
			expect(result[0].movies[1].isExcluded).toBe(false);
			// tmdbId 300 -> excluded
			expect(result[0].movies[2].isExcluded).toBe(true);
			// missingMovies = 1 (only tmdbId 200)
			expect(result[0].missingMovies).toBe(1);
		});

		it("returns empty array when no collections exist", async () => {
			mocks.select.mockReturnValue(createSelectChain(undefined, []));

			const result = await getMovieCollectionsFn();

			expect(result).toEqual([]);
		});

		it("rejects when auth fails", async () => {
			mocks.requireAuth.mockRejectedValueOnce(new Error("unauthorized"));

			await expect(getMovieCollectionsFn()).rejects.toThrow("unauthorized");
			expect(mocks.select).not.toHaveBeenCalled();
		});
	});

	// ─── updateMovieCollectionFn ───────────────────────────────────────────

	describe("updateMovieCollectionFn", () => {
		it("updates collection fields and replaces download profiles", async () => {
			const updateChain = createUpdateChain();
			mocks.update.mockReturnValue(updateChain);

			const deleteChain = createDeleteChain();
			mocks.deleteFn.mockReturnValue(deleteChain);

			const insertChain = createInsertChain();
			mocks.insert.mockReturnValue(insertChain);

			const result = await updateMovieCollectionFn({
				data: {
					id: 5,
					monitored: true,
					downloadProfileIds: [10, 20],
					minimumAvailability: "released",
				},
			});

			expect(mocks.requireAdmin).toHaveBeenCalledTimes(1);
			expect(mocks.update).toHaveBeenCalledWith(schemaMocks.movieCollections);
			expect(updateChain.set).toHaveBeenCalledWith(
				expect.objectContaining({
					monitored: true,
					minimumAvailability: "released",
				}),
			);

			// Old profiles deleted
			expect(mocks.deleteFn).toHaveBeenCalledWith(
				schemaMocks.movieCollectionDownloadProfiles,
			);

			// New profiles inserted
			expect(mocks.insert).toHaveBeenCalledTimes(2);
			expect(insertChain.values).toHaveBeenCalledWith({
				collectionId: 5,
				downloadProfileId: 10,
			});
			expect(insertChain.values).toHaveBeenCalledWith({
				collectionId: 5,
				downloadProfileId: 20,
			});

			expect(result).toEqual({ success: true });
		});

		it("skips profile replacement when downloadProfileIds is undefined", async () => {
			const updateChain = createUpdateChain();
			mocks.update.mockReturnValue(updateChain);

			await updateMovieCollectionFn({
				data: { id: 3, monitored: false },
			});

			expect(mocks.update).toHaveBeenCalledTimes(1);
			expect(mocks.deleteFn).not.toHaveBeenCalled();
			expect(mocks.insert).not.toHaveBeenCalled();
		});

		it("rejects when admin auth fails", async () => {
			mocks.requireAdmin.mockRejectedValueOnce(new Error("forbidden"));

			await expect(
				updateMovieCollectionFn({ data: { id: 1 } }),
			).rejects.toThrow("forbidden");
			expect(mocks.update).not.toHaveBeenCalled();
		});
	});

	// ─── refreshCollectionsFn ─────────────────────────────────────────────

	describe("refreshCollectionsFn", () => {
		it("returns added:0 when no monitored collections exist", async () => {
			const chain = createSelectChain(undefined, []);
			mocks.select.mockReturnValue(chain);

			const result = await refreshCollectionsFn();

			expect(mocks.requireAdmin).toHaveBeenCalledTimes(1);
			expect(result).toEqual({ added: 0 });
			expect(mocks.tmdbFetch).not.toHaveBeenCalled();
		});

		it("syncs monitored collections and returns total added", async () => {
			const monitoredCollections = [
				{
					id: 1,
					tmdbId: 999,
					monitored: true,
					minimumAvailability: "released",
				},
			];

			// 1st select: monitored collections
			// 2nd select: exclusions
			// 3rd select: existing movies
			// After syncCollection: several more selects for cached parts, profile links
			let callIndex = 0;
			mocks.select.mockImplementation(() => {
				callIndex++;
				switch (callIndex) {
					case 1:
						return createSelectChain(undefined, monitoredCollections);
					case 2:
						return createSelectChain(undefined, []); // exclusions
					case 3:
						return createSelectChain(undefined, []); // existing movies
					// syncCollection internals:
					case 4:
						return createSelectChain(undefined, []); // cached parts (for delete check)
					case 5:
						return createSelectChain(undefined, [{ downloadProfileId: 10 }]); // profile links
					default:
						return createSelectChain(undefined, []);
				}
			});

			const tmdbCollection = makeTmdbCollectionDetail({}, [
				{
					id: 100,
					title: "New Movie",
					overview: "overview",
					poster_path: "/poster.jpg",
					release_date: "2024-06-15",
				},
			]);
			const tmdbDetail = makeTmdbMovieDetail();

			mocks.tmdbFetch
				.mockResolvedValueOnce(tmdbCollection)
				.mockResolvedValueOnce(tmdbDetail);

			const updateChain = createUpdateChain();
			mocks.update.mockReturnValue(updateChain);

			const insertChain = createInsertChain({ id: 42 });
			mocks.insert.mockReturnValue(insertChain);

			const result = await refreshCollectionsFn();

			expect(result).toEqual({ added: 1 });
			expect(mocks.tmdbFetch).toHaveBeenCalledWith("/collection/999");
			expect(mocks.tmdbFetch).toHaveBeenCalledWith("/movie/100");
		});

		it("rejects when admin auth fails", async () => {
			mocks.requireAdmin.mockRejectedValueOnce(new Error("forbidden"));

			await expect(refreshCollectionsFn()).rejects.toThrow("forbidden");
			expect(mocks.select).not.toHaveBeenCalled();
		});
	});

	// ─── addMissingCollectionMoviesFn ──────────────────────────────────────

	describe("addMissingCollectionMoviesFn", () => {
		const baseData = {
			collectionId: 1,
			downloadProfileIds: [10],
			minimumAvailability: "released" as const,
			monitorOption: "movieAndCollection" as const,
			searchOnAdd: false,
		};

		it("throws when collection not found", async () => {
			// select for collection lookup returns undefined
			const chain = createSelectChain(undefined);
			mocks.select.mockReturnValue(chain);

			await expect(
				addMissingCollectionMoviesFn({ data: baseData }),
			).rejects.toThrow("Collection not found");
		});

		it("adds missing movies and returns count", async () => {
			const collection = {
				id: 1,
				tmdbId: 500,
				monitored: false,
				minimumAvailability: "released",
			};
			const collectionMovies = [
				{ collectionId: 1, tmdbId: 100, title: "Movie A" },
				{ collectionId: 1, tmdbId: 200, title: "Movie B" },
			];

			let callIndex = 0;
			mocks.select.mockImplementation(() => {
				callIndex++;
				switch (callIndex) {
					case 1:
						return createSelectChain(collection); // collection lookup
					case 2:
						return createSelectChain(undefined, []); // exclusions
					case 3:
						return createSelectChain(undefined, [{ tmdbId: 100 }]); // existing (tmdbId 100 exists)
					case 4:
						return createSelectChain(undefined, collectionMovies); // collection movies
					default:
						return createSelectChain(undefined, []);
				}
			});

			const updateChain = createUpdateChain();
			mocks.update.mockReturnValue(updateChain);

			const deleteChain = createDeleteChain();
			mocks.deleteFn.mockReturnValue(deleteChain);

			const insertChain = createInsertChain({ id: 42 });
			mocks.insert.mockReturnValue(insertChain);

			const tmdbDetail = makeTmdbMovieDetail();
			mocks.tmdbFetch.mockResolvedValue(tmdbDetail);

			const result = await addMissingCollectionMoviesFn({ data: baseData });

			// tmdbId 100 exists, only tmdbId 200 is added
			expect(result).toEqual({ added: 1 });
			expect(mocks.tmdbFetch).toHaveBeenCalledWith("/movie/200");
			expect(mocks.tmdbFetch).toHaveBeenCalledTimes(1);
		});

		it("sets monitored=true when monitorOption is movieAndCollection", async () => {
			const collection = { id: 1, tmdbId: 500, monitored: false };

			let callIndex = 0;
			mocks.select.mockImplementation(() => {
				callIndex++;
				switch (callIndex) {
					case 1:
						return createSelectChain(collection);
					case 2:
						return createSelectChain(undefined, []); // exclusions
					case 3:
						return createSelectChain(undefined, []); // existing
					case 4:
						return createSelectChain(undefined, []); // collection movies
					default:
						return createSelectChain(undefined, []);
				}
			});

			const updateChain = createUpdateChain();
			mocks.update.mockReturnValue(updateChain);

			const deleteChain = createDeleteChain();
			mocks.deleteFn.mockReturnValue(deleteChain);

			const insertChain = createInsertChain();
			mocks.insert.mockReturnValue(insertChain);

			await addMissingCollectionMoviesFn({ data: baseData });

			expect(updateChain.set).toHaveBeenCalledWith(
				expect.objectContaining({ monitored: true }),
			);
		});

		it("skips profile replacement when monitorOption is none", async () => {
			const collection = { id: 1, tmdbId: 500, monitored: false };

			let callIndex = 0;
			mocks.select.mockImplementation(() => {
				callIndex++;
				switch (callIndex) {
					case 1:
						return createSelectChain(collection);
					case 2:
						return createSelectChain(undefined, []); // exclusions
					case 3:
						return createSelectChain(undefined, []); // existing
					case 4:
						return createSelectChain(undefined, []); // collection movies
					default:
						return createSelectChain(undefined, []);
				}
			});

			const updateChain = createUpdateChain();
			mocks.update.mockReturnValue(updateChain);

			await addMissingCollectionMoviesFn({
				data: { ...baseData, monitorOption: "none" },
			});

			// Should NOT delete/insert profile links when monitorOption is none
			expect(mocks.deleteFn).not.toHaveBeenCalled();
		});

		it("skips excluded movies", async () => {
			const collection = { id: 1, tmdbId: 500, monitored: false };
			const collectionMovies = [
				{ collectionId: 1, tmdbId: 200, title: "Excluded Movie" },
			];

			let callIndex = 0;
			mocks.select.mockImplementation(() => {
				callIndex++;
				switch (callIndex) {
					case 1:
						return createSelectChain(collection);
					case 2:
						return createSelectChain(undefined, [{ tmdbId: 200 }]); // exclusions
					case 3:
						return createSelectChain(undefined, []); // existing
					case 4:
						return createSelectChain(undefined, collectionMovies);
					default:
						return createSelectChain(undefined, []);
				}
			});

			const updateChain = createUpdateChain();
			mocks.update.mockReturnValue(updateChain);

			const deleteChain = createDeleteChain();
			mocks.deleteFn.mockReturnValue(deleteChain);

			const insertChain = createInsertChain();
			mocks.insert.mockReturnValue(insertChain);

			const result = await addMissingCollectionMoviesFn({ data: baseData });

			expect(result).toEqual({ added: 0 });
			expect(mocks.tmdbFetch).not.toHaveBeenCalled();
		});

		it("triggers search when searchOnAdd is true and monitorOption is not none", async () => {
			const collection = { id: 1, tmdbId: 500, monitored: false };
			const collectionMovies = [
				{ collectionId: 1, tmdbId: 300, title: "New Movie" },
			];

			let callIndex = 0;
			mocks.select.mockImplementation(() => {
				callIndex++;
				switch (callIndex) {
					case 1:
						return createSelectChain(collection);
					case 2:
						return createSelectChain(undefined, []); // exclusions
					case 3:
						return createSelectChain(undefined, []); // existing
					case 4:
						return createSelectChain(undefined, collectionMovies);
					default:
						return createSelectChain(undefined, []);
				}
			});

			const updateChain = createUpdateChain();
			mocks.update.mockReturnValue(updateChain);

			const deleteChain = createDeleteChain();
			mocks.deleteFn.mockReturnValue(deleteChain);

			const insertChain = createInsertChain({ id: 77 });
			mocks.insert.mockReturnValue(insertChain);

			mocks.tmdbFetch.mockResolvedValue(makeTmdbMovieDetail());
			mocks.searchForMovie.mockResolvedValue(undefined);

			await addMissingCollectionMoviesFn({
				data: { ...baseData, searchOnAdd: true },
			});

			expect(mocks.searchForMovie).toHaveBeenCalledWith(77);
		});

		it("does not trigger search when searchOnAdd is true but monitorOption is none", async () => {
			const collection = { id: 1, tmdbId: 500, monitored: false };
			const collectionMovies = [
				{ collectionId: 1, tmdbId: 300, title: "New Movie" },
			];

			let callIndex = 0;
			mocks.select.mockImplementation(() => {
				callIndex++;
				switch (callIndex) {
					case 1:
						return createSelectChain(collection);
					case 2:
						return createSelectChain(undefined, []); // exclusions
					case 3:
						return createSelectChain(undefined, []); // existing
					case 4:
						return createSelectChain(undefined, collectionMovies);
					default:
						return createSelectChain(undefined, []);
				}
			});

			const updateChain = createUpdateChain();
			mocks.update.mockReturnValue(updateChain);

			const insertChain = createInsertChain({ id: 77 });
			mocks.insert.mockReturnValue(insertChain);

			mocks.tmdbFetch.mockResolvedValue(makeTmdbMovieDetail());

			await addMissingCollectionMoviesFn({
				data: {
					...baseData,
					searchOnAdd: true,
					monitorOption: "none",
				},
			});

			expect(mocks.searchForMovie).not.toHaveBeenCalled();
		});

		it("handles TMDB detail with no production companies", async () => {
			const collection = { id: 1, tmdbId: 500 };
			const collectionMovies = [
				{ collectionId: 1, tmdbId: 400, title: "Indie Movie" },
			];

			let callIndex = 0;
			mocks.select.mockImplementation(() => {
				callIndex++;
				switch (callIndex) {
					case 1:
						return createSelectChain(collection);
					case 2:
						return createSelectChain(undefined, []); // exclusions
					case 3:
						return createSelectChain(undefined, []); // existing
					case 4:
						return createSelectChain(undefined, collectionMovies);
					default:
						return createSelectChain(undefined, []);
				}
			});

			const updateChain = createUpdateChain();
			mocks.update.mockReturnValue(updateChain);

			const deleteChain = createDeleteChain();
			mocks.deleteFn.mockReturnValue(deleteChain);

			const insertChain = createInsertChain({ id: 55 });
			mocks.insert.mockReturnValue(insertChain);

			mocks.tmdbFetch.mockResolvedValue(
				makeTmdbMovieDetail({
					production_companies: [],
					release_date: "",
					runtime: null,
					imdb_id: null,
				}),
			);

			const result = await addMissingCollectionMoviesFn({ data: baseData });

			expect(result).toEqual({ added: 1 });
			// Studio should default to ""
			expect(insertChain.values).toHaveBeenCalledWith(
				expect.objectContaining({
					studio: "",
					year: 0,
					runtime: 0,
					imdbId: null,
				}),
			);
		});

		it("rejects when admin auth fails", async () => {
			mocks.requireAdmin.mockRejectedValueOnce(new Error("forbidden"));

			await expect(
				addMissingCollectionMoviesFn({ data: baseData }),
			).rejects.toThrow("forbidden");
			expect(mocks.select).not.toHaveBeenCalled();
		});
	});

	// ─── addMovieImportExclusionFn ────────────────────────────────────────

	describe("addMovieImportExclusionFn", () => {
		it("inserts exclusion with onConflictDoNothing and returns success", async () => {
			const insertChain = createInsertChain();
			mocks.insert.mockReturnValue(insertChain);

			const result = await addMovieImportExclusionFn({
				data: { tmdbId: 123, title: "Excluded Movie", year: 2024 },
			});

			expect(mocks.requireAdmin).toHaveBeenCalledTimes(1);
			expect(mocks.insert).toHaveBeenCalledWith(
				schemaMocks.movieImportListExclusions,
			);
			expect(insertChain.values).toHaveBeenCalledWith({
				tmdbId: 123,
				title: "Excluded Movie",
				year: 2024,
			});
			expect(insertChain.onConflictDoNothing).toHaveBeenCalledTimes(1);
			expect(insertChain.run).toHaveBeenCalledTimes(1);
			expect(result).toEqual({ success: true });
		});

		it("handles optional year as null", async () => {
			const insertChain = createInsertChain();
			mocks.insert.mockReturnValue(insertChain);

			await addMovieImportExclusionFn({
				data: { tmdbId: 456, title: "No Year Movie" },
			});

			expect(insertChain.values).toHaveBeenCalledWith({
				tmdbId: 456,
				title: "No Year Movie",
				year: null,
			});
		});

		it("rejects when admin auth fails", async () => {
			mocks.requireAdmin.mockRejectedValueOnce(new Error("forbidden"));

			await expect(
				addMovieImportExclusionFn({
					data: { tmdbId: 1, title: "Test" },
				}),
			).rejects.toThrow("forbidden");
			expect(mocks.insert).not.toHaveBeenCalled();
		});
	});
});
