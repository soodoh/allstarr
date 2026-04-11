import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	requireAuth: vi.fn(),
	tmdbFetch: vi.fn(),
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

vi.mock("../middleware", () => ({ requireAuth: mocks.requireAuth }));
vi.mock("./client", () => ({
	TMDB_IMAGE_BASE: "https://image.tmdb.org/t/p",
	tmdbFetch: mocks.tmdbFetch,
}));

let getTmdbShowDetailFn: typeof import("./shows").getTmdbShowDetailFn;
let getTmdbSeasonDetailFn: typeof import("./shows").getTmdbSeasonDetailFn;
let getTmdbEpisodeGroupsFn: typeof import("./shows").getTmdbEpisodeGroupsFn;
let getTmdbEpisodeGroupDetailFn: typeof import("./shows").getTmdbEpisodeGroupDetailFn;

beforeEach(async () => {
	vi.clearAllMocks();

	const mod = await import("./shows");
	getTmdbShowDetailFn = mod.getTmdbShowDetailFn;
	getTmdbSeasonDetailFn = mod.getTmdbSeasonDetailFn;
	getTmdbEpisodeGroupsFn = mod.getTmdbEpisodeGroupsFn;
	getTmdbEpisodeGroupDetailFn = mod.getTmdbEpisodeGroupDetailFn;
});

describe("getTmdbShowDetailFn", () => {
	const baseShow = {
		id: 1396,
		name: "Breaking Bad",
		overview: "A chemistry teacher...",
		poster_path: "/poster.jpg",
		backdrop_path: "/backdrop.jpg",
		first_air_date: "2008-01-20",
		last_air_date: "2013-09-29",
		status: "Ended",
		type: "Scripted",
		networks: [],
		genres: [],
		number_of_seasons: 5,
		number_of_episodes: 62,
		episode_run_time: [47],
		seasons: [
			{
				id: 1,
				season_number: 1,
				name: "Season 1",
				overview: "",
				poster_path: "/s1.jpg" as string | null,
				episode_count: 7,
				air_date: "2008-01-20",
			},
		],
		external_ids: { imdb_id: "tt0903747" },
	};

	it("calls requireAuth", async () => {
		mocks.tmdbFetch.mockResolvedValue(structuredClone(baseShow));

		await getTmdbShowDetailFn({ data: { tmdbId: 1396 } });

		expect(mocks.requireAuth).toHaveBeenCalledOnce();
	});

	it("fetches with append_to_response=external_ids", async () => {
		mocks.tmdbFetch.mockResolvedValue(structuredClone(baseShow));

		await getTmdbShowDetailFn({ data: { tmdbId: 1396 } });

		expect(mocks.tmdbFetch).toHaveBeenCalledWith("/tv/1396", {
			append_to_response: "external_ids",
		});
	});

	it("transforms poster_path and backdrop_path", async () => {
		mocks.tmdbFetch.mockResolvedValue(structuredClone(baseShow));

		const result = await getTmdbShowDetailFn({ data: { tmdbId: 1396 } });

		expect(result.poster_path).toBe(
			"https://image.tmdb.org/t/p/w500/poster.jpg",
		);
		expect(result.backdrop_path).toBe(
			"https://image.tmdb.org/t/p/w1280/backdrop.jpg",
		);
	});

	it("handles null poster_path and backdrop_path", async () => {
		mocks.tmdbFetch.mockResolvedValue({
			...structuredClone(baseShow),
			poster_path: null,
			backdrop_path: null,
		});

		const result = await getTmdbShowDetailFn({ data: { tmdbId: 1396 } });

		expect(result.poster_path).toBeNull();
		expect(result.backdrop_path).toBeNull();
	});

	it("transforms season poster_path", async () => {
		mocks.tmdbFetch.mockResolvedValue(structuredClone(baseShow));

		const result = await getTmdbShowDetailFn({ data: { tmdbId: 1396 } });

		expect(result.seasons[0].poster_path).toBe(
			"https://image.tmdb.org/t/p/w500/s1.jpg",
		);
	});

	it("handles null season poster_path", async () => {
		const show = structuredClone(baseShow);
		show.seasons[0].poster_path = null;
		mocks.tmdbFetch.mockResolvedValue(show);

		const result = await getTmdbShowDetailFn({ data: { tmdbId: 1396 } });

		expect(result.seasons[0].poster_path).toBeNull();
	});

	describe("mapShowStatus", () => {
		it.each([
			["Returning Series", "continuing"],
			["Ended", "ended"],
			["Canceled", "canceled"],
			["In Production", "upcoming"],
			["Planned", "upcoming"],
		])("maps '%s' to '%s'", async (tmdbStatus, expected) => {
			mocks.tmdbFetch.mockResolvedValue({
				...structuredClone(baseShow),
				status: tmdbStatus,
			});

			const result = await getTmdbShowDetailFn({ data: { tmdbId: 1396 } });

			expect(result.status).toBe(expected);
		});

		it("defaults unknown status to 'continuing'", async () => {
			mocks.tmdbFetch.mockResolvedValue({
				...structuredClone(baseShow),
				status: "Pilot",
			});

			const result = await getTmdbShowDetailFn({ data: { tmdbId: 1396 } });

			expect(result.status).toBe("continuing");
		});
	});
});

