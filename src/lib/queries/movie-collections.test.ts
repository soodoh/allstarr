import { requireValue } from "src/test/require-value";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	getMovieCollectionsFn: vi.fn(),
}));

vi.mock("src/server/movie-collections", () => ({
	getMovieCollectionsFn: mocks.getMovieCollectionsFn,
}));

import { movieCollectionsListQuery } from "./movie-collections";

describe("movie collection queries", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("builds the movie collections list query", async () => {
		mocks.getMovieCollectionsFn.mockResolvedValue([{ id: 1 }]);

		const options = movieCollectionsListQuery();

		expect(options.queryKey).toStrictEqual(["movieCollections", "list"]);
		const queryFn = requireValue(options.queryFn);
		await expect(queryFn({} as never)).resolves.toEqual([{ id: 1 }]);
		expect(mocks.getMovieCollectionsFn).toHaveBeenCalledTimes(1);
	});
});
