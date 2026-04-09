import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	requireAdmin: vi.fn(),
	requireAuth: vi.fn(),
	submitCommand: vi.fn(),
	tmdbFetch: vi.fn(),
	searchForShow: vi.fn(),
	logError: vi.fn(),
	unlinkSync: vi.fn(),
	select: vi.fn(),
	insert: vi.fn(),
	update: vi.fn(),
	deleteFn: vi.fn(),
	transaction: vi.fn(),
}));

vi.mock("@tanstack/react-start", () => ({
	createServerFn: () => ({
		handler: (handler: (...args: unknown[]) => unknown) => handler,
		inputValidator: () => ({
			handler: (handler: (...args: unknown[]) => unknown) => handler,
		}),
	}),
}));

vi.mock("drizzle-orm", () => ({
	and: vi.fn((...args: unknown[]) => ({ kind: "and", args })),
	asc: vi.fn((col: unknown) => ({ col, dir: "asc" })),
	desc: vi.fn((col: unknown) => ({ col, dir: "desc" })),
	eq: vi.fn((l: unknown, r: unknown) => ({ l, r })),
	inArray: vi.fn((col: unknown, vals: unknown) => ({ col, vals })),
	max: vi.fn((col: unknown) => ({ kind: "max", col })),
	sql: (...args: unknown[]) => ({ args }),
}));

vi.mock("node:fs", () => ({
	unlinkSync: (...args: unknown[]) => mocks.unlinkSync(...args),
}));

vi.mock("src/db", () => ({
	db: {
		select: (...args: unknown[]) => mocks.select(...args),
		insert: (...args: unknown[]) => mocks.insert(...args),
		update: (...args: unknown[]) => mocks.update(...args),
		delete: (...args: unknown[]) => mocks.deleteFn(...args),
		transaction: (fn: (tx: unknown) => unknown) => mocks.transaction(fn),
	},
}));

vi.mock("src/db/schema", () => ({
	episodeDownloadProfiles: {
		downloadProfileId: "episodeDownloadProfiles.downloadProfileId",
		episodeId: "episodeDownloadProfiles.episodeId",
	},
	episodeFiles: {
		episodeId: "episodeFiles.episodeId",
		path: "episodeFiles.path",
	},
	episodes: {
		absoluteNumber: "episodes.absoluteNumber",
		airDate: "episodes.airDate",
		episodeNumber: "episodes.episodeNumber",
		hasFile: "episodes.hasFile",
		id: "episodes.id",
		seasonId: "episodes.seasonId",
		showId: "episodes.showId",
		tmdbId: "episodes.tmdbId",
	},
	history: {
		eventType: "history.eventType",
		showId: "history.showId",
	},
	seasons: {
		id: "seasons.id",
		seasonNumber: "seasons.seasonNumber",
		showId: "seasons.showId",
	},
	showDownloadProfiles: {
		downloadProfileId: "showDownloadProfiles.downloadProfileId",
		showId: "showDownloadProfiles.showId",
	},
	shows: {
		createdAt: "shows.createdAt",
		episodeGroupId: "shows.episodeGroupId",
		fanartUrl: "shows.fanartUrl",
		genres: "shows.genres",
		id: "shows.id",
		imdbId: "shows.imdbId",
		monitorNewSeasons: "shows.monitorNewSeasons",
		network: "shows.network",
		overview: "shows.overview",
		path: "shows.path",
		posterUrl: "shows.posterUrl",
		runtime: "shows.runtime",
		seriesType: "shows.seriesType",
		sortTitle: "shows.sortTitle",
		status: "shows.status",
		tags: "shows.tags",
		title: "shows.title",
		tmdbId: "shows.tmdbId",
		updatedAt: "shows.updatedAt",
		useSeasonFolder: "shows.useSeasonFolder",
		year: "shows.year",
	},
}));

vi.mock("src/lib/tmdb-validators", () => ({
	addShowSchema: { parse: (d: unknown) => d },
	bulkMonitorEpisodeProfileSchema: { parse: (d: unknown) => d },
	bulkUnmonitorEpisodeProfileSchema: { parse: (d: unknown) => d },
	deleteShowSchema: { parse: (d: unknown) => d },
	monitorEpisodeProfileSchema: { parse: (d: unknown) => d },
	monitorShowProfileSchema: { parse: (d: unknown) => d },
	refreshShowSchema: { parse: (d: unknown) => d },
	unmonitorEpisodeProfileSchema: { parse: (d: unknown) => d },
	unmonitorShowProfileSchema: { parse: (d: unknown) => d },
	updateShowSchema: { parse: (d: unknown) => d },
}));

vi.mock("./auto-search", () => ({
	searchForShow: (...args: unknown[]) => mocks.searchForShow(...args),
}));

vi.mock("./commands", () => ({
	submitCommand: (...args: unknown[]) => mocks.submitCommand(...args),
}));

vi.mock("./logger", () => ({
	logError: (...args: unknown[]) => mocks.logError(...args),
}));

vi.mock("./middleware", () => ({
	requireAdmin: () => mocks.requireAdmin(),
	requireAuth: () => mocks.requireAuth(),
}));

vi.mock("./tmdb/client", () => ({
	tmdbFetch: (...args: unknown[]) => mocks.tmdbFetch(...args),
}));

vi.mock("./tmdb/types", () => ({
	TMDB_IMAGE_BASE: "https://image.tmdb.org/t/p",
}));

import {
	addShowFn,
	bulkMonitorEpisodeProfileFn,
	bulkUnmonitorEpisodeProfileFn,
	checkShowExistsFn,
	deleteShowFn,
	getShowDetailFn,
	getShowsFn,
	monitorEpisodeProfileFn,
	monitorShowProfileFn,
	refreshShowInternal,
	refreshShowMetadataFn,
	unmonitorEpisodeProfileFn,
	unmonitorShowProfileFn,
	updateShowFn,
} from "./shows";

// ── helpers ──────────────────────────────────────────────────────────────

type SelectResult = { all?: unknown; get?: unknown };

function createSelectChain(result: SelectResult) {
	const chain = {
		all: vi.fn(() => result.all),
		from: vi.fn(() => chain),
		get: vi.fn(() => result.get),
		groupBy: vi.fn(() => chain),
		leftJoin: vi.fn(() => chain),
		orderBy: vi.fn(() => chain),
		where: vi.fn(() => chain),
	};
	return chain;
}

function createInsertChain(opts?: { returning?: unknown }) {
	const chain = {
		get: vi.fn(() => opts?.returning),
		onConflictDoNothing: vi.fn(() => chain),
		returning: vi.fn(() => chain),
		run: vi.fn(),
		values: vi.fn(() => chain),
	};
	return chain;
}

function createUpdateChain() {
	const chain = {
		run: vi.fn(),
		set: vi.fn(() => chain),
		where: vi.fn(() => chain),
	};
	return chain;
}

function createDeleteChain() {
	const chain = {
		run: vi.fn(),
		where: vi.fn(() => chain),
	};
	return chain;
}

function queueSelectResults(results: SelectResult[]) {
	for (const result of results) {
		mocks.select.mockImplementationOnce(() => createSelectChain(result));
	}
}

// ── tests ────────────────────────────────────────────────────────────────

