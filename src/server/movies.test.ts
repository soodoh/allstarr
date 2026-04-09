import { beforeEach, describe, expect, it, vi } from "vitest";

// ─── Hoisted Mocks ──────────────────────────────────────────────────────────

const mocks = vi.hoisted(() => ({
	deleteRun: vi.fn(),
	deleteWhere: vi.fn(),
	insertOnConflictDoNothing: vi.fn(),
	insertOnConflictDoUpdate: vi.fn(),
	insertRun: vi.fn(),
	insertValues: vi.fn(),
	insertReturningGet: vi.fn(),
	logError: vi.fn(),
	requireAdmin: vi.fn(),
	requireAuth: vi.fn(),
	searchForMovie: vi.fn(),
	selectAll: vi.fn(),
	selectGet: vi.fn(),
	submitCommand: vi.fn(),
	tmdbFetch: vi.fn(),
	unlinkSync: vi.fn(),
	updateRun: vi.fn(),
}));

// ─── Module Mocks ────────────────────────────────────────────────────────────

vi.mock("node:fs", () => ({
	unlinkSync: mocks.unlinkSync,
}));

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
	and: vi.fn((...args: unknown[]) => ({ type: "and", args })),
	eq: vi.fn((l: unknown, r: unknown) => ({ l, r })),
	sql: (...args: unknown[]) => ({ args }),
}));

vi.mock("src/db", () => {
	const insertReturningChain = {
		get: mocks.insertReturningGet,
	};
	const insertOnConflictDoUpdateChain = {
		run: mocks.insertRun,
	};
	const insertOnConflictDoNothingChain = {
		run: mocks.insertRun,
	};
	const insertValuesChain = {
		onConflictDoNothing: vi.fn(() => insertOnConflictDoNothingChain),
		onConflictDoUpdate: vi.fn(() => insertOnConflictDoUpdateChain),
		returning: vi.fn(() => insertReturningChain),
		run: mocks.insertRun,
	};
	const insertChain = {
		values: vi.fn(() => insertValuesChain),
	};
	const deleteWhereChain = {
		run: mocks.deleteRun,
	};
	const deleteChain = {
		where: vi.fn(() => deleteWhereChain),
	};
	const updateSetChain = {
		where: vi.fn(() => ({
			run: mocks.updateRun,
		})),
		run: mocks.updateRun,
	};
	const updateChain = {
		set: vi.fn(() => updateSetChain),
	};
	const selectFromChain = {
		all: mocks.selectAll,
		get: mocks.selectGet,
		groupBy: vi.fn(() => ({ all: mocks.selectAll })),
		leftJoin: vi.fn(() => ({
			all: mocks.selectAll,
			groupBy: vi.fn(() => ({ all: mocks.selectAll })),
		})),
		where: vi.fn(() => ({
			all: mocks.selectAll,
			get: mocks.selectGet,
		})),
	};
	const selectChain = {
		from: vi.fn(() => selectFromChain),
	};

	return {
		db: {
			delete: vi.fn(() => deleteChain),
			insert: vi.fn(() => insertChain),
			select: vi.fn(() => selectChain),
			update: vi.fn(() => updateChain),
		},
	};
});

vi.mock("src/db/schema", () => ({
	history: { id: "history.id" },
	movieCollectionDownloadProfiles: {
		collectionId: "movieCollectionDownloadProfiles.collectionId",
		downloadProfileId: "movieCollectionDownloadProfiles.downloadProfileId",
	},
	movieCollectionMovies: {
		collectionId: "movieCollectionMovies.collectionId",
		tmdbId: "movieCollectionMovies.tmdbId",
	},
	movieCollections: {
		id: "movieCollections.id",
		tmdbId: "movieCollections.tmdbId",
	},
	movieDownloadProfiles: {
		downloadProfileId: "movieDownloadProfiles.downloadProfileId",
		movieId: "movieDownloadProfiles.movieId",
	},
	movieFiles: {
		id: "movieFiles.id",
		movieId: "movieFiles.movieId",
		path: "movieFiles.path",
	},
	movieImportListExclusions: {
		tmdbId: "movieImportListExclusions.tmdbId",
	},
	movies: {
		collectionId: "movies.collectionId",
		id: "movies.id",
		tmdbId: "movies.tmdbId",
	},
}));

vi.mock("src/lib/tmdb-validators", () => ({
	addMovieSchema: { parse: (d: unknown) => d },
	deleteMovieSchema: { parse: (d: unknown) => d },
	monitorMovieProfileSchema: { parse: (d: unknown) => d },
	refreshMovieSchema: { parse: (d: unknown) => d },
	unmonitorMovieProfileSchema: { parse: (d: unknown) => d },
	updateMovieSchema: { parse: (d: unknown) => d },
}));

vi.mock("./auto-search", () => ({
	searchForMovie: mocks.searchForMovie,
}));

vi.mock("./commands", () => ({
	submitCommand: mocks.submitCommand,
}));

vi.mock("./logger", () => ({
	logError: mocks.logError,
}));

vi.mock("./middleware", () => ({
	requireAdmin: () => mocks.requireAdmin(),
	requireAuth: () => mocks.requireAuth(),
}));

vi.mock("./tmdb/client", () => ({
	tmdbFetch: mocks.tmdbFetch,
}));

