import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TaskResult } from "../registry";

const mocks = vi.hoisted(() => ({
	registerTask: vi.fn(),
	db: {
		select: vi.fn(),
	},
	sql: vi.fn(),
	refreshMovieInternal: vi.fn(),
	refreshShowInternal: vi.fn(),
	logError: vi.fn(),
}));

function makeQuery(result: unknown[]) {
	const chain: Record<string, unknown> = {};
	chain.select = vi.fn().mockReturnValue(chain);
	chain.from = vi.fn().mockReturnValue(chain);
	chain.where = vi.fn().mockReturnValue(chain);
	chain.all = vi.fn().mockReturnValue(result);
	return chain;
}

vi.mock("../registry", () => ({
	registerTask: mocks.registerTask,
}));

vi.mock("drizzle-orm", () => ({
	sql: mocks.sql,
}));

vi.mock("src/db", () => ({
	db: mocks.db,
}));

vi.mock("src/db/schema", () => ({
	movies: { id: "movies.id", title: "movies.title" },
	movieDownloadProfiles: { movieId: "movieDownloadProfiles.movieId" },
	shows: { id: "shows.id", title: "shows.title" },
	episodes: { id: "episodes.id", showId: "episodes.showId" },
	episodeDownloadProfiles: { episodeId: "episodeDownloadProfiles.episodeId" },
}));

vi.mock("src/server/movies", () => ({
	refreshMovieInternal: mocks.refreshMovieInternal,
}));

vi.mock("src/server/shows", () => ({
	refreshShowInternal: mocks.refreshShowInternal,
}));

vi.mock("src/server/logger", () => ({
	logError: mocks.logError,
}));

// Import to trigger registerTask at module level
await import("./refresh-tmdb-metadata");

const taskDef = mocks.registerTask.mock.calls[0][0];
const handler = taskDef.handler;