describe("server/shows", () => {
	beforeEach(() => {
		vi.resetAllMocks();
		mocks.requireAuth.mockResolvedValue(undefined);
		mocks.requireAdmin.mockResolvedValue(undefined);
	});

	// ── addShowFn ──────────────────────────────────────────────────────

	describe("addShowFn", () => {
		it("calls requireAdmin and submits a command", async () => {
			mocks.submitCommand.mockReturnValue({ commandId: 42 });

			const data = {
				tmdbId: 12345,
				downloadProfileIds: [1],
				monitorOption: "all",
				seriesType: "standard",
				useSeasonFolder: true,
				searchOnAdd: false,
				searchCutoffUnmet: false,
				episodeGroupId: null,
			};

			const result = await addShowFn({ data });

			expect(mocks.requireAdmin).toHaveBeenCalledTimes(1);
			expect(mocks.submitCommand).toHaveBeenCalledTimes(1);
			expect(mocks.submitCommand).toHaveBeenCalledWith(
				expect.objectContaining({
					commandType: "addShow",
					dedupeKey: "tmdbId",
				}),
			);
			expect(result).toEqual({ commandId: 42 });
		});
	});

	// ── getShowsFn ────────────────────────────────────────────────────

	describe("getShowsFn", () => {
		it("requires auth and returns shows with downloadProfileIds", async () => {
			const showRows = [
				{
					id: 1,
					title: "Show A",
					sortTitle: "Show A",
					overview: "Overview A",
					tmdbId: 100,
					imdbId: null,
					status: "continuing",
					seriesType: "standard",
					network: "HBO",
					year: 2024,
					runtime: 60,
					genres: ["Drama"],
					tags: [],
					posterUrl: "",
					fanartUrl: "",
					path: null,
					createdAt: "2024-01-01",
					updatedAt: "2024-01-01",
					seasonCount: 2,
					episodeCount: 10,
					episodeFileCount: 5,
				},
			];

			const profileLinks = [
				{ showId: 1, downloadProfileId: 10 },
				{ showId: 1, downloadProfileId: 20 },
			];

			queueSelectResults([{ all: showRows }, { all: profileLinks }]);

			const result = await getShowsFn();

			expect(mocks.requireAuth).toHaveBeenCalledTimes(1);
			expect(result).toEqual([
				{
					...showRows[0],
					downloadProfileIds: [10, 20],
				},
			]);
		});

		it("returns empty downloadProfileIds when show has no profiles", async () => {
			const showRows = [
				{
					id: 2,
					title: "Show B",
					sortTitle: "Show B",
					overview: null,
					tmdbId: 200,
					imdbId: null,
					status: "ended",
					seriesType: "standard",
					network: "NBC",
					year: 2020,
					runtime: 30,
					genres: [],
					tags: [],
					posterUrl: "",
					fanartUrl: "",
					path: null,
					createdAt: "2020-01-01",
					updatedAt: "2020-01-01",
					seasonCount: 1,
					episodeCount: 5,
					episodeFileCount: 0,
				},
			];

			queueSelectResults([{ all: showRows }, { all: [] }]);

			const result = await getShowsFn();

			expect(result).toEqual([
				{
					...showRows[0],
					downloadProfileIds: [],
				},
			]);
		});
	});

	// ── getShowDetailFn ───────────────────────────────────────────────

	describe("getShowDetailFn", () => {
		it("requires auth and returns show with seasons and episodes", async () => {
			const show = {
				id: 1,
				title: "Show A",
				tmdbId: 100,
				episodeGroupId: null,
			};

			const showSeasons = [{ id: 10, showId: 1, seasonNumber: 1 }];

			const showEpisodes = [
				{ id: 100, seasonId: 10, episodeNumber: 1 },
				{ id: 101, seasonId: 10, episodeNumber: 2 },
			];

			const episodeProfileLinks = [{ episodeId: 100, downloadProfileId: 5 }];

			const showProfileLinks = [{ downloadProfileId: 7 }];

			queueSelectResults([
				{ get: show },
				{ all: showSeasons },
				{ all: showEpisodes },
				{ all: episodeProfileLinks },
				{ all: showProfileLinks },
			]);

			const result = await getShowDetailFn({ data: { id: 1 } });

			expect(mocks.requireAuth).toHaveBeenCalledTimes(1);
			expect(result).toEqual({
				...show,
				downloadProfileIds: [7],
				seasons: [
					{
						...showSeasons[0],
						episodes: [
							{ ...showEpisodes[0], downloadProfileIds: [5] },
							{ ...showEpisodes[1], downloadProfileIds: [] },
						],
					},
				],
			});
		});

		it("throws when show is not found", async () => {
			queueSelectResults([{ get: undefined }]);

			await expect(getShowDetailFn({ data: { id: 999 } })).rejects.toThrow(
				"Show not found",
			);
		});

		it("returns empty episode profile links when no episodes exist", async () => {
			const show = { id: 2, title: "Empty Show", tmdbId: 200 };

			queueSelectResults([
				{ get: show },
				{ all: [] },
				{ all: [] },
				// When episodeIds.length === 0, the inArray query is skipped
				{ all: [] },
			]);

			const result = await getShowDetailFn({ data: { id: 2 } });

			expect(result).toEqual({
				...show,
				downloadProfileIds: [],
				seasons: [],
			});
		});
	});

	// ── updateShowFn ──────────────────────────────────────────────────

	describe("updateShowFn", () => {
		it("requires admin and updates show fields", async () => {
			const existingShow = {
				id: 1,
				title: "Show A",
				tmdbId: 100,
				seriesType: "standard",
				episodeGroupId: null,
			};

			const updatedShow = { ...existingShow, seriesType: "anime" };

			// 1. select show
			// 2. select show after update
			queueSelectResults([{ get: existingShow }, { get: updatedShow }]);

			const updateChain = createUpdateChain();
			mocks.update.mockReturnValue(updateChain);

			const result = await updateShowFn({
				data: {
					id: 1,
					useSeasonFolder: true,
					monitorNewSeasons: "all",
					seriesType: "standard",
				},
			});

			expect(mocks.requireAdmin).toHaveBeenCalledTimes(1);
			expect(mocks.update).toHaveBeenCalled();
			expect(result).toEqual(updatedShow);
		});

		it("throws when show is not found", async () => {
			queueSelectResults([{ get: undefined }]);

			await expect(updateShowFn({ data: { id: 999 } })).rejects.toThrow(
				"Show not found",
			);
		});

		it("updates download profiles when provided", async () => {
			const existingShow = {
				id: 1,
				title: "Show A",
				tmdbId: 100,
				seriesType: "standard",
				episodeGroupId: null,
			};

			// select show, then previousLinks, then showEpisodeIds, then select after update
			queueSelectResults([
				{ get: existingShow },
				{ all: [{ downloadProfileId: 10 }] },
				{ all: [{ id: 100 }, { id: 101 }] },
				{ get: existingShow },
			]);

			const updateChain = createUpdateChain();
			mocks.update.mockReturnValue(updateChain);

			const deleteChain = createDeleteChain();
			mocks.deleteFn.mockReturnValue(deleteChain);

			const insertChain = createInsertChain();
			mocks.insert.mockReturnValue(insertChain);

			await updateShowFn({
				data: {
					id: 1,
					downloadProfileIds: [20, 30],
				},
			});

			expect(mocks.requireAdmin).toHaveBeenCalledTimes(1);
			// delete old showDownloadProfiles, delete episodeDownloadProfiles for removed
			expect(mocks.deleteFn).toHaveBeenCalled();
			// insert new showDownloadProfiles
			expect(mocks.insert).toHaveBeenCalled();
		});
	});

	// ── deleteShowFn ──────────────────────────────────────────────────

	describe("deleteShowFn", () => {
		it("requires admin and deletes show", async () => {
			const show = { id: 1, title: "Doomed Show" };

			queueSelectResults([{ get: show }]);

			const deleteChain = createDeleteChain();
			mocks.deleteFn.mockReturnValue(deleteChain);

			const insertChain = createInsertChain();
			mocks.insert.mockReturnValue(insertChain);

			const result = await deleteShowFn({
				data: { id: 1, deleteFiles: false },
			});

			expect(mocks.requireAdmin).toHaveBeenCalledTimes(1);
			expect(mocks.deleteFn).toHaveBeenCalled();
			expect(result).toEqual({ success: true });
		});

		it("throws when show is not found", async () => {
			queueSelectResults([{ get: undefined }]);

			await expect(
				deleteShowFn({ data: { id: 999, deleteFiles: false } }),
			).rejects.toThrow("Show not found");
		});

		it("deletes episode files from disk when deleteFiles is true", async () => {
			const show = { id: 1, title: "Show With Files" };

			queueSelectResults([
				{ get: show },
				{ all: [{ id: 100 }, { id: 101 }] },
				{ all: [{ path: "/media/ep1.mkv" }, { path: "/media/ep2.mkv" }] },
			]);

			const deleteChain = createDeleteChain();
			mocks.deleteFn.mockReturnValue(deleteChain);

			const insertChain = createInsertChain();
			mocks.insert.mockReturnValue(insertChain);

			const result = await deleteShowFn({
				data: { id: 1, deleteFiles: true },
			});

			expect(mocks.unlinkSync).toHaveBeenCalledTimes(2);
			expect(mocks.unlinkSync).toHaveBeenCalledWith("/media/ep1.mkv");
			expect(mocks.unlinkSync).toHaveBeenCalledWith("/media/ep2.mkv");
			expect(result).toEqual({ success: true });
		});

		it("continues when file deletion fails", async () => {
			const show = { id: 1, title: "Show With Missing Files" };

			queueSelectResults([
				{ get: show },
				{ all: [{ id: 100 }] },
				{ all: [{ path: "/media/gone.mkv" }] },
			]);

			mocks.unlinkSync.mockImplementation(() => {
				throw new Error("ENOENT");
			});

			const deleteChain = createDeleteChain();
			mocks.deleteFn.mockReturnValue(deleteChain);

			const insertChain = createInsertChain();
			mocks.insert.mockReturnValue(insertChain);

			const result = await deleteShowFn({
				data: { id: 1, deleteFiles: true },
			});

			expect(mocks.unlinkSync).toHaveBeenCalledTimes(1);
			expect(result).toEqual({ success: true });
		});

		it("skips file deletion when no episodes exist", async () => {
			const show = { id: 1, title: "Empty Show" };

			queueSelectResults([{ get: show }, { all: [] }]);

			const deleteChain = createDeleteChain();
			mocks.deleteFn.mockReturnValue(deleteChain);

			const insertChain = createInsertChain();
			mocks.insert.mockReturnValue(insertChain);

			await deleteShowFn({ data: { id: 1, deleteFiles: true } });

			expect(mocks.unlinkSync).not.toHaveBeenCalled();
		});
	});

	// ── checkShowExistsFn ─────────────────────────────────────────────

	describe("checkShowExistsFn", () => {
		it("requires auth and returns show when it exists", async () => {
			const show = { id: 1, title: "Existing Show" };
			queueSelectResults([{ get: show }]);

			const result = await checkShowExistsFn({ data: { tmdbId: 100 } });

			expect(mocks.requireAuth).toHaveBeenCalledTimes(1);
			expect(result).toEqual(show);
		});

		it("returns null when show does not exist", async () => {
			queueSelectResults([{ get: undefined }]);

			const result = await checkShowExistsFn({ data: { tmdbId: 999 } });

			expect(result).toBeNull();
		});
	});

	// ── monitorEpisodeProfileFn ───────────────────────────────────────

	describe("monitorEpisodeProfileFn", () => {
		it("requires admin and inserts episode download profile", async () => {
			const insertChain = createInsertChain();
			mocks.insert.mockReturnValue(insertChain);

			const result = await monitorEpisodeProfileFn({
				data: { episodeId: 1, downloadProfileId: 5 },
			});

			expect(mocks.requireAdmin).toHaveBeenCalledTimes(1);
			expect(mocks.insert).toHaveBeenCalled();
			expect(insertChain.onConflictDoNothing).toHaveBeenCalled();
			expect(result).toEqual({ success: true });
		});
	});

	// ── unmonitorEpisodeProfileFn ─────────────────────────────────────

	describe("unmonitorEpisodeProfileFn", () => {
		it("requires admin and deletes episode download profile", async () => {
			const deleteChain = createDeleteChain();
			mocks.deleteFn.mockReturnValue(deleteChain);

			const result = await unmonitorEpisodeProfileFn({
				data: { episodeId: 1, downloadProfileId: 5, deleteFiles: false },
			});

			expect(mocks.requireAdmin).toHaveBeenCalledTimes(1);
			expect(mocks.deleteFn).toHaveBeenCalled();
			expect(result).toEqual({ success: true });
		});
	});

	// ── bulkMonitorEpisodeProfileFn ───────────────────────────────────

	describe("bulkMonitorEpisodeProfileFn", () => {
		it("requires admin and inserts profiles for each episode", async () => {
			const insertChain = createInsertChain();
			mocks.insert.mockReturnValue(insertChain);

			const result = await bulkMonitorEpisodeProfileFn({
				data: { episodeIds: [1, 2, 3], downloadProfileId: 5 },
			});

			expect(mocks.requireAdmin).toHaveBeenCalledTimes(1);
			expect(mocks.insert).toHaveBeenCalledTimes(3);
			expect(result).toEqual({ success: true });
		});
	});

	// ── bulkUnmonitorEpisodeProfileFn ─────────────────────────────────

	describe("bulkUnmonitorEpisodeProfileFn", () => {
		it("requires admin and deletes profiles for episodes", async () => {
			const deleteChain = createDeleteChain();
			mocks.deleteFn.mockReturnValue(deleteChain);

			const result = await bulkUnmonitorEpisodeProfileFn({
				data: { episodeIds: [1, 2], downloadProfileId: 5, deleteFiles: false },
			});

			expect(mocks.requireAdmin).toHaveBeenCalledTimes(1);
			expect(mocks.deleteFn).toHaveBeenCalled();
			expect(result).toEqual({ success: true });
		});

		it("skips delete when episodeIds is empty", async () => {
			const result = await bulkUnmonitorEpisodeProfileFn({
				data: { episodeIds: [], downloadProfileId: 5, deleteFiles: false },
			});

			expect(mocks.requireAdmin).toHaveBeenCalledTimes(1);
			expect(mocks.deleteFn).not.toHaveBeenCalled();
			expect(result).toEqual({ success: true });
		});
	});

	// ── monitorShowProfileFn ──────────────────────────────────────────

	describe("monitorShowProfileFn", () => {
		it("requires admin and inserts show download profile", async () => {
			const insertChain = createInsertChain();
			mocks.insert.mockReturnValue(insertChain);

			const result = await monitorShowProfileFn({
				data: { showId: 1, downloadProfileId: 5 },
			});

			expect(mocks.requireAdmin).toHaveBeenCalledTimes(1);
			expect(mocks.insert).toHaveBeenCalled();
			expect(insertChain.onConflictDoNothing).toHaveBeenCalled();
			expect(result).toEqual({ success: true });
		});
	});

	// ── unmonitorShowProfileFn ────────────────────────────────────────

	describe("unmonitorShowProfileFn", () => {
		it("requires admin and deletes show download profile", async () => {
			const deleteChain = createDeleteChain();
			mocks.deleteFn.mockReturnValue(deleteChain);

			const result = await unmonitorShowProfileFn({
				data: { showId: 1, downloadProfileId: 5 },
			});

			expect(mocks.requireAdmin).toHaveBeenCalledTimes(1);
			expect(mocks.deleteFn).toHaveBeenCalled();
			expect(result).toEqual({ success: true });
		});
	});

	// ── refreshShowInternal ───────────────────────────────────────────

	describe("refreshShowInternal", () => {
		it("throws when show is not found", async () => {
			queueSelectResults([{ get: undefined }]);

			await expect(refreshShowInternal(999)).rejects.toThrow("Show not found");
		});

		it("fetches TMDB data, updates show, and upserts episodes", async () => {
			const show = { id: 1, tmdbId: 100 };

			queueSelectResults([{ get: show }]);

			const tmdbShowDetail = {
				name: "Updated Show",
				overview: "Updated overview",
				status: "Returning Series",
				networks: [{ name: "HBO" }],
				first_air_date: "2024-01-15",
				episode_run_time: [60],
				genres: [{ name: "Drama" }],
				poster_path: "/poster.jpg",
				backdrop_path: "/backdrop.jpg",
				external_ids: { imdb_id: "tt1234567" },
				seasons: [
					{
						season_number: 1,
						overview: "Season 1",
						poster_path: "/s1.jpg",
					},
				],
			};

			const tmdbSeasonDetail = {
				episodes: [
					{
						episode_number: 1,
						name: "Pilot",
						overview: "First ep",
						air_date: "2024-01-15",
						runtime: 60,
						id: 5001,
					},
					{
						episode_number: 2,
						name: "Second",
						overview: "New episode",
						air_date: "2024-01-22",
						runtime: 55,
						id: 5002,
					},
				],
			};

			mocks.tmdbFetch
				.mockResolvedValueOnce(tmdbShowDetail)
				.mockResolvedValueOnce(tmdbSeasonDetail);

			const updateChain = createUpdateChain();
			mocks.update.mockReturnValue(updateChain);

			// existingSeason query
			const existingSeasonChain = createSelectChain({ get: { id: 10 } });
			mocks.select.mockImplementationOnce(() => existingSeasonChain);

			// existingEpisode for ep 1 (exists)
			const existingEp1Chain = createSelectChain({ get: { id: 100 } });
			mocks.select.mockImplementationOnce(() => existingEp1Chain);

			// existingEpisode for ep 2 (new)
			const existingEp2Chain = createSelectChain({ get: undefined });
			mocks.select.mockImplementationOnce(() => existingEp2Chain);

			const insertChain = createInsertChain();
			mocks.insert.mockReturnValue(insertChain);

			const result = await refreshShowInternal(1);

			expect(mocks.tmdbFetch).toHaveBeenCalledTimes(2);
			expect(mocks.tmdbFetch).toHaveBeenCalledWith("/tv/100", {
				append_to_response: "external_ids",
			});
			// update show metadata
			expect(mocks.update).toHaveBeenCalled();
			// 1 new episode
			expect(result).toEqual({ success: true, newEpisodes: 1 });
		});

		it("creates new season when it does not exist", async () => {
			const show = { id: 1, tmdbId: 100 };

			queueSelectResults([{ get: show }]);

			const tmdbShowDetail = {
				name: "Show",
				overview: "Overview",
				status: "Ended",
				networks: [],
				first_air_date: "2020-06-01",
				episode_run_time: [],
				genres: [],
				poster_path: null,
				backdrop_path: null,
				external_ids: {},
				seasons: [
					{
						season_number: 1,
						overview: null,
						poster_path: null,
					},
				],
			};

			const tmdbSeasonDetail = {
				episodes: [],
			};

			mocks.tmdbFetch
				.mockResolvedValueOnce(tmdbShowDetail)
				.mockResolvedValueOnce(tmdbSeasonDetail);

			const updateChain = createUpdateChain();
			mocks.update.mockReturnValue(updateChain);

			// existingSeason - not found
			const noSeasonChain = createSelectChain({ get: undefined });
			mocks.select.mockImplementationOnce(() => noSeasonChain);

			const insertChain = createInsertChain({ returning: { id: 20 } });
			mocks.insert.mockReturnValue(insertChain);

			const result = await refreshShowInternal(1);

			expect(mocks.insert).toHaveBeenCalled();
			expect(result).toEqual({ success: true, newEpisodes: 0 });
		});
	});

	// ── refreshShowInternal – additional branches ────────────────────

	describe("refreshShowInternal – additional branches", () => {
		it("maps all TMDB status values correctly", async () => {
			// Test each status branch via refreshShowInternal
			const statuses = [
				{ tmdb: "Returning Series", expected: "continuing" },
				{ tmdb: "Ended", expected: "ended" },
				{ tmdb: "Canceled", expected: "canceled" },
				{ tmdb: "In Production", expected: "upcoming" },
				{ tmdb: "Planned", expected: "upcoming" },
				{ tmdb: "SomeUnknownStatus", expected: "continuing" },
			];

			for (const { tmdb } of statuses) {
				vi.resetAllMocks();

				const show = { id: 1, tmdbId: 100 };
				queueSelectResults([{ get: show }]);

				mocks.tmdbFetch.mockResolvedValueOnce({
					name: "Show",
					overview: "",
					status: tmdb,
					networks: [],
					first_air_date: "",
					episode_run_time: [],
					genres: [],
					poster_path: null,
					backdrop_path: null,
					external_ids: {},
					seasons: [],
				});

				const updateChain = createUpdateChain();
				mocks.update.mockReturnValue(updateChain);

				await refreshShowInternal(1);

				expect(mocks.update).toHaveBeenCalled();
			}
		});

		it("handles null poster and backdrop paths (transformImagePath returns null)", async () => {
			const show = { id: 1, tmdbId: 100 };
			queueSelectResults([{ get: show }]);

			mocks.tmdbFetch.mockResolvedValueOnce({
				name: "No Images",
				overview: "",
				status: "Ended",
				networks: [],
				first_air_date: "",
				episode_run_time: [],
				genres: [],
				poster_path: null,
				backdrop_path: null,
				external_ids: {},
				seasons: [],
			});

			const updateChain = createUpdateChain();
			mocks.update.mockReturnValue(updateChain);

			const result = await refreshShowInternal(1);

			expect(updateChain.set).toHaveBeenCalledWith(
				expect.objectContaining({
					posterUrl: "",
					fanartUrl: "",
				}),
			);
			expect(result).toEqual({ success: true, newEpisodes: 0 });
		});

		it("handles non-null poster and backdrop paths (transformImagePath constructs URL)", async () => {
			const show = { id: 1, tmdbId: 100 };
			queueSelectResults([{ get: show }]);

			mocks.tmdbFetch.mockResolvedValueOnce({
				name: "Has Images",
				overview: "",
				status: "Ended",
				networks: [{ name: "HBO" }],
				first_air_date: "2024-05-10",
				episode_run_time: [45],
				genres: [{ name: "Comedy" }],
				poster_path: "/poster.jpg",
				backdrop_path: "/backdrop.jpg",
				external_ids: { imdb_id: "tt9999999" },
				seasons: [],
			});

			const updateChain = createUpdateChain();
			mocks.update.mockReturnValue(updateChain);

			await refreshShowInternal(1);

			expect(updateChain.set).toHaveBeenCalledWith(
				expect.objectContaining({
					posterUrl: "https://image.tmdb.org/t/p/w500/poster.jpg",
					fanartUrl: "https://image.tmdb.org/t/p/w1280/backdrop.jpg",
					network: "HBO",
					year: 2024,
					runtime: 45,
					genres: ["Comedy"],
					imdbId: "tt9999999",
				}),
			);
		});

		it("generates sort title stripping leading articles", async () => {
			const show = { id: 1, tmdbId: 100 };
			queueSelectResults([{ get: show }]);

			mocks.tmdbFetch.mockResolvedValueOnce({
				name: "The Great Show",
				overview: "",
				status: "Ended",
				networks: [],
				first_air_date: "",
				episode_run_time: [],
				genres: [],
				poster_path: null,
				backdrop_path: null,
				external_ids: {},
				seasons: [],
			});

			const updateChain = createUpdateChain();
			mocks.update.mockReturnValue(updateChain);

			await refreshShowInternal(1);

			expect(updateChain.set).toHaveBeenCalledWith(
				expect.objectContaining({
					sortTitle: "Great Show",
				}),
			);
		});

		it("updates existing episode metadata instead of inserting", async () => {
			const show = { id: 1, tmdbId: 100 };
			queueSelectResults([{ get: show }]);

			mocks.tmdbFetch
				.mockResolvedValueOnce({
					name: "Show",
					overview: "",
					status: "Ended",
					networks: [],
					first_air_date: "",
					episode_run_time: [],
					genres: [],
					poster_path: null,
					backdrop_path: null,
					external_ids: {},
					seasons: [
						{
							season_number: 1,
							overview: "S1",
							poster_path: null,
						},
					],
				})
				.mockResolvedValueOnce({
					episodes: [
						{
							episode_number: 1,
							name: "Updated Pilot",
							overview: "Updated overview",
							air_date: "2024-06-01",
							runtime: 50,
							id: 5001,
						},
					],
				});

			const updateChain = createUpdateChain();
			mocks.update.mockReturnValue(updateChain);

			// existingSeason - found
			mocks.select.mockImplementationOnce(() =>
				createSelectChain({ get: { id: 10 } }),
			);
			// existingEpisode - found (existing, should update)
			mocks.select.mockImplementationOnce(() =>
				createSelectChain({ get: { id: 100 } }),
			);

			const result = await refreshShowInternal(1);

			// update called for: show metadata, season update, episode update
			expect(mocks.update).toHaveBeenCalled();
			// No new episodes since the episode already exists
			expect(result).toEqual({ success: true, newEpisodes: 0 });
		});

		it("updates season metadata for existing season", async () => {
			const show = { id: 1, tmdbId: 100 };
			queueSelectResults([{ get: show }]);

			mocks.tmdbFetch
				.mockResolvedValueOnce({
					name: "Show",
					overview: "",
					status: "Ended",
					networks: [],
					first_air_date: "",
					episode_run_time: [],
					genres: [],
					poster_path: null,
					backdrop_path: null,
					external_ids: {},
					seasons: [
						{
							season_number: 1,
							overview: "Updated season overview",
							poster_path: "/season1.jpg",
						},
					],
				})
				.mockResolvedValueOnce({
					episodes: [],
				});

			const updateChain = createUpdateChain();
			mocks.update.mockReturnValue(updateChain);

			// existingSeason - found, should update its metadata
			mocks.select.mockImplementationOnce(() =>
				createSelectChain({ get: { id: 10 } }),
			);

			await refreshShowInternal(1);

			// Show update + season update = at least 2 update calls
			expect(mocks.update).toHaveBeenCalled();
			expect(updateChain.set).toHaveBeenCalledWith(
				expect.objectContaining({
					overview: "Updated season overview",
					posterUrl: "https://image.tmdb.org/t/p/w500/season1.jpg",
				}),
			);
		});
	});

	// ── updateShowFn – additional branches ────────────────────────────

	describe("updateShowFn – additional branches", () => {
		it("recomputes absolute numbers when seriesType changes and no episodeGroupId provided", async () => {
			const existingShow = {
				id: 1,
				title: "Anime Show",
				tmdbId: 100,
				seriesType: "standard",
				episodeGroupId: null,
			};

			// select show, then select show after update
			queueSelectResults([{ get: existingShow }, { get: existingShow }]);

			const updateChain = createUpdateChain();
			mocks.update.mockReturnValue(updateChain);

			// computeAbsoluteNumbers will: select show seriesType
			mocks.select.mockImplementationOnce(() =>
				createSelectChain({ get: { seriesType: "anime" } }),
			);
			// select non-special seasons
			mocks.select.mockImplementationOnce(() => createSelectChain({ all: [] }));

			await updateShowFn({
				data: {
					id: 1,
					seriesType: "anime",
				},
			});

			expect(mocks.requireAdmin).toHaveBeenCalledTimes(1);
			// show update + computeAbsoluteNumbers update calls
			expect(mocks.update).toHaveBeenCalled();
		});

		it("does not recompute absolute numbers when episodeGroupId is provided alongside seriesType change", async () => {
			const existingShow = {
				id: 1,
				title: "Show",
				tmdbId: 100,
				seriesType: "standard",
				episodeGroupId: null,
			};

			// 1. select show (line 835)
			// 2. switchEpisodeGroup -> select existingEpisodes (line 312)
			// 3. switchEpisodeGroup -> select newEpisodes (line 358)
			// 4. computeAbsoluteNumbers -> select show seriesType (line 197) - returns early
			// 5. final select show for return (line 924)
			queueSelectResults([{ get: existingShow }]);

			const updateChain = createUpdateChain();
			mocks.update.mockReturnValue(updateChain);

			// switchEpisodeGroup: select existingEpisodes
			mocks.select.mockImplementationOnce(() => createSelectChain({ all: [] }));

			mocks.tmdbFetch.mockResolvedValueOnce({
				groups: [],
			});

			// switchEpisodeGroup: select newEpisodes after re-import
			mocks.select.mockImplementationOnce(() => createSelectChain({ all: [] }));

			const deleteChain = createDeleteChain();
			mocks.deleteFn.mockReturnValue(deleteChain);

			// computeAbsoluteNumbers: select show (returns standard, early exit)
			mocks.select.mockImplementationOnce(() =>
				createSelectChain({ get: { seriesType: "standard" } }),
			);

			// final select show for return
			mocks.select.mockImplementationOnce(() =>
				createSelectChain({ get: existingShow }),
			);

			await updateShowFn({
				data: {
					id: 1,
					seriesType: "anime",
					episodeGroupId: "group-1",
				},
			});

			expect(mocks.requireAdmin).toHaveBeenCalledTimes(1);
			expect(mocks.tmdbFetch).toHaveBeenCalled();
		});

		it("handles download profile update with no removed profiles", async () => {
			const existingShow = {
				id: 1,
				title: "Show",
				tmdbId: 100,
				seriesType: "standard",
				episodeGroupId: null,
			};

			// select show, previousLinks (same as new), then select after update
			queueSelectResults([
				{ get: existingShow },
				{ all: [{ downloadProfileId: 10 }] },
				{ get: existingShow },
			]);

			const updateChain = createUpdateChain();
			mocks.update.mockReturnValue(updateChain);

			const deleteChain = createDeleteChain();
			mocks.deleteFn.mockReturnValue(deleteChain);

			const insertChain = createInsertChain();
			mocks.insert.mockReturnValue(insertChain);

			await updateShowFn({
				data: {
					id: 1,
					downloadProfileIds: [10],
				},
			});

			expect(mocks.requireAdmin).toHaveBeenCalledTimes(1);
			// delete showDownloadProfiles and re-insert
			expect(mocks.deleteFn).toHaveBeenCalled();
			expect(mocks.insert).toHaveBeenCalled();
		});

		it("handles cascade delete of episode profiles when episodes exist and profiles removed", async () => {
			const existingShow = {
				id: 1,
				title: "Show",
				tmdbId: 100,
				seriesType: "standard",
				episodeGroupId: null,
			};

			// select show, previousLinks, showEpisodeIds, select after update
			queueSelectResults([
				{ get: existingShow },
				{ all: [{ downloadProfileId: 10 }, { downloadProfileId: 20 }] },
				{ all: [{ id: 100 }, { id: 101 }] },
				{ get: existingShow },
			]);

			const updateChain = createUpdateChain();
			mocks.update.mockReturnValue(updateChain);

			const deleteChain = createDeleteChain();
			mocks.deleteFn.mockReturnValue(deleteChain);

			const insertChain = createInsertChain();
			mocks.insert.mockReturnValue(insertChain);

			await updateShowFn({
				data: {
					id: 1,
					downloadProfileIds: [20],
				},
			});

			expect(mocks.requireAdmin).toHaveBeenCalledTimes(1);
			// Should delete episodeDownloadProfiles for removed profile 10, delete showDownloadProfiles, insert new
			expect(mocks.deleteFn).toHaveBeenCalled();
		});

		it("handles cascade delete when removed profiles but no episodes exist", async () => {
			const existingShow = {
				id: 1,
				title: "Show",
				tmdbId: 100,
				seriesType: "standard",
				episodeGroupId: null,
			};

			// select show, previousLinks, showEpisodeIds (empty), select after update
			queueSelectResults([
				{ get: existingShow },
				{ all: [{ downloadProfileId: 10 }] },
				{ all: [] },
				{ get: existingShow },
			]);

			const updateChain = createUpdateChain();
			mocks.update.mockReturnValue(updateChain);

			const deleteChain = createDeleteChain();
			mocks.deleteFn.mockReturnValue(deleteChain);

			const insertChain = createInsertChain();
			mocks.insert.mockReturnValue(insertChain);

			await updateShowFn({
				data: {
					id: 1,
					downloadProfileIds: [20],
				},
			});

			expect(mocks.requireAdmin).toHaveBeenCalledTimes(1);
			// Should still delete showDownloadProfiles and insert new
			expect(mocks.deleteFn).toHaveBeenCalled();
			expect(mocks.insert).toHaveBeenCalled();
		});

		it("switches episode group when episodeGroupId changes to null (default seasons)", async () => {
			const existingShow = {
				id: 1,
				title: "Show",
				tmdbId: 100,
				seriesType: "standard",
				episodeGroupId: "old-group",
			};

			// 1. select show (line 835)
			queueSelectResults([{ get: existingShow }]);
			// 2. switchEpisodeGroup: select existingEpisodes (line 312)
			mocks.select.mockImplementationOnce(() => createSelectChain({ all: [] }));
			// 3. switchEpisodeGroup: select newEpisodes (line 358)
			mocks.select.mockImplementationOnce(() => createSelectChain({ all: [] }));
			// 4. computeAbsoluteNumbers: select show seriesType (line 197) - returns early
			mocks.select.mockImplementationOnce(() =>
				createSelectChain({ get: { seriesType: "standard" } }),
			);
			// 5. final select show (line 924)
			mocks.select.mockImplementationOnce(() =>
				createSelectChain({ get: existingShow }),
			);

			const updateChain = createUpdateChain();
			mocks.update.mockReturnValue(updateChain);

			const deleteChain = createDeleteChain();
			mocks.deleteFn.mockReturnValue(deleteChain);

			// importDefaultSeasons: tmdbFetch for show detail
			mocks.tmdbFetch.mockResolvedValueOnce({
				seasons: [],
				external_ids: {},
			});

			const insertChain = createInsertChain();
			mocks.insert.mockReturnValue(insertChain);

			await updateShowFn({
				data: {
					id: 1,
					episodeGroupId: null,
				},
			});

			expect(mocks.requireAdmin).toHaveBeenCalledTimes(1);
			// Should have called tmdbFetch for importDefaultSeasons
			expect(mocks.tmdbFetch).toHaveBeenCalled();
			// Should have deleted old seasons
			expect(mocks.deleteFn).toHaveBeenCalled();
		});

		it("skips episode group switch when episodeGroupId is unchanged", async () => {
			const existingShow = {
				id: 1,
				title: "Show",
				tmdbId: 100,
				seriesType: "standard",
				episodeGroupId: "same-group",
			};

			// select show, select after update
			queueSelectResults([{ get: existingShow }, { get: existingShow }]);

			const updateChain = createUpdateChain();
			mocks.update.mockReturnValue(updateChain);

			await updateShowFn({
				data: {
					id: 1,
					episodeGroupId: "same-group",
				},
			});

			expect(mocks.requireAdmin).toHaveBeenCalledTimes(1);
			// Should NOT call tmdbFetch since group didn't change
			expect(mocks.tmdbFetch).not.toHaveBeenCalled();
		});

		it("updates useSeasonFolder and monitorNewSeasons fields", async () => {
			const existingShow = {
				id: 1,
				title: "Show",
				tmdbId: 100,
				seriesType: "standard",
				episodeGroupId: null,
			};

			// select show, select after update
			queueSelectResults([{ get: existingShow }, { get: existingShow }]);

			const updateChain = createUpdateChain();
			mocks.update.mockReturnValue(updateChain);

			await updateShowFn({
				data: {
					id: 1,
					useSeasonFolder: false,
					monitorNewSeasons: "none",
				},
			});

			expect(mocks.requireAdmin).toHaveBeenCalledTimes(1);
			expect(updateChain.set).toHaveBeenCalledWith(
				expect.objectContaining({
					useSeasonFolder: 0,
					monitorNewSeasons: "none",
				}),
			);
		});
	});

	// ── addShowFn – handler branches ─────────────────────────────────

	describe("addShowFn – handler callback", () => {
		it("passes handler function to submitCommand that can be invoked", async () => {
			mocks.submitCommand.mockReturnValue({ commandId: 42 });

			const data = {
				tmdbId: 12345,
				downloadProfileIds: [1],
				monitorOption: "all",
				seriesType: "standard",
				useSeasonFolder: true,
				searchOnAdd: false,
				searchCutoffUnmet: false,
				episodeGroupId: null,
			};

			await addShowFn({ data });

			// Verify the handler was passed as part of the command
			const callArgs = mocks.submitCommand.mock.calls[0][0];
			expect(callArgs.handler).toBeDefined();
			expect(typeof callArgs.handler).toBe("function");
		});

		it("handler adds show with default seasons when no episode group", async () => {
			// Capture the handler from submitCommand
			let capturedHandler!: (...args: unknown[]) => unknown;
			mocks.submitCommand.mockImplementation(
				(opts: { handler: (...args: unknown[]) => unknown }) => {
					capturedHandler = opts.handler;
					return { commandId: 1 };
				},
			);

			const data = {
				tmdbId: 555,
				downloadProfileIds: [1, 2],
				monitorOption: "none" as const,
				seriesType: "standard",
				useSeasonFolder: false,
				searchOnAdd: false,
				searchCutoffUnmet: false,
				episodeGroupId: null,
			};

			await addShowFn({ data });

			// Now invoke the captured handler
			const updateProgress = vi.fn();
			const setTitle = vi.fn();

			// Show doesn't exist yet
			mocks.select.mockImplementationOnce(() =>
				createSelectChain({ get: undefined }),
			);

			// tmdbFetch for show detail
			mocks.tmdbFetch.mockResolvedValueOnce({
				name: "New Show",
				overview: "A new show",
				status: "Returning Series",
				networks: [{ name: "HBO" }],
				first_air_date: "2025-01-01",
				episode_run_time: [60],
				genres: [{ name: "Drama" }],
				poster_path: "/poster.jpg",
				backdrop_path: "/backdrop.jpg",
				external_ids: { imdb_id: "tt1111111" },
				seasons: [
					{
						season_number: 1,
						overview: "Season 1",
						poster_path: "/s1.jpg",
					},
				],
			});

			// tmdbFetch for season detail
			mocks.tmdbFetch.mockResolvedValueOnce({
				episodes: [
					{
						episode_number: 1,
						name: "Pilot",
						overview: "First ep",
						air_date: "2025-01-01",
						runtime: 60,
						id: 9001,
					},
				],
			});

			// Transaction mock
			mocks.transaction.mockImplementation((fn: (tx: unknown) => unknown) => {
				const tx = {
					insert: () => {
						const chain = {
							get: vi.fn(() => ({
								id: 1,
								title: "New Show",
							})),
							onConflictDoNothing: vi.fn(() => chain),
							returning: vi.fn(() => chain),
							run: vi.fn(),
							values: vi.fn(() => chain),
						};
						return chain;
					},
					update: () => {
						const chain = {
							run: vi.fn(),
							set: vi.fn(() => chain),
							where: vi.fn(() => chain),
						};
						return chain;
					},
				};
				return fn(tx);
			});

			// applyMonitoringOption: select allEpisodes (for "none" option, no episodes to monitor)
			mocks.select.mockImplementationOnce(() => createSelectChain({ all: [] }));

			// computeAbsoluteNumbers: select show seriesType (standard, returns early)
			mocks.select.mockImplementationOnce(() =>
				createSelectChain({ get: { seriesType: "standard" } }),
			);

			const result = await capturedHandler(data, updateProgress, setTitle);

			expect(setTitle).toHaveBeenCalledWith("New Show");
			expect(updateProgress).toHaveBeenCalled();
			expect(result).toEqual(
				expect.objectContaining({
					showId: 1,
					title: "New Show",
					seasonCount: 1,
				}),
			);
		});

		it("handler throws when show already exists", async () => {
			let capturedHandler!: (...args: unknown[]) => unknown;
			mocks.submitCommand.mockImplementation(
				(opts: { handler: (...args: unknown[]) => unknown }) => {
					capturedHandler = opts.handler;
					return { commandId: 1 };
				},
			);

			await addShowFn({
				data: {
					tmdbId: 999,
					downloadProfileIds: [],
					monitorOption: "none",
					seriesType: "standard",
					useSeasonFolder: true,
					searchOnAdd: false,
					searchCutoffUnmet: false,
					episodeGroupId: null,
				},
			});

			// Show already exists
			mocks.select.mockImplementationOnce(() =>
				createSelectChain({ get: { id: 1 } }),
			);

			await expect(
				capturedHandler({ tmdbId: 999 }, vi.fn(), vi.fn()),
			).rejects.toThrow("Show already exists");
		});

		it("handler adds show with episode group", async () => {
			let capturedHandler!: (...args: unknown[]) => unknown;
			mocks.submitCommand.mockImplementation(
				(opts: { handler: (...args: unknown[]) => unknown }) => {
					capturedHandler = opts.handler;
					return { commandId: 1 };
				},
			);

			const data = {
				tmdbId: 777,
				downloadProfileIds: [1],
				monitorOption: "none" as const,
				seriesType: "anime",
				useSeasonFolder: true,
				searchOnAdd: false,
				searchCutoffUnmet: false,
				episodeGroupId: "grp-1",
			};

			await addShowFn({ data });

			const updateProgress = vi.fn();
			const setTitle = vi.fn();

			// Show doesn't exist
			mocks.select.mockImplementationOnce(() =>
				createSelectChain({ get: undefined }),
			);

			// tmdbFetch for show detail
			mocks.tmdbFetch.mockResolvedValueOnce({
				name: "Anime Show",
				overview: "Anime overview",
				status: "Returning Series",
				networks: [],
				first_air_date: "2024-04-01",
				episode_run_time: [24],
				genres: [{ name: "Animation" }],
				poster_path: null,
				backdrop_path: null,
				external_ids: {},
				seasons: [],
			});

			// tmdbFetch for episode group
			mocks.tmdbFetch.mockResolvedValueOnce({
				groups: [
					{
						order: 1,
						episodes: [
							{
								order: 0,
								name: "Ep 1",
								overview: "",
								air_date: "2024-04-01",
								runtime: 24,
								id: 8001,
							},
						],
					},
				],
			});

			mocks.transaction.mockImplementation((fn: (tx: unknown) => unknown) => {
				const tx = {
					insert: () => {
						const chain = {
							get: vi.fn(() => ({
								id: 1,
								title: "Anime Show",
							})),
							onConflictDoNothing: vi.fn(() => chain),
							returning: vi.fn(() => chain),
							run: vi.fn(),
							values: vi.fn(() => chain),
						};
						return chain;
					},
					update: () => {
						const chain = {
							run: vi.fn(),
							set: vi.fn(() => chain),
							where: vi.fn(() => chain),
						};
						return chain;
					},
				};
				return fn(tx);
			});

			// applyMonitoringOption: select allEpisodes (for "none", no work)
			mocks.select.mockImplementationOnce(() => createSelectChain({ all: [] }));

			// computeAbsoluteNumbers: select show seriesType
			mocks.select.mockImplementationOnce(() =>
				createSelectChain({ get: { seriesType: "anime" } }),
			);
			// computeAbsoluteNumbers: select non-special seasons
			mocks.select.mockImplementationOnce(() =>
				createSelectChain({
					all: [{ id: 1, seasonNumber: 1 }],
				}),
			);
			// computeAbsoluteNumbers: select episodes for season
			mocks.select.mockImplementationOnce(() =>
				createSelectChain({
					all: [{ id: 100, episodeNumber: 1 }],
				}),
			);

			const updateChain = createUpdateChain();
			mocks.update.mockReturnValue(updateChain);

			const result = await capturedHandler(data, updateProgress, setTitle);

			expect(setTitle).toHaveBeenCalledWith("Anime Show");
			expect(result).toEqual(
				expect.objectContaining({
					showId: 1,
					title: "Anime Show",
				}),
			);
		});

		it("handler triggers search when searchOnAdd is true", async () => {
			let capturedHandler!: (...args: unknown[]) => unknown;
			mocks.submitCommand.mockImplementation(
				(opts: { handler: (...args: unknown[]) => unknown }) => {
					capturedHandler = opts.handler;
					return { commandId: 1 };
				},
			);

			const data = {
				tmdbId: 888,
				downloadProfileIds: [1],
				monitorOption: "all" as const,
				seriesType: "standard",
				useSeasonFolder: true,
				searchOnAdd: true,
				searchCutoffUnmet: false,
				episodeGroupId: null,
			};

			await addShowFn({ data });

			// Show doesn't exist
			mocks.select.mockImplementationOnce(() =>
				createSelectChain({ get: undefined }),
			);

			// tmdbFetch for show detail
			mocks.tmdbFetch.mockResolvedValueOnce({
				name: "Searchable Show",
				overview: "",
				status: "Ended",
				networks: [],
				first_air_date: "2023-01-01",
				episode_run_time: [],
				genres: [],
				poster_path: null,
				backdrop_path: null,
				external_ids: {},
				seasons: [],
			});

			mocks.transaction.mockImplementation((fn: (tx: unknown) => unknown) => {
				const tx = {
					insert: () => {
						const chain = {
							get: vi.fn(() => ({
								id: 1,
								title: "Searchable Show",
							})),
							onConflictDoNothing: vi.fn(() => chain),
							returning: vi.fn(() => chain),
							run: vi.fn(),
							values: vi.fn(() => chain),
						};
						return chain;
					},
					update: () => {
						const chain = {
							run: vi.fn(),
							set: vi.fn(() => chain),
							where: vi.fn(() => chain),
						};
						return chain;
					},
				};
				return fn(tx);
			});

			// applyMonitoringOption: select allEpisodes
			mocks.select.mockImplementationOnce(() => createSelectChain({ all: [] }));

			// computeAbsoluteNumbers: select show (standard, returns early)
			mocks.select.mockImplementationOnce(() =>
				createSelectChain({ get: { seriesType: "standard" } }),
			);

			mocks.searchForShow.mockResolvedValue(undefined);

			await capturedHandler(data, vi.fn(), vi.fn());

			expect(mocks.searchForShow).toHaveBeenCalledWith(1, false);
		});
	});

	// ── computeAbsoluteNumbers – via updateShowFn ────────────────────

	describe("computeAbsoluteNumbers – via updateShowFn", () => {
		it("computes absolute numbers for single-season anime (episode number = absolute)", async () => {
			const existingShow = {
				id: 1,
				title: "One Season Anime",
				tmdbId: 100,
				seriesType: "standard",
				episodeGroupId: null,
			};

			// 1. select show
			queueSelectResults([{ get: existingShow }]);

			const updateChain = createUpdateChain();
			mocks.update.mockReturnValue(updateChain);

			// 2. computeAbsoluteNumbers: select show seriesType
			mocks.select.mockImplementationOnce(() =>
				createSelectChain({ get: { seriesType: "anime" } }),
			);
			// 3. computeAbsoluteNumbers: select non-special seasons (1 season)
			mocks.select.mockImplementationOnce(() =>
				createSelectChain({
					all: [{ id: 10, seasonNumber: 1 }],
				}),
			);
			// 4. computeAbsoluteNumbers: select episodes for season 1
			mocks.select.mockImplementationOnce(() =>
				createSelectChain({
					all: [
						{ id: 100, episodeNumber: 1 },
						{ id: 101, episodeNumber: 2 },
					],
				}),
			);
			// 5. final select show
			mocks.select.mockImplementationOnce(() =>
				createSelectChain({ get: existingShow }),
			);

			await updateShowFn({
				data: {
					id: 1,
					seriesType: "anime",
				},
			});

			// Should call update for show + 2 episodes (absoluteNumber set)
			expect(mocks.update).toHaveBeenCalled();
		});

		it("computes cumulative absolute numbers for multi-season anime with reset numbering", async () => {
			const existingShow = {
				id: 1,
				title: "Multi Season Anime",
				tmdbId: 100,
				seriesType: "standard",
				episodeGroupId: null,
			};

			// 1. select show
			queueSelectResults([{ get: existingShow }]);

			const updateChain = createUpdateChain();
			mocks.update.mockReturnValue(updateChain);

			// 2. computeAbsoluteNumbers: select show seriesType
			mocks.select.mockImplementationOnce(() =>
				createSelectChain({ get: { seriesType: "anime" } }),
			);
			// 3. computeAbsoluteNumbers: select non-special seasons (2 seasons)
			mocks.select.mockImplementationOnce(() =>
				createSelectChain({
					all: [
						{ id: 10, seasonNumber: 1 },
						{ id: 20, seasonNumber: 2 },
					],
				}),
			);
			// 4. select episodes for season 1
			mocks.select.mockImplementationOnce(() =>
				createSelectChain({
					all: [
						{ id: 100, episodeNumber: 1 },
						{ id: 101, episodeNumber: 2 },
					],
				}),
			);
			// 5. select episodes for season 2 (reset numbering: starts at 1)
			mocks.select.mockImplementationOnce(() =>
				createSelectChain({
					all: [
						{ id: 200, episodeNumber: 1 },
						{ id: 201, episodeNumber: 2 },
					],
				}),
			);
			// 6. final select show
			mocks.select.mockImplementationOnce(() =>
				createSelectChain({ get: existingShow }),
			);

			await updateShowFn({
				data: {
					id: 1,
					seriesType: "anime",
				},
			});

			// Should update 4 episodes with cumulative absolute numbers
			expect(mocks.update).toHaveBeenCalled();
		});

		it("computes absolute numbers for continuous numbering anime", async () => {
			const existingShow = {
				id: 1,
				title: "Continuous Anime",
				tmdbId: 100,
				seriesType: "standard",
				episodeGroupId: null,
			};

			// 1. select show
			queueSelectResults([{ get: existingShow }]);

			const updateChain = createUpdateChain();
			mocks.update.mockReturnValue(updateChain);

			// 2. computeAbsoluteNumbers: select show seriesType
			mocks.select.mockImplementationOnce(() =>
				createSelectChain({ get: { seriesType: "anime" } }),
			);
			// 3. computeAbsoluteNumbers: select non-special seasons (2 seasons)
			mocks.select.mockImplementationOnce(() =>
				createSelectChain({
					all: [
						{ id: 10, seasonNumber: 1 },
						{ id: 20, seasonNumber: 2 },
					],
				}),
			);
			// 4. select episodes for season 1
			mocks.select.mockImplementationOnce(() =>
				createSelectChain({
					all: [
						{ id: 100, episodeNumber: 1 },
						{ id: 101, episodeNumber: 12 },
					],
				}),
			);
			// 5. select episodes for season 2 (continuous: starts > 1, e.g., 13)
			mocks.select.mockImplementationOnce(() =>
				createSelectChain({
					all: [
						{ id: 200, episodeNumber: 13 },
						{ id: 201, episodeNumber: 24 },
					],
				}),
			);
			// 6. final select show
			mocks.select.mockImplementationOnce(() =>
				createSelectChain({ get: existingShow }),
			);

			await updateShowFn({
				data: {
					id: 1,
					seriesType: "anime",
				},
			});

			// Continuous numbering: episode number IS the absolute number
			expect(mocks.update).toHaveBeenCalled();
		});

		it("skips computation for non-anime shows", async () => {
			const existingShow = {
				id: 1,
				title: "Standard Show",
				tmdbId: 100,
				seriesType: "anime",
				episodeGroupId: null,
			};

			// 1. select show
			queueSelectResults([{ get: existingShow }]);

			const updateChain = createUpdateChain();
			mocks.update.mockReturnValue(updateChain);

			// 2. computeAbsoluteNumbers: select show seriesType (standard, returns early)
			mocks.select.mockImplementationOnce(() =>
				createSelectChain({ get: { seriesType: "standard" } }),
			);
			// 3. final select show
			mocks.select.mockImplementationOnce(() =>
				createSelectChain({ get: existingShow }),
			);

			await updateShowFn({
				data: {
					id: 1,
					seriesType: "standard",
				},
			});

			expect(mocks.update).toHaveBeenCalled();
		});

		it("returns early when anime has no non-special seasons", async () => {
			const existingShow = {
				id: 1,
				title: "Specials Only",
				tmdbId: 100,
				seriesType: "standard",
				episodeGroupId: null,
			};

			// 1. select show
			queueSelectResults([{ get: existingShow }]);

			const updateChain = createUpdateChain();
			mocks.update.mockReturnValue(updateChain);

			// 2. computeAbsoluteNumbers: select show seriesType
			mocks.select.mockImplementationOnce(() =>
				createSelectChain({ get: { seriesType: "anime" } }),
			);
			// 3. select non-special seasons (empty)
			mocks.select.mockImplementationOnce(() => createSelectChain({ all: [] }));
			// 4. final select show
			mocks.select.mockImplementationOnce(() =>
				createSelectChain({ get: existingShow }),
			);

			await updateShowFn({
				data: {
					id: 1,
					seriesType: "anime",
				},
			});

			expect(mocks.update).toHaveBeenCalled();
		});
	});

	// ── refreshShowMetadataFn ─────────────────────────────────────────

	describe("refreshShowMetadataFn", () => {
		it("requires admin and delegates to refreshShowInternal", async () => {
			const show = { id: 1, tmdbId: 100 };
			queueSelectResults([{ get: show }]);

			const tmdbShowDetail = {
				name: "Show",
				overview: "",
				status: "Ended",
				networks: [],
				first_air_date: "",
				episode_run_time: [],
				genres: [],
				poster_path: null,
				backdrop_path: null,
				external_ids: {},
				seasons: [],
			};

			mocks.tmdbFetch.mockResolvedValueOnce(tmdbShowDetail);

			const updateChain = createUpdateChain();
			mocks.update.mockReturnValue(updateChain);

			const result = await refreshShowMetadataFn({
				data: { showId: 1 },
			});

			expect(mocks.requireAdmin).toHaveBeenCalledTimes(1);
			expect(result).toEqual({ success: true, newEpisodes: 0 });
		});
	});

	// ── refreshShowInternal – multiple seasons ───────────────────────

	describe("refreshShowInternal – multiple seasons", () => {
		it("handles multiple seasons with mixed new and existing episodes", async () => {
			const show = { id: 1, tmdbId: 100 };
			queueSelectResults([{ get: show }]);

			mocks.tmdbFetch
				.mockResolvedValueOnce({
					name: "Multi Season Show",
					overview: "Overview",
					status: "Returning Series",
					networks: [{ name: "Netflix" }],
					first_air_date: "2023-03-15",
					episode_run_time: [30],
					genres: [{ name: "Comedy" }, { name: "Drama" }],
					poster_path: "/multi.jpg",
					backdrop_path: "/multi-bg.jpg",
					external_ids: { imdb_id: "tt0000001" },
					seasons: [
						{
							season_number: 1,
							overview: "S1",
							poster_path: "/s1.jpg",
						},
						{
							season_number: 2,
							overview: "S2",
							poster_path: null,
						},
					],
				})
				// Season 1 detail
				.mockResolvedValueOnce({
					episodes: [
						{
							episode_number: 1,
							name: "Existing Ep",
							overview: "",
							air_date: "2023-03-15",
							runtime: 30,
							id: 5001,
						},
					],
				})
				// Season 2 detail
				.mockResolvedValueOnce({
					episodes: [
						{
							episode_number: 1,
							name: "New S2E1",
							overview: "Brand new",
							air_date: "2024-03-15",
							runtime: 35,
							id: 6001,
						},
					],
				});

			const updateChain = createUpdateChain();
			mocks.update.mockReturnValue(updateChain);

			const insertChain = createInsertChain({ returning: { id: 20 } });
			mocks.insert.mockReturnValue(insertChain);

			// Season 1: existing
			mocks.select.mockImplementationOnce(() =>
				createSelectChain({ get: { id: 10 } }),
			);
			// S1E1: existing episode
			mocks.select.mockImplementationOnce(() =>
				createSelectChain({ get: { id: 100 } }),
			);
			// Season 2: new
			mocks.select.mockImplementationOnce(() =>
				createSelectChain({ get: undefined }),
			);
			// S2E1: new episode
			mocks.select.mockImplementationOnce(() =>
				createSelectChain({ get: undefined }),
			);

			const result = await refreshShowInternal(1);

			// 3 tmdbFetch calls: show detail + 2 season details
			expect(mocks.tmdbFetch).toHaveBeenCalledTimes(3);
			// 1 new episode (S2E1)
			expect(result).toEqual({ success: true, newEpisodes: 1 });
		});
	});

	// ── getShowsFn – edge cases ──────────────────────────────────────

	describe("getShowsFn – edge cases", () => {
		it("returns empty array when no shows exist", async () => {
			queueSelectResults([{ all: [] }, { all: [] }]);

			const result = await getShowsFn();

			expect(mocks.requireAuth).toHaveBeenCalledTimes(1);
			expect(result).toEqual([]);
		});

		it("maps profiles correctly across multiple shows", async () => {
			const showRows = [
				{
					id: 1,
					title: "Show A",
					sortTitle: "Show A",
					overview: null,
					tmdbId: 100,
					imdbId: null,
					status: "continuing",
					seriesType: "standard",
					network: "HBO",
					year: 2024,
					runtime: 60,
					genres: [],
					tags: [],
					posterUrl: "",
					fanartUrl: "",
					path: null,
					createdAt: "2024-01-01",
					updatedAt: "2024-01-01",
					seasonCount: 1,
					episodeCount: 5,
					episodeFileCount: 2,
				},
				{
					id: 2,
					title: "Show B",
					sortTitle: "Show B",
					overview: null,
					tmdbId: 200,
					imdbId: null,
					status: "ended",
					seriesType: "standard",
					network: "NBC",
					year: 2020,
					runtime: 30,
					genres: [],
					tags: [],
					posterUrl: "",
					fanartUrl: "",
					path: null,
					createdAt: "2020-01-01",
					updatedAt: "2020-01-01",
					seasonCount: 2,
					episodeCount: 10,
					episodeFileCount: 0,
				},
			];

			const profileLinks = [
				{ showId: 1, downloadProfileId: 10 },
				{ showId: 2, downloadProfileId: 20 },
				{ showId: 2, downloadProfileId: 30 },
			];

			queueSelectResults([{ all: showRows }, { all: profileLinks }]);

			const result = await getShowsFn();

			expect(result).toEqual([
				{ ...showRows[0], downloadProfileIds: [10] },
				{ ...showRows[1], downloadProfileIds: [20, 30] },
			]);
		});
	});

	// ── getShowDetailFn – additional branches ─────────────────────────

	describe("getShowDetailFn – additional branches", () => {
		it("groups episodes under correct seasons with multiple seasons", async () => {
			const show = {
				id: 1,
				title: "Multi Season",
				tmdbId: 100,
				episodeGroupId: null,
			};

			const showSeasons = [
				{ id: 10, showId: 1, seasonNumber: 1 },
				{ id: 20, showId: 1, seasonNumber: 2 },
			];

			const showEpisodes = [
				{ id: 100, seasonId: 10, episodeNumber: 1 },
				{ id: 101, seasonId: 10, episodeNumber: 2 },
				{ id: 200, seasonId: 20, episodeNumber: 1 },
			];

			const episodeProfileLinks = [
				{ episodeId: 100, downloadProfileId: 5 },
				{ episodeId: 200, downloadProfileId: 5 },
				{ episodeId: 200, downloadProfileId: 6 },
			];

			const showProfileLinks = [{ downloadProfileId: 7 }];

			queueSelectResults([
				{ get: show },
				{ all: showSeasons },
				{ all: showEpisodes },
				{ all: episodeProfileLinks },
				{ all: showProfileLinks },
			]);

			const result = await getShowDetailFn({ data: { id: 1 } });

			expect(result.seasons).toHaveLength(2);
			expect(result.seasons[0].episodes).toHaveLength(2);
			expect(result.seasons[1].episodes).toHaveLength(1);
			expect(result.seasons[1].episodes[0].downloadProfileIds).toEqual([5, 6]);
		});
	});

	// ── applyMonitoringOption – via addShowHandler ────────────────────

	describe("applyMonitoringOption – via addShowHandler", () => {
		function setupAddShowHandler() {
			let capturedHandler!: (...args: unknown[]) => unknown;
			mocks.submitCommand.mockImplementation(
				(opts: { handler: (...args: unknown[]) => unknown }) => {
					capturedHandler = opts.handler;
					return { commandId: 1 };
				},
			);

			const baseTmdbResponse = {
				name: "Test Show",
				overview: "",
				status: "Ended",
				networks: [],
				first_air_date: "2024-01-01",
				episode_run_time: [],
				genres: [],
				poster_path: null,
				backdrop_path: null,
				external_ids: {},
				seasons: [],
			};

			const txMock = {
				insert: () => {
					const chain = {
						get: vi.fn(() => ({ id: 1, title: "Test Show" })),
						onConflictDoNothing: vi.fn(() => chain),
						returning: vi.fn(() => chain),
						run: vi.fn(),
						values: vi.fn(() => chain),
					};
					return chain;
				},
				update: () => {
					const chain = {
						run: vi.fn(),
						set: vi.fn(() => chain),
						where: vi.fn(() => chain),
					};
					return chain;
				},
			};

			return {
				getHandler: () => capturedHandler,
				baseTmdbResponse,
				txMock,
			};
		}

		async function runHandlerWithMonitorOption(
			monitorOption: string,
			episodeRows: unknown[],
			seasonSelectResults: unknown[] = [],
		) {
			const { getHandler, baseTmdbResponse, txMock } = setupAddShowHandler();

			const data = {
				tmdbId: 100,
				downloadProfileIds: [1],
				monitorOption,
				seriesType: "standard",
				useSeasonFolder: true,
				searchOnAdd: false,
				searchCutoffUnmet: false,
				episodeGroupId: null,
			};

			await addShowFn({ data });
			const handler = getHandler();

			// Show doesn't exist
			mocks.select.mockImplementationOnce(() =>
				createSelectChain({ get: undefined }),
			);

			mocks.tmdbFetch.mockResolvedValueOnce(baseTmdbResponse);
			mocks.transaction.mockImplementation((fn: (tx: unknown) => unknown) =>
				fn(txMock),
			);

			// applyMonitoringOption: select allEpisodes
			mocks.select.mockImplementationOnce(() =>
				createSelectChain({ all: episodeRows }),
			);

			// Additional selects for options that need season queries
			for (const result of seasonSelectResults) {
				mocks.select.mockImplementationOnce(() =>
					createSelectChain(result as SelectResult),
				);
			}

			const insertChain = createInsertChain();
			mocks.insert.mockReturnValue(insertChain);

			// computeAbsoluteNumbers: select show seriesType (standard, returns early)
			mocks.select.mockImplementationOnce(() =>
				createSelectChain({ get: { seriesType: "standard" } }),
			);

			const updateChain = createUpdateChain();
			mocks.update.mockReturnValue(updateChain);

			await handler(data, vi.fn(), vi.fn());
		}

		it("monitors all episodes with 'all' option", async () => {
			const episodes = [
				{
					id: 1,
					seasonId: 10,
					episodeNumber: 1,
					airDate: "2024-01-01",
					hasFile: false,
				},
				{
					id: 2,
					seasonId: 10,
					episodeNumber: 2,
					airDate: "2024-01-08",
					hasFile: true,
				},
			];

			await runHandlerWithMonitorOption("all", episodes);

			// Should insert episodeDownloadProfiles for all 2 episodes
			expect(mocks.insert).toHaveBeenCalled();
		});

		it("monitors future episodes with 'future' option", async () => {
			const episodes = [
				{
					id: 1,
					seasonId: 10,
					episodeNumber: 1,
					airDate: "2020-01-01",
					hasFile: true,
				},
				{
					id: 2,
					seasonId: 10,
					episodeNumber: 2,
					airDate: "2099-12-31",
					hasFile: false,
				},
			];

			await runHandlerWithMonitorOption("future", episodes);

			expect(mocks.insert).toHaveBeenCalled();
		});

		it("monitors missing episodes with 'missing' option", async () => {
			const episodes = [
				{
					id: 1,
					seasonId: 10,
					episodeNumber: 1,
					airDate: "2024-01-01",
					hasFile: true,
				},
				{
					id: 2,
					seasonId: 10,
					episodeNumber: 2,
					airDate: "2024-01-08",
					hasFile: false,
				},
			];

			await runHandlerWithMonitorOption("missing", episodes);

			expect(mocks.insert).toHaveBeenCalled();
		});

		it("monitors existing episodes with 'existing' option", async () => {
			const episodes = [
				{
					id: 1,
					seasonId: 10,
					episodeNumber: 1,
					airDate: "2024-01-01",
					hasFile: true,
				},
				{
					id: 2,
					seasonId: 10,
					episodeNumber: 2,
					airDate: "2024-01-08",
					hasFile: false,
				},
			];

			await runHandlerWithMonitorOption("existing", episodes);

			expect(mocks.insert).toHaveBeenCalled();
		});

		it("monitors pilot episode with 'pilot' option", async () => {
			const episodes = [
				{
					id: 1,
					seasonId: 10,
					episodeNumber: 1,
					airDate: "2024-01-01",
					hasFile: false,
				},
				{
					id: 2,
					seasonId: 10,
					episodeNumber: 2,
					airDate: "2024-01-08",
					hasFile: false,
				},
			];

			// pilot needs: select season 1 ids
			await runHandlerWithMonitorOption("pilot", episodes, [
				{ all: [{ id: 10 }] },
			]);

			expect(mocks.insert).toHaveBeenCalled();
		});

		it("monitors first season with 'firstSeason' option", async () => {
			const episodes = [
				{
					id: 1,
					seasonId: 10,
					episodeNumber: 1,
					airDate: "2024-01-01",
					hasFile: false,
				},
				{
					id: 2,
					seasonId: 20,
					episodeNumber: 1,
					airDate: "2024-06-01",
					hasFile: false,
				},
			];

			// firstSeason needs: select season 1 ids
			await runHandlerWithMonitorOption("firstSeason", episodes, [
				{ all: [{ id: 10 }] },
			]);

			expect(mocks.insert).toHaveBeenCalled();
		});

		it("monitors last season with 'lastSeason' option", async () => {
			const episodes = [
				{
					id: 1,
					seasonId: 10,
					episodeNumber: 1,
					airDate: "2024-01-01",
					hasFile: false,
				},
				{
					id: 2,
					seasonId: 20,
					episodeNumber: 1,
					airDate: "2024-06-01",
					hasFile: false,
				},
			];

			// lastSeason needs: select max season number, then select last season ids
			await runHandlerWithMonitorOption("lastSeason", episodes, [
				{ get: { maxNum: 2 } },
				{ all: [{ id: 20 }] },
			]);

			expect(mocks.insert).toHaveBeenCalled();
		});

		it("skips monitoring with empty downloadProfileIds", async () => {
			let capturedHandler!: (...args: unknown[]) => unknown;
			mocks.submitCommand.mockImplementation(
				(opts: { handler: (...args: unknown[]) => unknown }) => {
					capturedHandler = opts.handler;
					return { commandId: 1 };
				},
			);

			const data = {
				tmdbId: 100,
				downloadProfileIds: [],
				monitorOption: "all",
				seriesType: "standard",
				useSeasonFolder: true,
				searchOnAdd: false,
				searchCutoffUnmet: false,
				episodeGroupId: null,
			};

			await addShowFn({ data });

			// Show doesn't exist
			mocks.select.mockImplementationOnce(() =>
				createSelectChain({ get: undefined }),
			);

			mocks.tmdbFetch.mockResolvedValueOnce({
				name: "Show",
				overview: "",
				status: "Ended",
				networks: [],
				first_air_date: "",
				episode_run_time: [],
				genres: [],
				poster_path: null,
				backdrop_path: null,
				external_ids: {},
				seasons: [],
			});

			mocks.transaction.mockImplementation((fn: (tx: unknown) => unknown) => {
				const tx = {
					insert: () => {
						const chain = {
							get: vi.fn(() => ({ id: 1, title: "Show" })),
							onConflictDoNothing: vi.fn(() => chain),
							returning: vi.fn(() => chain),
							run: vi.fn(),
							values: vi.fn(() => chain),
						};
						return chain;
					},
					update: () => {
						const chain = {
							run: vi.fn(),
							set: vi.fn(() => chain),
							where: vi.fn(() => chain),
						};
						return chain;
					},
				};
				return fn(tx);
			});

			// computeAbsoluteNumbers: select show seriesType (standard, early exit)
			mocks.select.mockImplementationOnce(() =>
				createSelectChain({ get: { seriesType: "standard" } }),
			);

			const updateChain = createUpdateChain();
			mocks.update.mockReturnValue(updateChain);

			await capturedHandler(data, vi.fn(), vi.fn());

			// With empty downloadProfileIds, applyMonitoringOption returns early
			// and no episode download profiles are inserted via db.insert
			expect(mocks.insert).not.toHaveBeenCalled();
		});
	});

	// ── switchEpisodeGroup – with existing episodes ──────────────────

	describe("switchEpisodeGroup – via updateShowFn with existing episodes", () => {
		it("re-links files and profiles when switching episode groups", async () => {
			const existingShow = {
				id: 1,
				title: "Show",
				tmdbId: 100,
				seriesType: "standard",
				episodeGroupId: "old-group",
			};

			// 1. select show
			queueSelectResults([{ get: existingShow }]);

			const updateChain = createUpdateChain();
			mocks.update.mockReturnValue(updateChain);

			// 2. switchEpisodeGroup: select existingEpisodes
			mocks.select.mockImplementationOnce(() =>
				createSelectChain({
					all: [{ id: 100, tmdbId: 5001 }],
				}),
			);

			// 3. For each existing episode: select files
			mocks.select.mockImplementationOnce(() =>
				createSelectChain({
					all: [
						{
							path: "/media/ep1.mkv",
							size: 1000,
							quality: "1080p",
							dateAdded: "2024-01-01",
							sceneName: "scene",
							duration: 3600,
							codec: "h264",
							container: "mkv",
						},
					],
				}),
			);

			// 4. For each existing episode: select profiles
			mocks.select.mockImplementationOnce(() =>
				createSelectChain({
					all: [{ downloadProfileId: 5 }],
				}),
			);

			const deleteChain = createDeleteChain();
			mocks.deleteFn.mockReturnValue(deleteChain);

			// tmdbFetch for new episode group
			mocks.tmdbFetch.mockResolvedValueOnce({
				groups: [
					{
						order: 1,
						episodes: [
							{
								order: 0,
								name: "Regrouped Ep",
								overview: "",
								air_date: "2024-01-01",
								runtime: 24,
								id: 5001,
							},
						],
					},
				],
			});

			const insertChain = createInsertChain({ returning: { id: 200 } });
			mocks.insert.mockReturnValue(insertChain);

			// 5. switchEpisodeGroup: select newEpisodes
			mocks.select.mockImplementationOnce(() =>
				createSelectChain({
					all: [{ id: 200, tmdbId: 5001 }],
				}),
			);

			// 6. computeAbsoluteNumbers: select show seriesType (standard, early exit)
			mocks.select.mockImplementationOnce(() =>
				createSelectChain({ get: { seriesType: "standard" } }),
			);

			// 7. final select show
			mocks.select.mockImplementationOnce(() =>
				createSelectChain({ get: existingShow }),
			);

			await updateShowFn({
				data: {
					id: 1,
					episodeGroupId: "new-group",
				},
			});

			expect(mocks.requireAdmin).toHaveBeenCalledTimes(1);
			expect(mocks.tmdbFetch).toHaveBeenCalled();
			// Should have re-linked files and profiles via insert
			expect(mocks.insert).toHaveBeenCalled();
			// Should have deleted old seasons
			expect(mocks.deleteFn).toHaveBeenCalled();
		});
	});

	// ── addShowHandler – with seasons and episodes ───────────────────

	describe("addShowHandler – with season episodes in transaction", () => {
		it("inserts seasons and episodes for default (non-group) path", async () => {
			let capturedHandler!: (...args: unknown[]) => unknown;
			mocks.submitCommand.mockImplementation(
				(opts: { handler: (...args: unknown[]) => unknown }) => {
					capturedHandler = opts.handler;
					return { commandId: 1 };
				},
			);

			const data = {
				tmdbId: 321,
				downloadProfileIds: [1],
				monitorOption: "all" as const,
				seriesType: "standard",
				useSeasonFolder: true,
				searchOnAdd: false,
				searchCutoffUnmet: false,
				episodeGroupId: null,
			};

			await addShowFn({ data });

			// Show doesn't exist
			mocks.select.mockImplementationOnce(() =>
				createSelectChain({ get: undefined }),
			);

			// tmdbFetch for show detail with 1 season
			mocks.tmdbFetch.mockResolvedValueOnce({
				name: "Season Show",
				overview: "Has seasons",
				status: "Returning Series",
				networks: [{ name: "ABC" }],
				first_air_date: "2024-06-01",
				episode_run_time: [42],
				genres: [{ name: "Thriller" }],
				poster_path: "/poster.jpg",
				backdrop_path: "/bg.jpg",
				external_ids: { imdb_id: "tt5555555" },
				seasons: [
					{
						season_number: 1,
						overview: "Season 1",
						poster_path: "/s1.jpg",
					},
				],
			});

			// tmdbFetch for season 1 detail
			mocks.tmdbFetch.mockResolvedValueOnce({
				episodes: [
					{
						episode_number: 1,
						name: "Ep 1",
						overview: "",
						air_date: "2024-06-01",
						runtime: 42,
						id: 7001,
					},
					{
						episode_number: 2,
						name: "Ep 2",
						overview: "",
						air_date: "2024-06-08",
						runtime: 42,
						id: 7002,
					},
				],
			});

			const txInsertCalls: unknown[] = [];
			mocks.transaction.mockImplementation((fn: (tx: unknown) => unknown) => {
				const tx = {
					insert: (...args: unknown[]) => {
						txInsertCalls.push(args);
						const chain = {
							get: vi.fn(() => ({
								id: txInsertCalls.length,
								title: "Season Show",
							})),
							onConflictDoNothing: vi.fn(() => chain),
							returning: vi.fn(() => chain),
							run: vi.fn(),
							values: vi.fn(() => chain),
						};
						return chain;
					},
					update: () => {
						const chain = {
							run: vi.fn(),
							set: vi.fn(() => chain),
							where: vi.fn(() => chain),
						};
						return chain;
					},
				};
				return fn(tx);
			});

			// applyMonitoringOption: select allEpisodes
			mocks.select.mockImplementationOnce(() =>
				createSelectChain({
					all: [
						{
							id: 1,
							seasonId: 1,
							episodeNumber: 1,
							airDate: "2024-06-01",
							hasFile: false,
						},
						{
							id: 2,
							seasonId: 1,
							episodeNumber: 2,
							airDate: "2024-06-08",
							hasFile: false,
						},
					],
				}),
			);

			const insertChain = createInsertChain();
			mocks.insert.mockReturnValue(insertChain);

			// computeAbsoluteNumbers: select show seriesType (standard, returns early)
			mocks.select.mockImplementationOnce(() =>
				createSelectChain({ get: { seriesType: "standard" } }),
			);

			const updateChain = createUpdateChain();
			mocks.update.mockReturnValue(updateChain);

			const result = await capturedHandler(data, vi.fn(), vi.fn());

			expect(mocks.tmdbFetch).toHaveBeenCalledTimes(2);
			// Transaction should have insert calls for show, showDownloadProfiles, seasons, episodes, history
			expect(txInsertCalls.length).toBeGreaterThan(0);
			expect(result).toEqual(
				expect.objectContaining({
					seasonCount: 1,
				}),
			);
		});
	});
});
