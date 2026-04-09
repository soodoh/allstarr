import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	requireAuth: vi.fn(),
	tmdbFetch: vi.fn(),
	getMediaSetting: vi.fn(),
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
vi.mock("../settings-reader", () => ({ default: mocks.getMediaSetting }));

let searchTmdbShowsFn: typeof import("./search").searchTmdbShowsFn;
let searchTmdbMoviesFn: typeof import("./search").searchTmdbMoviesFn;

beforeEach(async () => {
	vi.clearAllMocks();
	mocks.getMediaSetting.mockReturnValue(false);

	const mod = await import("./search");
	searchTmdbShowsFn = mod.searchTmdbShowsFn;
	searchTmdbMoviesFn = mod.searchTmdbMoviesFn;
});

describe("searchTmdbShowsFn", () => {
	it("calls requireAuth", async () => {
		mocks.tmdbFetch.mockResolvedValue({
			page: 1,
			results: [],
			total_pages: 1,
			total_results: 0,
		});

		await searchTmdbShowsFn({ data: { query: "test" } });

		expect(mocks.requireAuth).toHaveBeenCalledOnce();
	});

	it("transforms poster_path and backdrop_path on results", async () => {
		mocks.tmdbFetch.mockResolvedValue({
			page: 1,
			total_pages: 1,
			total_results: 1,
			results: [
				{
					id: 1,
					name: "Breaking Bad",
					poster_path: "/abc.jpg",
					backdrop_path: "/xyz.jpg",
				},
			],
		});

		const result = await searchTmdbShowsFn({ data: { query: "breaking" } });

		expect(result.results[0].poster_path).toBe(
			"https://image.tmdb.org/t/p/w500/abc.jpg",
		);
		expect(result.results[0].backdrop_path).toBe(
			"https://image.tmdb.org/t/p/w1280/xyz.jpg",
		);
	});

	it("handles null poster_path and backdrop_path", async () => {
		mocks.tmdbFetch.mockResolvedValue({
			page: 1,
			total_pages: 1,
			total_results: 1,
			results: [
				{
					id: 2,
					name: "Unknown Show",
					poster_path: null,
					backdrop_path: null,
				},
			],
		});

		const result = await searchTmdbShowsFn({ data: { query: "unknown" } });

		expect(result.results[0].poster_path).toBeNull();
		expect(result.results[0].backdrop_path).toBeNull();
	});

	it("handles undefined poster_path and backdrop_path", async () => {
		mocks.tmdbFetch.mockResolvedValue({
			page: 1,
			total_pages: 1,
			total_results: 1,
			results: [{ id: 3, name: "No Images" }],
		});

		const result = await searchTmdbShowsFn({ data: { query: "none" } });

		expect(result.results[0].poster_path).toBeNull();
		expect(result.results[0].backdrop_path).toBeNull();
	});

	it("fetches from /search/tv with correct params", async () => {
		mocks.getMediaSetting.mockReturnValue(false);
		mocks.tmdbFetch.mockResolvedValue({
			page: 1,
			results: [],
			total_pages: 1,
			total_results: 0,
		});

		await searchTmdbShowsFn({ data: { query: "test", page: 3 } });

		expect(mocks.tmdbFetch).toHaveBeenCalledWith("/search/tv", {
			query: "test",
			include_adult: "false",
			page: "3",
		});
	});

	it("omits page param when page is not provided", async () => {
		mocks.tmdbFetch.mockResolvedValue({
			page: 1,
			results: [],
			total_pages: 1,
			total_results: 0,
		});

		await searchTmdbShowsFn({ data: { query: "test" } });

		expect(mocks.tmdbFetch).toHaveBeenCalledWith("/search/tv", {
			query: "test",
			include_adult: "false",
		});
	});

	it("passes includeAdult setting from getMediaSetting", async () => {
		mocks.getMediaSetting.mockReturnValue(true);
		mocks.tmdbFetch.mockResolvedValue({
			page: 1,
			results: [],
			total_pages: 1,
			total_results: 0,
		});

		await searchTmdbShowsFn({ data: { query: "test" } });

		expect(mocks.getMediaSetting).toHaveBeenCalledWith(
			"metadata.tmdb.includeAdult",
			false,
		);
		expect(mocks.tmdbFetch).toHaveBeenCalledWith("/search/tv", {
			query: "test",
			include_adult: "true",
		});
	});

	it("preserves pagination metadata in response", async () => {
		mocks.tmdbFetch.mockResolvedValue({
			page: 2,
			total_pages: 10,
			total_results: 200,
			results: [],
		});

		const result = await searchTmdbShowsFn({ data: { query: "test" } });

		expect(result.page).toBe(2);
		expect(result.total_pages).toBe(10);
		expect(result.total_results).toBe(200);
	});
});