vi.mock("./utils/movie-helpers", () => ({
	generateSortTitle: (t: string) => t.replace(/^(The|A|An)\s+/i, ""),
	mapMovieStatus: (s: string) => (s === "Released" ? "released" : "announced"),
	transformImagePath: (p: string | null, size: string) =>
		p ? `https://image.tmdb.org/t/p/${size}${p}` : null,
}));

// ─── Import Module Under Test ────────────────────────────────────────────────

import {
	addMovieFn,
	checkMovieExistsFn,
	deleteMovieFn,
	getMovieDetailFn,
	getMoviesFn,
	monitorMovieProfileFn,
	refreshMovieInternal,
	refreshMovieMetadataFn,
	unmonitorMovieProfileFn,
	updateMovieFn,
} from "./movies";

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("server/movies", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.requireAuth.mockResolvedValue({ user: { id: 1 } });
		mocks.requireAdmin.mockResolvedValue({ user: { id: 1, role: "admin" } });
	});

	// ─── addMovieFn ────────────────────────────────────────────────────────

	describe("addMovieFn", () => {
		it("calls requireAdmin and submits an addMovie command", async () => {
			mocks.submitCommand.mockResolvedValueOnce({ commandId: 1 });

			const input = {
				tmdbId: 550,
				downloadProfileIds: [1],
				minimumAvailability: "released",
				monitorOption: "movieOnly",
				searchOnAdd: false,
			};

			const result = await addMovieFn({ data: input });

			expect(mocks.requireAdmin).toHaveBeenCalledTimes(1);
			expect(mocks.submitCommand).toHaveBeenCalledTimes(1);
			expect(mocks.submitCommand).toHaveBeenCalledWith(
				expect.objectContaining({
					commandType: "addMovie",
					dedupeKey: "tmdbId",
					body: input,
				}),
			);
			expect(result).toEqual({ commandId: 1 });
		});

		it("rejects when admin auth fails", async () => {
			mocks.requireAdmin.mockRejectedValueOnce(new Error("forbidden"));

			await expect(
				addMovieFn({
					data: {
						tmdbId: 550,
						downloadProfileIds: [1],
						minimumAvailability: "released",
						monitorOption: "movieOnly",
						searchOnAdd: false,
					},
				}),
			).rejects.toThrow("forbidden");

			expect(mocks.submitCommand).not.toHaveBeenCalled();
		});
	});

	// ─── getMoviesFn ───────────────────────────────────────────────────────

	describe("getMoviesFn", () => {
		it("returns movies with download profile IDs after auth", async () => {
			const movieRows = [
				{ id: 1, title: "Fight Club", hasFile: false },
				{ id: 2, title: "Inception", hasFile: true },
			];
			const profileLinks = [
				{ movieId: 1, downloadProfileId: 10 },
				{ movieId: 1, downloadProfileId: 20 },
				{ movieId: 2, downloadProfileId: 10 },
			];

			// First selectAll call: movies query
			mocks.selectAll.mockReturnValueOnce(movieRows);
			// Second selectAll call: profile links query
			mocks.selectAll.mockReturnValueOnce(profileLinks);

			const result = await getMoviesFn();

			expect(mocks.requireAuth).toHaveBeenCalledTimes(1);
			expect(result).toEqual([
				{
					id: 1,
					title: "Fight Club",
					hasFile: false,
					downloadProfileIds: [10, 20],
				},
				{ id: 2, title: "Inception", hasFile: true, downloadProfileIds: [10] },
			]);
		});

		it("returns empty downloadProfileIds when no profiles linked", async () => {
			mocks.selectAll.mockReturnValueOnce([{ id: 1, title: "Solo" }]);
			mocks.selectAll.mockReturnValueOnce([]);

			const result = await getMoviesFn();

			expect(result).toEqual([
				{ id: 1, title: "Solo", downloadProfileIds: [] },
			]);
		});

		it("rejects when auth fails", async () => {
			mocks.requireAuth.mockRejectedValueOnce(new Error("unauthorized"));

			await expect(getMoviesFn()).rejects.toThrow("unauthorized");
		});
	});

	// ─── getMovieDetailFn ──────────────────────────────────────────────────

	describe("getMovieDetailFn", () => {
		it("returns movie with files and download profile IDs", async () => {
			const movie = { id: 5, title: "Interstellar", tmdbId: 157336 };
			const files = [{ id: 1, movieId: 5, path: "/media/interstellar.mkv" }];
			const profileLinks = [{ downloadProfileId: 3 }, { downloadProfileId: 7 }];

			// First get: movie lookup
			mocks.selectGet.mockReturnValueOnce(movie);
			// Second all: files
			mocks.selectAll.mockReturnValueOnce(files);
			// Third all: profile links
			mocks.selectAll.mockReturnValueOnce(profileLinks);

			const result = await getMovieDetailFn({ data: { id: 5 } });

			expect(mocks.requireAuth).toHaveBeenCalledTimes(1);
			expect(result).toEqual({
				...movie,
				downloadProfileIds: [3, 7],
				files,
			});
		});

		it("throws when movie not found", async () => {
			mocks.selectGet.mockReturnValueOnce(undefined);

			await expect(getMovieDetailFn({ data: { id: 999 } })).rejects.toThrow(
				"Movie not found",
			);
		});

		it("rejects when auth fails", async () => {
			mocks.requireAuth.mockRejectedValueOnce(new Error("unauthorized"));

			await expect(getMovieDetailFn({ data: { id: 1 } })).rejects.toThrow(
				"unauthorized",
			);
		});
	});

	// ─── updateMovieFn ─────────────────────────────────────────────────────

	describe("updateMovieFn", () => {
		it("updates movie and syncs download profiles", async () => {
			const existingMovie = { id: 1, title: "Existing" };
			const updatedMovie = {
				id: 1,
				title: "Existing",
				minimumAvailability: "inCinemas",
			};

			// First get: existence check
			mocks.selectGet.mockReturnValueOnce(existingMovie);
			// Second get: return updated row
			mocks.selectGet.mockReturnValueOnce(updatedMovie);

			const result = await updateMovieFn({
				data: {
					id: 1,
					minimumAvailability: "inCinemas",
					downloadProfileIds: [5, 6],
				},
			});

			expect(mocks.requireAdmin).toHaveBeenCalledTimes(1);
			expect(result).toEqual(updatedMovie);
		});

		it("throws when movie not found", async () => {
			mocks.selectGet.mockReturnValueOnce(undefined);

			await expect(updateMovieFn({ data: { id: 999 } })).rejects.toThrow(
				"Movie not found",
			);
		});

		it("rejects when admin auth fails", async () => {
			mocks.requireAdmin.mockRejectedValueOnce(new Error("forbidden"));

			await expect(updateMovieFn({ data: { id: 1 } })).rejects.toThrow(
				"forbidden",
			);
		});
	});

	// ─── deleteMovieFn ─────────────────────────────────────────────────────

	describe("deleteMovieFn", () => {
		it("deletes movie and records history", async () => {
			const movie = {
				id: 1,
				title: "Old Movie",
				tmdbId: 100,
				year: 2020,
				collectionId: null,
			};
			mocks.selectGet.mockReturnValueOnce(movie);

			const result = await deleteMovieFn({
				data: { id: 1, deleteFiles: false, addImportExclusion: false },
			});

			expect(mocks.requireAdmin).toHaveBeenCalledTimes(1);
			expect(result).toEqual({ success: true });
		});

		it("adds import exclusion when requested", async () => {
			const movie = {
				id: 1,
				title: "Excluded Movie",
				tmdbId: 200,
				year: 2022,
				collectionId: null,
			};
			mocks.selectGet.mockReturnValueOnce(movie);

			const { db } = await import("src/db");

			await deleteMovieFn({
				data: { id: 1, deleteFiles: false, addImportExclusion: true },
			});

			// insert should be called for exclusion + history (at least)
			expect(db.insert).toHaveBeenCalled();
		});

		it("deletes files from disk when deleteFiles is true", async () => {
			const movie = {
				id: 1,
				title: "Movie With Files",
				tmdbId: 300,
				year: 2023,
				collectionId: null,
			};
			const files = [
				{ path: "/media/movie1.mkv" },
				{ path: "/media/movie2.srt" },
			];
			// First get: movie lookup
			mocks.selectGet.mockReturnValueOnce(movie);
			// all: files listing
			mocks.selectAll.mockReturnValueOnce(files);

			await deleteMovieFn({
				data: { id: 1, deleteFiles: true, addImportExclusion: false },
			});

			expect(mocks.unlinkSync).toHaveBeenCalledTimes(2);
			expect(mocks.unlinkSync).toHaveBeenCalledWith("/media/movie1.mkv");
			expect(mocks.unlinkSync).toHaveBeenCalledWith("/media/movie2.srt");
		});

		it("cleans up orphaned collection when last movie removed", async () => {
			const movie = {
				id: 1,
				title: "Last In Collection",
				tmdbId: 400,
				year: 2021,
				collectionId: 10,
			};
			// First get: movie lookup
			mocks.selectGet.mockReturnValueOnce(movie);
			// Second get: remaining count = 0
			mocks.selectGet.mockReturnValueOnce({ count: 0 });

			const { db } = await import("src/db");

			await deleteMovieFn({
				data: { id: 1, deleteFiles: false, addImportExclusion: false },
			});

			// delete called for movie + collection cleanup
			expect(db.delete).toHaveBeenCalled();
		});

		it("throws when movie not found", async () => {
			mocks.selectGet.mockReturnValueOnce(undefined);

			await expect(
				deleteMovieFn({
					data: { id: 999, deleteFiles: false, addImportExclusion: false },
				}),
			).rejects.toThrow("Movie not found");
		});

		it("rejects when admin auth fails", async () => {
			mocks.requireAdmin.mockRejectedValueOnce(new Error("forbidden"));

			await expect(
				deleteMovieFn({
					data: { id: 1, deleteFiles: false, addImportExclusion: false },
				}),
			).rejects.toThrow("forbidden");
		});
	});

	// ─── checkMovieExistsFn ────────────────────────────────────────────────

	describe("checkMovieExistsFn", () => {
		it("returns true when movie exists", async () => {
			mocks.selectGet.mockReturnValueOnce({ id: 1 });

			const result = await checkMovieExistsFn({ data: { tmdbId: 550 } });

			expect(mocks.requireAuth).toHaveBeenCalledTimes(1);
			expect(result).toBe(true);
		});

		it("returns false when movie does not exist", async () => {
			mocks.selectGet.mockReturnValueOnce(undefined);

			const result = await checkMovieExistsFn({ data: { tmdbId: 999 } });

			expect(result).toBe(false);
		});

		it("rejects when auth fails", async () => {
			mocks.requireAuth.mockRejectedValueOnce(new Error("unauthorized"));

			await expect(
				checkMovieExistsFn({ data: { tmdbId: 550 } }),
			).rejects.toThrow("unauthorized");
		});
	});

	// ─── refreshMovieInternal ──────────────────────────────────────────────

	describe("refreshMovieInternal", () => {
		const tmdbResponse = {
			title: "Fight Club",
			overview: "An insomniac office worker...",
			status: "Released",
			release_date: "1999-10-15",
			runtime: 139,
			genres: [{ name: "Drama" }],
			production_companies: [{ name: "Fox 2000 Pictures" }],
			poster_path: "/poster.jpg",
			backdrop_path: "/backdrop.jpg",
			imdb_id: "tt0137523",
			belongs_to_collection: null,
		};

		it("fetches TMDB data and updates the movie", async () => {
			mocks.selectGet.mockReturnValueOnce({ id: 1, tmdbId: 550 });
			mocks.tmdbFetch.mockResolvedValueOnce(tmdbResponse);

			const result = await refreshMovieInternal(1);

			expect(mocks.tmdbFetch).toHaveBeenCalledWith("/movie/550");
			expect(result).toEqual({ success: true });
		});

		it("upserts collection when movie belongs to one", async () => {
			const responseWithCollection = {
				...tmdbResponse,
				belongs_to_collection: {
					id: 10,
					name: "Fight Club Collection",
					poster_path: "/col-poster.jpg",
					backdrop_path: "/col-backdrop.jpg",
				},
			};

			mocks.selectGet.mockReturnValueOnce({ id: 1, tmdbId: 550 });
			mocks.tmdbFetch
				.mockResolvedValueOnce(responseWithCollection)
				// populateCollectionCache fetch
				.mockResolvedValueOnce({ parts: [] });
			// Collection lookup returns existing
			mocks.selectGet.mockReturnValueOnce({ id: 5 });

			const result = await refreshMovieInternal(1);

			expect(mocks.tmdbFetch).toHaveBeenCalledTimes(2);
			expect(result).toEqual({ success: true });
		});

		it("inserts new collection when none exists", async () => {
			const responseWithCollection = {
				...tmdbResponse,
				belongs_to_collection: {
					id: 99,
					name: "New Collection",
					poster_path: "/new-poster.jpg",
					backdrop_path: "/new-backdrop.jpg",
				},
			};

			mocks.selectGet.mockReturnValueOnce({ id: 1, tmdbId: 550 });
			mocks.tmdbFetch
				.mockResolvedValueOnce(responseWithCollection)
				.mockResolvedValueOnce({ parts: [] });
			// Collection lookup: not found
			mocks.selectGet.mockReturnValueOnce(undefined);
			// Insert returning: new collection
			mocks.insertReturningGet.mockReturnValueOnce({ id: 42 });

			const result = await refreshMovieInternal(1);

			expect(result).toEqual({ success: true });
		});

		it("throws when movie not found", async () => {
			mocks.selectGet.mockReturnValueOnce(undefined);

			await expect(refreshMovieInternal(999)).rejects.toThrow(
				"Movie not found",
			);

			expect(mocks.tmdbFetch).not.toHaveBeenCalled();
		});
	});

	// ─── refreshMovieMetadataFn ────────────────────────────────────────────

	describe("refreshMovieMetadataFn", () => {
		it("calls requireAdmin and delegates to refreshMovieInternal", async () => {
			mocks.selectGet.mockReturnValueOnce({ id: 1, tmdbId: 550 });
			mocks.tmdbFetch.mockResolvedValueOnce({
				title: "Test",
				overview: "",
				status: "Released",
				release_date: "2024-01-01",
				runtime: 90,
				genres: [],
				production_companies: [],
				poster_path: null,
				backdrop_path: null,
				imdb_id: null,
				belongs_to_collection: null,
			});

			const result = await refreshMovieMetadataFn({
				data: { movieId: 1 },
			});

			expect(mocks.requireAdmin).toHaveBeenCalledTimes(1);
			expect(result).toEqual({ success: true });
		});

		it("rejects when admin auth fails", async () => {
			mocks.requireAdmin.mockRejectedValueOnce(new Error("forbidden"));

			await expect(
				refreshMovieMetadataFn({ data: { movieId: 1 } }),
			).rejects.toThrow("forbidden");

			expect(mocks.tmdbFetch).not.toHaveBeenCalled();
		});
	});

	// ─── monitorMovieProfileFn ─────────────────────────────────────────────

	describe("monitorMovieProfileFn", () => {
		it("inserts a download profile link and returns success", async () => {
			const result = await monitorMovieProfileFn({
				data: { movieId: 1, downloadProfileId: 5 },
			});

			expect(mocks.requireAdmin).toHaveBeenCalledTimes(1);
			expect(result).toEqual({ success: true });
		});

		it("rejects when admin auth fails", async () => {
			mocks.requireAdmin.mockRejectedValueOnce(new Error("forbidden"));

			await expect(
				monitorMovieProfileFn({
					data: { movieId: 1, downloadProfileId: 5 },
				}),
			).rejects.toThrow("forbidden");
		});
	});

	// ─── unmonitorMovieProfileFn ───────────────────────────────────────────

	describe("unmonitorMovieProfileFn", () => {
		it("deletes a download profile link and returns success", async () => {
			const result = await unmonitorMovieProfileFn({
				data: { movieId: 1, downloadProfileId: 5 },
			});

			expect(mocks.requireAdmin).toHaveBeenCalledTimes(1);
			expect(result).toEqual({ success: true });
		});

		it("rejects when admin auth fails", async () => {
			mocks.requireAdmin.mockRejectedValueOnce(new Error("forbidden"));

			await expect(
				unmonitorMovieProfileFn({
					data: { movieId: 1, downloadProfileId: 5 },
				}),
			).rejects.toThrow("forbidden");
		});
	});

	// ─── addMovieHandler (via submitCommand capture) ──────────────────────

	describe("addMovieHandler (internal)", () => {
		const baseTmdbResponse = {
			title: "Fight Club",
			overview: "An insomniac office worker...",
			status: "Released",
			release_date: "1999-10-15",
			runtime: 139,
			genres: [{ name: "Drama" }],
			production_companies: [{ name: "Fox 2000 Pictures" }],
			poster_path: "/poster.jpg",
			backdrop_path: "/backdrop.jpg",
			imdb_id: "tt0137523",
			belongs_to_collection: null,
		};

		async function captureHandler(): Promise<
			(
				body: Record<string, unknown>,
				updateProgress: (msg: string) => void,
				setTitle: (title: string) => void,
			) => Promise<Record<string, unknown>>
		> {
			mocks.submitCommand.mockResolvedValueOnce({ commandId: 1 });
			await addMovieFn({
				data: {
					tmdbId: 550,
					downloadProfileIds: [1],
					minimumAvailability: "released",
					monitorOption: "movieOnly",
					searchOnAdd: false,
				},
			});
			return mocks.submitCommand.mock.calls[0][0].handler;
		}

		it("throws when movie already exists", async () => {
			const handler = await captureHandler();

			// selectGet: existing movie found
			mocks.selectGet.mockReturnValueOnce({ id: 99 });

			await expect(
				handler(
					{
						tmdbId: 550,
						downloadProfileIds: [1],
						minimumAvailability: "released",
						monitorOption: "movieOnly",
						searchOnAdd: false,
					},
					vi.fn(),
					vi.fn(),
				),
			).rejects.toThrow("Movie already exists");
		});

		it("adds a movie without a collection", async () => {
			const handler = await captureHandler();

			const updateProgress = vi.fn();
			const setTitle = vi.fn();

			// selectGet: no existing movie
			mocks.selectGet.mockReturnValueOnce(undefined);
			mocks.tmdbFetch.mockResolvedValueOnce(baseTmdbResponse);
			// insert returning: inserted movie
			mocks.insertReturningGet.mockReturnValueOnce({
				id: 10,
				title: "Fight Club",
			});

			const result = await handler(
				{
					tmdbId: 550,
					downloadProfileIds: [1],
					minimumAvailability: "released",
					monitorOption: "movieOnly",
					searchOnAdd: false,
				},
				updateProgress,
				setTitle,
			);

			expect(setTitle).toHaveBeenCalledWith("Fight Club");
			expect(updateProgress).toHaveBeenCalledWith("Fetching movie details...");
			expect(updateProgress).toHaveBeenCalledWith("Saving movie...");
			expect(result).toEqual({ movieId: 10, title: "Fight Club" });
		});

		it("assigns download profiles when monitorOption is not none", async () => {
			const handler = await captureHandler();
			const { db } = await import("src/db");

			mocks.selectGet.mockReturnValueOnce(undefined);
			mocks.tmdbFetch.mockResolvedValueOnce(baseTmdbResponse);
			mocks.insertReturningGet.mockReturnValueOnce({
				id: 10,
				title: "Fight Club",
			});

			await handler(
				{
					tmdbId: 550,
					downloadProfileIds: [1, 2],
					minimumAvailability: "released",
					monitorOption: "movieOnly",
					searchOnAdd: false,
				},
				vi.fn(),
				vi.fn(),
			);

			// insert called for: movie + 2 profiles + history = 4
			expect(db.insert).toHaveBeenCalled();
		});

		it("skips download profiles when monitorOption is none", async () => {
			const handler = await captureHandler();
			const { db } = await import("src/db");

			mocks.selectGet.mockReturnValueOnce(undefined);
			mocks.tmdbFetch.mockResolvedValueOnce(baseTmdbResponse);
			mocks.insertReturningGet.mockReturnValueOnce({
				id: 10,
				title: "Fight Club",
			});

			// Clear mocks to count only handler calls
			vi.mocked(db.insert).mockClear();

			await handler(
				{
					tmdbId: 550,
					downloadProfileIds: [1, 2],
					minimumAvailability: "released",
					monitorOption: "none",
					searchOnAdd: false,
				},
				vi.fn(),
				vi.fn(),
			);

			// insert called for: movie + history only (no profiles)
			expect(db.insert).toHaveBeenCalledTimes(2);
		});

		it("upserts existing collection and populates cache with parts", async () => {
			const handler = await captureHandler();

			const responseWithCollection = {
				...baseTmdbResponse,
				belongs_to_collection: {
					id: 10,
					name: "Fight Club Collection",
					poster_path: "/col-poster.jpg",
					backdrop_path: "/col-backdrop.jpg",
				},
			};

			// selectGet: no existing movie
			mocks.selectGet.mockReturnValueOnce(undefined);
			mocks.tmdbFetch.mockResolvedValueOnce(responseWithCollection);
			// Collection lookup: existing collection found
			mocks.selectGet.mockReturnValueOnce({ id: 5 });
			// populateCollectionCache fetch with actual parts
			mocks.tmdbFetch.mockResolvedValueOnce({
				parts: [
					{
						id: 550,
						title: "Fight Club",
						overview: "Part 1",
						poster_path: "/p1.jpg",
						release_date: "1999-10-15",
					},
					{
						id: 551,
						title: "Fight Club 2",
						overview: "Part 2",
						poster_path: null,
						release_date: "",
					},
				],
			});
			// insert returning: movie
			mocks.insertReturningGet.mockReturnValueOnce({
				id: 10,
				title: "Fight Club",
			});

			const result = await handler(
				{
					tmdbId: 550,
					downloadProfileIds: [1],
					minimumAvailability: "released",
					monitorOption: "movieOnly",
					searchOnAdd: false,
				},
				vi.fn(),
				vi.fn(),
			);

			expect(mocks.tmdbFetch).toHaveBeenCalledWith("/collection/10");
			expect(result).toEqual({ movieId: 10, title: "Fight Club" });
		});

		it("inserts new collection when none exists", async () => {
			const handler = await captureHandler();

			const responseWithCollection = {
				...baseTmdbResponse,
				belongs_to_collection: {
					id: 99,
					name: "New Collection",
					poster_path: "/new-poster.jpg",
					backdrop_path: "/new-backdrop.jpg",
				},
			};

			mocks.selectGet.mockReturnValueOnce(undefined);
			mocks.tmdbFetch.mockResolvedValueOnce(responseWithCollection);
			// Collection lookup: not found
			mocks.selectGet.mockReturnValueOnce(undefined);
			// Insert returning: new collection
			mocks.insertReturningGet.mockReturnValueOnce({ id: 42 });
			// populateCollectionCache
			mocks.tmdbFetch.mockResolvedValueOnce({ parts: [] });
			// Insert returning: movie
			mocks.insertReturningGet.mockReturnValueOnce({
				id: 10,
				title: "Fight Club",
			});

			const result = await handler(
				{
					tmdbId: 550,
					downloadProfileIds: [1],
					minimumAvailability: "released",
					monitorOption: "movieOnly",
					searchOnAdd: false,
				},
				vi.fn(),
				vi.fn(),
			);

			expect(result).toEqual({ movieId: 10, title: "Fight Club" });
		});

		it("sets collection monitored flag when monitorOption is movieAndCollection", async () => {
			const handler = await captureHandler();
			const { db } = await import("src/db");

			const responseWithCollection = {
				...baseTmdbResponse,
				belongs_to_collection: {
					id: 10,
					name: "Test Collection",
					poster_path: "/cp.jpg",
					backdrop_path: "/cb.jpg",
				},
			};

			mocks.selectGet.mockReturnValueOnce(undefined);
			mocks.tmdbFetch.mockResolvedValueOnce(responseWithCollection);
			mocks.selectGet.mockReturnValueOnce({ id: 5 });
			mocks.tmdbFetch.mockResolvedValueOnce({ parts: [] });
			mocks.insertReturningGet.mockReturnValueOnce({
				id: 10,
				title: "Fight Club",
			});

			await handler(
				{
					tmdbId: 550,
					downloadProfileIds: [1],
					minimumAvailability: "released",
					monitorOption: "movieAndCollection",
					searchOnAdd: false,
				},
				vi.fn(),
				vi.fn(),
			);

			// update called for collection (existing update + propagation)
			expect(db.update).toHaveBeenCalled();
		});

		it("triggers search when searchOnAdd is true and monitorOption is not none", async () => {
			const handler = await captureHandler();

			mocks.selectGet.mockReturnValueOnce(undefined);
			mocks.tmdbFetch.mockResolvedValueOnce(baseTmdbResponse);
			mocks.insertReturningGet.mockReturnValueOnce({
				id: 10,
				title: "Fight Club",
			});
			mocks.searchForMovie.mockResolvedValueOnce(undefined);

			const updateProgress = vi.fn();
			await handler(
				{
					tmdbId: 550,
					downloadProfileIds: [1],
					minimumAvailability: "released",
					monitorOption: "movieOnly",
					searchOnAdd: true,
				},
				updateProgress,
				vi.fn(),
			);

			expect(updateProgress).toHaveBeenCalledWith(
				"Searching for available releases...",
			);
			expect(mocks.searchForMovie).toHaveBeenCalledWith(10);
		});

		it("does not trigger search when monitorOption is none even if searchOnAdd is true", async () => {
			const handler = await captureHandler();

			mocks.selectGet.mockReturnValueOnce(undefined);
			mocks.tmdbFetch.mockResolvedValueOnce(baseTmdbResponse);
			mocks.insertReturningGet.mockReturnValueOnce({
				id: 10,
				title: "Fight Club",
			});

			await handler(
				{
					tmdbId: 550,
					downloadProfileIds: [1],
					minimumAvailability: "released",
					monitorOption: "none",
					searchOnAdd: true,
				},
				vi.fn(),
				vi.fn(),
			);

			expect(mocks.searchForMovie).not.toHaveBeenCalled();
		});

		it("logs error when search after add fails", async () => {
			const handler = await captureHandler();

			mocks.selectGet.mockReturnValueOnce(undefined);
			mocks.tmdbFetch.mockResolvedValueOnce(baseTmdbResponse);
			mocks.insertReturningGet.mockReturnValueOnce({
				id: 10,
				title: "Fight Club",
			});
			const searchError = new Error("search failed");
			mocks.searchForMovie.mockRejectedValueOnce(searchError);

			await handler(
				{
					tmdbId: 550,
					downloadProfileIds: [1],
					minimumAvailability: "released",
					monitorOption: "movieOnly",
					searchOnAdd: true,
				},
				vi.fn(),
				vi.fn(),
			);

			// Give the void promise time to settle
			await new Promise((r) => setTimeout(r, 10));

			expect(mocks.logError).toHaveBeenCalledWith(
				"movies",
				"Search after add failed",
				searchError,
			);
		});

		it("handles movie with null poster/backdrop paths triggering fallback", async () => {
			const handler = await captureHandler();

			const sparseResponse = {
				...baseTmdbResponse,
				production_companies: [],
				release_date: "",
				runtime: null,
				imdb_id: null,
				poster_path: null,
				backdrop_path: null,
			};

			mocks.selectGet.mockReturnValueOnce(undefined);
			mocks.tmdbFetch.mockResolvedValueOnce(sparseResponse);
			mocks.insertReturningGet.mockReturnValueOnce({
				id: 10,
				title: "Fight Club",
			});

			const result = await handler(
				{
					tmdbId: 550,
					downloadProfileIds: [],
					minimumAvailability: "released",
					monitorOption: "none",
					searchOnAdd: false,
				},
				vi.fn(),
				vi.fn(),
			);

			expect(result).toEqual({ movieId: 10, title: "Fight Club" });
		});

		it("skips collection download profile sync when monitorOption is none", async () => {
			const handler = await captureHandler();
			const { db } = await import("src/db");

			const responseWithCollection = {
				...baseTmdbResponse,
				belongs_to_collection: {
					id: 10,
					name: "Test Collection",
					poster_path: "/cp.jpg",
					backdrop_path: "/cb.jpg",
				},
			};

			mocks.selectGet.mockReturnValueOnce(undefined);
			mocks.tmdbFetch.mockResolvedValueOnce(responseWithCollection);
			mocks.selectGet.mockReturnValueOnce({ id: 5 });
			mocks.tmdbFetch.mockResolvedValueOnce({ parts: [] });
			mocks.insertReturningGet.mockReturnValueOnce({
				id: 10,
				title: "Fight Club",
			});

			vi.mocked(db.delete).mockClear();

			await handler(
				{
					tmdbId: 550,
					downloadProfileIds: [1],
					minimumAvailability: "released",
					monitorOption: "none",
					searchOnAdd: false,
				},
				vi.fn(),
				vi.fn(),
			);

			// No download profile inserts or collection profile deletes
			expect(db.delete).not.toHaveBeenCalled();
		});
	});

	// ─── populateCollectionCache (via refreshMovieInternal) ───────────────

	describe("populateCollectionCache (collection part year parsing)", () => {
		const baseTmdbResponse = {
			title: "Test Movie",
			overview: "Overview",
			status: "Released",
			release_date: "2024-01-01",
			runtime: 120,
			genres: [{ name: "Action" }],
			production_companies: [{ name: "Studio" }],
			poster_path: "/poster.jpg",
			backdrop_path: "/backdrop.jpg",
			imdb_id: "tt1234567",
		};

		it("populates collection cache with parts that have release dates", async () => {
			const responseWithCollection = {
				...baseTmdbResponse,
				belongs_to_collection: {
					id: 10,
					name: "Test Collection",
					poster_path: "/col.jpg",
					backdrop_path: "/colb.jpg",
				},
			};

			mocks.selectGet.mockReturnValueOnce({ id: 1, tmdbId: 100 });
			mocks.tmdbFetch.mockResolvedValueOnce(responseWithCollection);
			// Collection lookup: existing
			mocks.selectGet.mockReturnValueOnce({ id: 5 });
			// populateCollectionCache: parts with various release_date patterns
			mocks.tmdbFetch.mockResolvedValueOnce({
				parts: [
					{
						id: 1001,
						title: "Part One",
						overview: "First part",
						poster_path: "/p1.jpg",
						release_date: "2020-06-15",
					},
					{
						id: 1002,
						title: "Part Two",
						overview: "Second part",
						poster_path: null,
						release_date: null,
					},
					{
						id: 1003,
						title: "Part Three",
						overview: "Third part",
						poster_path: "/p3.jpg",
						release_date: "",
					},
					{
						id: 1004,
						title: "Part Four",
						overview: "Fourth part",
						poster_path: "/p4.jpg",
						release_date: "TBA-unknown",
					},
				],
			});

			const result = await refreshMovieInternal(1);

			expect(result).toEqual({ success: true });
			// tmdbFetch called for movie + collection
			expect(mocks.tmdbFetch).toHaveBeenCalledTimes(2);
		});
	});

	// ─── deleteMovieFn (additional edge cases) ────────────────────────────

	describe("deleteMovieFn (edge cases)", () => {
		it("continues when file deletion throws (file already missing)", async () => {
			const movie = {
				id: 1,
				title: "Movie With Missing File",
				tmdbId: 500,
				year: 2023,
				collectionId: null,
			};
			const files = [
				{ path: "/media/gone.mkv" },
				{ path: "/media/present.mkv" },
			];

			mocks.selectGet.mockReturnValueOnce(movie);
			mocks.selectAll.mockReturnValueOnce(files);
			// First unlink throws, second succeeds
			mocks.unlinkSync.mockImplementationOnce(() => {
				throw new Error("ENOENT");
			});
			mocks.unlinkSync.mockImplementationOnce(() => {});

			const result = await deleteMovieFn({
				data: { id: 1, deleteFiles: true, addImportExclusion: false },
			});

			expect(result).toEqual({ success: true });
			expect(mocks.unlinkSync).toHaveBeenCalledTimes(2);
		});

		it("does not delete collection when other movies remain", async () => {
			const movie = {
				id: 1,
				title: "Not The Last",
				tmdbId: 600,
				year: 2021,
				collectionId: 10,
			};

			mocks.selectGet.mockReturnValueOnce(movie);
			// remaining count > 0
			mocks.selectGet.mockReturnValueOnce({ count: 2 });

			const { db } = await import("src/db");
			vi.mocked(db.delete).mockClear();

			await deleteMovieFn({
				data: { id: 1, deleteFiles: false, addImportExclusion: false },
			});

			// delete called once for the movie, but not for the collection
			expect(db.delete).toHaveBeenCalledTimes(1);
		});

		it("combines addImportExclusion and deleteFiles", async () => {
			const movie = {
				id: 1,
				title: "Full Delete",
				tmdbId: 700,
				year: 2022,
				collectionId: null,
			};
			const files = [{ path: "/media/file.mkv" }];

			mocks.selectGet.mockReturnValueOnce(movie);
			mocks.selectAll.mockReturnValueOnce(files);

			const { db } = await import("src/db");

			await deleteMovieFn({
				data: { id: 1, deleteFiles: true, addImportExclusion: true },
			});

			expect(mocks.unlinkSync).toHaveBeenCalledWith("/media/file.mkv");
			// insert called for exclusion + history
			expect(db.insert).toHaveBeenCalled();
		});

		it("adds import exclusion with year as null when movie year is 0", async () => {
			const movie = {
				id: 1,
				title: "No Year Movie",
				tmdbId: 800,
				year: 0,
				collectionId: null,
			};

			mocks.selectGet.mockReturnValueOnce(movie);

			const { db } = await import("src/db");

			await deleteMovieFn({
				data: { id: 1, deleteFiles: false, addImportExclusion: true },
			});

			expect(db.insert).toHaveBeenCalled();
		});
	});

	// ─── updateMovieFn (additional edge cases) ────────────────────────────

	describe("updateMovieFn (edge cases)", () => {
		it("skips download profile sync when downloadProfileIds is undefined", async () => {
			const existingMovie = { id: 1, title: "Existing" };
			const updatedMovie = {
				id: 1,
				title: "Existing",
				minimumAvailability: "released",
			};

			mocks.selectGet.mockReturnValueOnce(existingMovie);
			mocks.selectGet.mockReturnValueOnce(updatedMovie);

			const { db } = await import("src/db");
			vi.mocked(db.delete).mockClear();

			const result = await updateMovieFn({
				data: { id: 1, minimumAvailability: "released" },
			});

			expect(result).toEqual(updatedMovie);
			// delete should NOT be called since downloadProfileIds is undefined
			expect(db.delete).not.toHaveBeenCalled();
		});

		it("throws when movie disappears after update", async () => {
			const existingMovie = { id: 1, title: "Existing" };

			mocks.selectGet.mockReturnValueOnce(existingMovie);
			// After update, movie not found
			mocks.selectGet.mockReturnValueOnce(undefined);

			await expect(
				updateMovieFn({ data: { id: 1, minimumAvailability: "released" } }),
			).rejects.toThrow("Movie 1 not found after update");
		});
	});

	// ─── refreshMovieInternal (additional edge cases) ─────────────────────

	describe("refreshMovieInternal (edge cases)", () => {
		it("handles movie with no release_date, no runtime, no imdb_id, no companies", async () => {
			const sparseResponse = {
				title: "Mystery Film",
				overview: "Unknown",
				status: "In Production",
				release_date: "",
				runtime: null,
				genres: [],
				production_companies: [],
				poster_path: null,
				backdrop_path: null,
				imdb_id: null,
				belongs_to_collection: null,
			};

			mocks.selectGet.mockReturnValueOnce({ id: 1, tmdbId: 999 });
			mocks.tmdbFetch.mockResolvedValueOnce(sparseResponse);

			const result = await refreshMovieInternal(1);

			expect(mocks.tmdbFetch).toHaveBeenCalledWith("/movie/999");
			expect(result).toEqual({ success: true });
		});
	});
});