describe("getTmdbSeasonDetailFn", () => {
	const baseSeason = {
		id: 100,
		season_number: 1,
		name: "Season 1",
		overview: "The first season",
		poster_path: "/season1.jpg",
		episodes: [
			{
				id: 200,
				episode_number: 1,
				name: "Pilot",
				overview: "The beginning",
				air_date: "2008-01-20",
				runtime: 58,
				still_path: "/ep1.jpg",
				vote_average: 8.5,
			},
			{
				id: 201,
				episode_number: 2,
				name: "Cat's in the Bag",
				overview: "Aftermath",
				air_date: "2008-01-27",
				runtime: 48,
				still_path: null,
				vote_average: 8.2,
			},
		],
	};

	it("calls requireAuth", async () => {
		mocks.tmdbFetch.mockResolvedValue(structuredClone(baseSeason));

		await getTmdbSeasonDetailFn({ data: { tmdbId: 1396, seasonNumber: 1 } });

		expect(mocks.requireAuth).toHaveBeenCalledOnce();
	});

	it("fetches the correct season endpoint", async () => {
		mocks.tmdbFetch.mockResolvedValue(structuredClone(baseSeason));

		await getTmdbSeasonDetailFn({ data: { tmdbId: 1396, seasonNumber: 3 } });

		expect(mocks.tmdbFetch).toHaveBeenCalledWith("/tv/1396/season/3");
	});

	it("transforms season poster_path", async () => {
		mocks.tmdbFetch.mockResolvedValue(structuredClone(baseSeason));

		const result = await getTmdbSeasonDetailFn({
			data: { tmdbId: 1396, seasonNumber: 1 },
		});

		expect(result.poster_path).toBe(
			"https://image.tmdb.org/t/p/w500/season1.jpg",
		);
	});

	it("handles null season poster_path", async () => {
		mocks.tmdbFetch.mockResolvedValue({
			...structuredClone(baseSeason),
			poster_path: null,
		});

		const result = await getTmdbSeasonDetailFn({
			data: { tmdbId: 1396, seasonNumber: 1 },
		});

		expect(result.poster_path).toBeNull();
	});

	it("transforms episode still_path", async () => {
		mocks.tmdbFetch.mockResolvedValue(structuredClone(baseSeason));

		const result = await getTmdbSeasonDetailFn({
			data: { tmdbId: 1396, seasonNumber: 1 },
		});

		expect(result.episodes[0].still_path).toBe(
			"https://image.tmdb.org/t/p/w500/ep1.jpg",
		);
	});

	it("handles null episode still_path", async () => {
		mocks.tmdbFetch.mockResolvedValue(structuredClone(baseSeason));

		const result = await getTmdbSeasonDetailFn({
			data: { tmdbId: 1396, seasonNumber: 1 },
		});

		expect(result.episodes[1].still_path).toBeNull();
	});
});

describe("getTmdbEpisodeGroupsFn", () => {
	it("calls requireAuth", async () => {
		mocks.tmdbFetch.mockResolvedValue({ results: [], id: 1396 });

		await getTmdbEpisodeGroupsFn({ data: { tmdbId: 1396 } });

		expect(mocks.requireAuth).toHaveBeenCalledOnce();
	});

	it("fetches the correct endpoint", async () => {
		mocks.tmdbFetch.mockResolvedValue({ results: [], id: 1396 });

		await getTmdbEpisodeGroupsFn({ data: { tmdbId: 1396 } });

		expect(mocks.tmdbFetch).toHaveBeenCalledWith("/tv/1396/episode_groups");
	});

	it("returns just the results array", async () => {
		const groups = [
			{ id: "abc123", name: "DVD Order", group_count: 5, episode_count: 62 },
		];
		mocks.tmdbFetch.mockResolvedValue({ results: groups, id: 1396 });

		const result = await getTmdbEpisodeGroupsFn({ data: { tmdbId: 1396 } });

		expect(result).toEqual(groups);
	});
});