describe("searchTmdbMoviesFn", () => {
	it("calls requireAuth", async () => {
		mocks.tmdbFetch.mockResolvedValue({
			page: 1,
			results: [],
			total_pages: 1,
			total_results: 0,
		});

		await searchTmdbMoviesFn({ data: { query: "test" } });

		expect(mocks.requireAuth).toHaveBeenCalledOnce();
	});

	it("transforms poster_path and backdrop_path on results", async () => {
		mocks.tmdbFetch.mockResolvedValue({
			page: 1,
			total_pages: 1,
			total_results: 1,
			results: [
				{
					id: 100,
					title: "Inception",
					poster_path: "/poster.jpg",
					backdrop_path: "/backdrop.jpg",
				},
			],
		});

		const result = await searchTmdbMoviesFn({ data: { query: "inception" } });

		expect(result.results[0].poster_path).toBe(
			"https://image.tmdb.org/t/p/w500/poster.jpg",
		);
		expect(result.results[0].backdrop_path).toBe(
			"https://image.tmdb.org/t/p/w1280/backdrop.jpg",
		);
	});

	it("handles null image paths", async () => {
		mocks.tmdbFetch.mockResolvedValue({
			page: 1,
			total_pages: 1,
			total_results: 1,
			results: [
				{
					id: 101,
					title: "No Poster",
					poster_path: null,
					backdrop_path: null,
				},
			],
		});

		const result = await searchTmdbMoviesFn({ data: { query: "none" } });

		expect(result.results[0].poster_path).toBeNull();
		expect(result.results[0].backdrop_path).toBeNull();
	});

	it("fetches from /search/movie with correct params", async () => {
		mocks.getMediaSetting.mockReturnValue(false);
		mocks.tmdbFetch.mockResolvedValue({
			page: 1,
			results: [],
			total_pages: 1,
			total_results: 0,
		});

		await searchTmdbMoviesFn({ data: { query: "matrix", page: 2 } });

		expect(mocks.tmdbFetch).toHaveBeenCalledWith("/search/movie", {
			query: "matrix",
			include_adult: "false",
			page: "2",
		});
	});

	it("passes includeAdult=true when setting is enabled", async () => {
		mocks.getMediaSetting.mockReturnValue(true);
		mocks.tmdbFetch.mockResolvedValue({
			page: 1,
			results: [],
			total_pages: 1,
			total_results: 0,
		});

		await searchTmdbMoviesFn({ data: { query: "test" } });

		expect(mocks.tmdbFetch).toHaveBeenCalledWith("/search/movie", {
			query: "test",
			include_adult: "true",
		});
	});

	it("transforms multiple results", async () => {
		mocks.tmdbFetch.mockResolvedValue({
			page: 1,
			total_pages: 1,
			total_results: 2,
			results: [
				{
					id: 1,
					title: "Movie A",
					poster_path: "/a.jpg",
					backdrop_path: "/a_bg.jpg",
				},
				{ id: 2, title: "Movie B", poster_path: "/b.jpg", backdrop_path: null },
			],
		});

		const result = await searchTmdbMoviesFn({ data: { query: "movie" } });

		expect(result.results).toHaveLength(2);
		expect(result.results[0].poster_path).toBe(
			"https://image.tmdb.org/t/p/w500/a.jpg",
		);
		expect(result.results[0].backdrop_path).toBe(
			"https://image.tmdb.org/t/p/w1280/a_bg.jpg",
		);
		expect(result.results[1].poster_path).toBe(
			"https://image.tmdb.org/t/p/w500/b.jpg",
		);
		expect(result.results[1].backdrop_path).toBeNull();
	});
});