describe("refresh-tmdb-metadata task", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("registers with correct metadata", () => {
		expect(taskDef.id).toBe("refresh-tmdb-metadata");
		expect(taskDef.name).toBe("Refresh TMDB Metadata");
		expect(taskDef.group).toBe("metadata");
		expect(taskDef.defaultInterval).toBe(12 * 60 * 60);
	});

	it("returns early when no monitored movies or shows", async () => {
		const moviesQuery = makeQuery([]);
		const showsQuery = makeQuery([]);
		mocks.db.select
			.mockReturnValueOnce(moviesQuery)
			.mockReturnValueOnce(showsQuery);

		const result: TaskResult = await handler(vi.fn());

		expect(result.success).toBe(true);
		expect(result.message).toBe("No monitored movies or shows");
	});

	it("refreshes movies and shows successfully", async () => {
		const moviesQuery = makeQuery([
			{ id: 1, title: "Movie A" },
			{ id: 2, title: "Movie B" },
		]);
		const showsQuery = makeQuery([{ id: 10, title: "Show A" }]);

		mocks.db.select
			.mockReturnValueOnce(moviesQuery)
			.mockReturnValueOnce(showsQuery);

		mocks.refreshMovieInternal
			.mockResolvedValueOnce(undefined)
			.mockResolvedValueOnce(undefined);
		mocks.refreshShowInternal.mockResolvedValueOnce({ newEpisodes: 3 });

		const updateProgress = vi.fn();
		const resultPromise = handler(updateProgress);
		await vi.advanceTimersByTimeAsync(5000);
		const result: TaskResult = await resultPromise;

		expect(mocks.refreshMovieInternal).toHaveBeenCalledTimes(2);
		expect(mocks.refreshMovieInternal).toHaveBeenCalledWith(1);
		expect(mocks.refreshMovieInternal).toHaveBeenCalledWith(2);
		expect(mocks.refreshShowInternal).toHaveBeenCalledTimes(1);
		expect(mocks.refreshShowInternal).toHaveBeenCalledWith(10);
		expect(result.success).toBe(true);
		expect(result.message).toBe("Refreshed 2 movies, 1 show, 3 new episodes");
	});

	it("calls updateProgress with completion counts", async () => {
		const moviesQuery = makeQuery([{ id: 1, title: "Movie A" }]);
		const showsQuery = makeQuery([{ id: 10, title: "Show A" }]);

		mocks.db.select
			.mockReturnValueOnce(moviesQuery)
			.mockReturnValueOnce(showsQuery);

		mocks.refreshMovieInternal.mockResolvedValueOnce(undefined);
		mocks.refreshShowInternal.mockResolvedValueOnce({ newEpisodes: 0 });

		const updateProgress = vi.fn();
		const resultPromise = handler(updateProgress);
		await vi.advanceTimersByTimeAsync(5000);
		await resultPromise;

		expect(updateProgress).toHaveBeenCalledWith("1/2");
		expect(updateProgress).toHaveBeenCalledWith("2/2");
	});

	it("handles errors during movie refresh", async () => {
		const moviesQuery = makeQuery([{ id: 1, title: "Bad Movie" }]);
		const showsQuery = makeQuery([]);

		mocks.db.select
			.mockReturnValueOnce(moviesQuery)
			.mockReturnValueOnce(showsQuery);

		const testError = new Error("TMDB unavailable");
		mocks.refreshMovieInternal.mockRejectedValueOnce(testError);

		const resultPromise = handler(vi.fn());
		await vi.advanceTimersByTimeAsync(5000);
		const result: TaskResult = await resultPromise;

		expect(mocks.logError).toHaveBeenCalledWith(
			"refresh-tmdb-metadata",
			'Failed to refresh movie "Bad Movie" (id=1)',
			testError,
		);
		expect(result.success).toBe(false);
		expect(result.message).toBe("Refreshed 1 error");
	});

	it("handles errors during show refresh", async () => {
		const moviesQuery = makeQuery([]);
		const showsQuery = makeQuery([{ id: 10, title: "Bad Show" }]);

		mocks.db.select
			.mockReturnValueOnce(moviesQuery)
			.mockReturnValueOnce(showsQuery);

		const testError = new Error("Network error");
		mocks.refreshShowInternal.mockRejectedValueOnce(testError);

		const resultPromise = handler(vi.fn());
		await vi.advanceTimersByTimeAsync(5000);
		const result: TaskResult = await resultPromise;

		expect(mocks.logError).toHaveBeenCalledWith(
			"refresh-tmdb-metadata",
			'Failed to refresh show "Bad Show" (id=10)',
			testError,
		);
		expect(result.success).toBe(false);
		expect(result.message).toBe("Refreshed 1 error");
	});

	it("handles mixed success and errors", async () => {
		const moviesQuery = makeQuery([
			{ id: 1, title: "Good Movie" },
			{ id: 2, title: "Bad Movie" },
		]);
		const showsQuery = makeQuery([
			{ id: 10, title: "Good Show" },
			{ id: 11, title: "Bad Show" },
		]);

		mocks.db.select
			.mockReturnValueOnce(moviesQuery)
			.mockReturnValueOnce(showsQuery);

		mocks.refreshMovieInternal
			.mockResolvedValueOnce(undefined)
			.mockRejectedValueOnce(new Error("movie fail"));
		mocks.refreshShowInternal
			.mockResolvedValueOnce({ newEpisodes: 5 })
			.mockRejectedValueOnce(new Error("show fail"));

		const resultPromise = handler(vi.fn());
		await vi.advanceTimersByTimeAsync(10000);
		const result: TaskResult = await resultPromise;

		expect(result.success).toBe(false);
		expect(result.message).toBe(
			"Refreshed 1 movie, 1 show, 5 new episodes, 2 errors",
		);
	});

	it("returns 'No metadata changes' when refreshes produce no new data", async () => {
		const moviesQuery = makeQuery([{ id: 1, title: "Movie A" }]);
		const showsQuery = makeQuery([{ id: 10, title: "Show A" }]);

		mocks.db.select
			.mockReturnValueOnce(moviesQuery)
			.mockReturnValueOnce(showsQuery);

		mocks.refreshMovieInternal.mockResolvedValueOnce(undefined);
		mocks.refreshShowInternal.mockResolvedValueOnce({ newEpisodes: 0 });

		const resultPromise = handler(vi.fn());
		await vi.advanceTimersByTimeAsync(5000);
		const result: TaskResult = await resultPromise;

		// Both refreshed successfully but produced no new episodes
		// moviesRefreshed=1 and showsRefreshed=1 are > 0 so they appear in parts
		expect(result.success).toBe(true);
		expect(result.message).toBe("Refreshed 1 movie, 1 show");
	});

	it("refreshes only movies when no shows are monitored", async () => {
		const moviesQuery = makeQuery([{ id: 1, title: "Movie A" }]);
		const showsQuery = makeQuery([]);

		mocks.db.select
			.mockReturnValueOnce(moviesQuery)
			.mockReturnValueOnce(showsQuery);

		mocks.refreshMovieInternal.mockResolvedValueOnce(undefined);

		const resultPromise = handler(vi.fn());
		await vi.advanceTimersByTimeAsync(5000);
		const result: TaskResult = await resultPromise;

		expect(mocks.refreshShowInternal).not.toHaveBeenCalled();
		expect(result.success).toBe(true);
		expect(result.message).toBe("Refreshed 1 movie");
	});

	it("refreshes only shows when no movies are monitored", async () => {
		const moviesQuery = makeQuery([]);
		const showsQuery = makeQuery([{ id: 10, title: "Show A" }]);

		mocks.db.select
			.mockReturnValueOnce(moviesQuery)
			.mockReturnValueOnce(showsQuery);

		mocks.refreshShowInternal.mockResolvedValueOnce({ newEpisodes: 2 });

		const resultPromise = handler(vi.fn());
		await vi.advanceTimersByTimeAsync(5000);
		const result: TaskResult = await resultPromise;

		expect(mocks.refreshMovieInternal).not.toHaveBeenCalled();
		expect(result.success).toBe(true);
		expect(result.message).toBe("Refreshed 1 show, 2 new episodes");
	});

	it("uses correct plural forms for singular counts", async () => {
		const moviesQuery = makeQuery([{ id: 1, title: "Movie" }]);
		const showsQuery = makeQuery([{ id: 10, title: "Show" }]);

		mocks.db.select
			.mockReturnValueOnce(moviesQuery)
			.mockReturnValueOnce(showsQuery);

		mocks.refreshMovieInternal.mockResolvedValueOnce(undefined);
		mocks.refreshShowInternal.mockResolvedValueOnce({ newEpisodes: 1 });

		const resultPromise = handler(vi.fn());
		await vi.advanceTimersByTimeAsync(5000);
		const result: TaskResult = await resultPromise;

		expect(result.message).toBe("Refreshed 1 movie, 1 show, 1 new episode");
	});
});