describe("getTmdbEpisodeGroupDetailFn", () => {
	const baseGroupDetail = {
		id: "abc123",
		name: "DVD Order",
		description: "DVD episode ordering",
		episode_count: 4,
		group_count: 2,
		type: 3 as const,
		network: null,
		groups: [
			{
				id: "g2",
				name: "Season 2",
				order: 2,
				locked: false,
				episodes: [
					{
						id: 301,
						name: "Ep 2",
						overview: "",
						air_date: null,
						episode_number: 2,
						season_number: 2,
						show_id: 1396,
						still_path: "/ep2.jpg",
						runtime: 45,
						vote_average: 8.0,
						order: 1,
					},
					{
						id: 300,
						name: "Ep 1",
						overview: "",
						air_date: null,
						episode_number: 1,
						season_number: 2,
						show_id: 1396,
						still_path: "/ep1.jpg",
						runtime: 45,
						vote_average: 8.0,
						order: 0,
					},
				],
			},
			{
				id: "g1",
				name: "Season 1",
				order: 1,
				locked: false,
				episodes: [
					{
						id: 100,
						name: "Pilot",
						overview: "",
						air_date: null,
						episode_number: 1,
						season_number: 1,
						show_id: 1396,
						still_path: null,
						runtime: 58,
						vote_average: 9.0,
						order: 0,
					},
				],
			},
		],
	};

	it("calls requireAuth", async () => {
		mocks.tmdbFetch.mockResolvedValue(structuredClone(baseGroupDetail));

		await getTmdbEpisodeGroupDetailFn({ data: { groupId: "abc123" } });

		expect(mocks.requireAuth).toHaveBeenCalledOnce();
	});

	it("fetches the correct endpoint", async () => {
		mocks.tmdbFetch.mockResolvedValue(structuredClone(baseGroupDetail));

		await getTmdbEpisodeGroupDetailFn({ data: { groupId: "abc123" } });

		expect(mocks.tmdbFetch).toHaveBeenCalledWith("/tv/episode_group/abc123");
	});

	it("sorts groups by order", async () => {
		mocks.tmdbFetch.mockResolvedValue(structuredClone(baseGroupDetail));

		const result = await getTmdbEpisodeGroupDetailFn({
			data: { groupId: "abc123" },
		});

		expect(result.groups[0].name).toBe("Season 1");
		expect(result.groups[0].order).toBe(1);
		expect(result.groups[1].name).toBe("Season 2");
		expect(result.groups[1].order).toBe(2);
	});

	it("sorts episodes within groups by order", async () => {
		mocks.tmdbFetch.mockResolvedValue(structuredClone(baseGroupDetail));

		const result = await getTmdbEpisodeGroupDetailFn({
			data: { groupId: "abc123" },
		});

		const season2 = result.groups[1];
		expect(season2.episodes[0].name).toBe("Ep 1");
		expect(season2.episodes[0].order).toBe(0);
		expect(season2.episodes[1].name).toBe("Ep 2");
		expect(season2.episodes[1].order).toBe(1);
	});

	it("transforms episode still_path", async () => {
		mocks.tmdbFetch.mockResolvedValue(structuredClone(baseGroupDetail));

		const result = await getTmdbEpisodeGroupDetailFn({
			data: { groupId: "abc123" },
		});

		const season2 = result.groups[1];
		expect(season2.episodes[0].still_path).toBe(
			"https://image.tmdb.org/t/p/w500/ep1.jpg",
		);
		expect(season2.episodes[1].still_path).toBe(
			"https://image.tmdb.org/t/p/w500/ep2.jpg",
		);
	});

	it("handles null episode still_path", async () => {
		mocks.tmdbFetch.mockResolvedValue(structuredClone(baseGroupDetail));

		const result = await getTmdbEpisodeGroupDetailFn({
			data: { groupId: "abc123" },
		});

		const season1 = result.groups[0];
		expect(season1.episodes[0].still_path).toBeNull();
	});

	it("preserves other group detail fields", async () => {
		mocks.tmdbFetch.mockResolvedValue(structuredClone(baseGroupDetail));

		const result = await getTmdbEpisodeGroupDetailFn({
			data: { groupId: "abc123" },
		});

		expect(result.id).toBe("abc123");
		expect(result.name).toBe("DVD Order");
		expect(result.description).toBe("DVD episode ordering");
		expect(result.episode_count).toBe(4);
		expect(result.group_count).toBe(2);
	});
});
