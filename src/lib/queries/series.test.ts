import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	getSeriesListFn: vi.fn(),
}));

vi.mock("src/server/series", () => ({
	getSeriesListFn: mocks.getSeriesListFn,
}));

import { seriesListQuery } from "./series";

describe("series queries", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("builds the series list query", async () => {
		mocks.getSeriesListFn.mockResolvedValue([{ id: 1 }]);

		const options = seriesListQuery();

		expect(options.queryKey).toStrictEqual(["series", "list"]);
		await expect(options.queryFn!({} as never)).resolves.toEqual([{ id: 1 }]);
		expect(mocks.getSeriesListFn).toHaveBeenCalledTimes(1);
	});
});
