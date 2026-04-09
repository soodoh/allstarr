import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	checkMovieExistsFn: vi.fn(),
	getMovieDetailFn: vi.fn(),
	getMoviesFn: vi.fn(),
}));

vi.mock("src/server/movies", () => ({
	checkMovieExistsFn: mocks.checkMovieExistsFn,
	getMovieDetailFn: mocks.getMovieDetailFn,
	getMoviesFn: mocks.getMoviesFn,
}));

import {
	movieDetailQuery,
	movieExistenceQuery,
	moviesListQuery,
} from "./movies";

describe("movies queries", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("builds the movie list query", async () => {
		mocks.getMoviesFn.mockResolvedValue([{ id: 1 }]);

		const options = moviesListQuery();

		expect(options.queryKey).toStrictEqual(["movies", "list"]);
		await expect(options.queryFn!({} as never)).resolves.toEqual([{ id: 1 }]);
		expect(mocks.getMoviesFn).toHaveBeenCalledTimes(1);
	});

	it("builds the movie detail query", async () => {
		mocks.getMovieDetailFn.mockResolvedValue({ id: 41 });

		const options = movieDetailQuery(41);

		expect(options.queryKey).toStrictEqual(["movies", "detail", 41]);
		await expect(options.queryFn!({} as never)).resolves.toEqual({ id: 41 });
		expect(mocks.getMovieDetailFn).toHaveBeenCalledWith({ data: { id: 41 } });
	});

	it("disables the existence query until a positive tmdb id is provided", () => {
		const disabled = movieExistenceQuery(0);
		const enabled = movieExistenceQuery(123);

		expect(disabled.queryKey).toStrictEqual(["movies", "existence", 0]);
		expect(disabled.enabled).toBe(false);
		expect(enabled.queryKey).toStrictEqual(["movies", "existence", 123]);
		expect(enabled.enabled).toBe(true);
	});

	it("passes the tmdb id through to the existence server fn", async () => {
		mocks.checkMovieExistsFn.mockResolvedValue(true);

		const options = movieExistenceQuery(321);

		await expect(options.queryFn!({} as never)).resolves.toBe(true);
		expect(mocks.checkMovieExistsFn).toHaveBeenCalledWith({
			data: { tmdbId: 321 },
		});
	});
});
