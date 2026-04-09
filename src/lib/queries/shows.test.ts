import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	checkShowExistsFn: vi.fn(),
	getShowDetailFn: vi.fn(),
	getShowsFn: vi.fn(),
}));

vi.mock("src/server/shows", () => ({
	checkShowExistsFn: mocks.checkShowExistsFn,
	getShowDetailFn: mocks.getShowDetailFn,
	getShowsFn: mocks.getShowsFn,
}));

import { showDetailQuery, showExistenceQuery, showsListQuery } from "./shows";

describe("shows queries", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("builds the show list query", async () => {
		mocks.getShowsFn.mockResolvedValue([{ id: 1 }]);

		const options = showsListQuery();

		expect(options.queryKey).toStrictEqual(["shows", "list"]);
		await expect(options.queryFn!({} as never)).resolves.toEqual([{ id: 1 }]);
		expect(mocks.getShowsFn).toHaveBeenCalledTimes(1);
	});

	it("builds the show detail query", async () => {
		mocks.getShowDetailFn.mockResolvedValue({ id: 17 });

		const options = showDetailQuery(17);

		expect(options.queryKey).toStrictEqual(["shows", "detail", 17]);
		await expect(options.queryFn!({} as never)).resolves.toEqual({ id: 17 });
		expect(mocks.getShowDetailFn).toHaveBeenCalledWith({ data: { id: 17 } });
	});

	it("disables the existence query until a positive tmdb id is provided", () => {
		const disabled = showExistenceQuery(0);
		const enabled = showExistenceQuery(77);

		expect(disabled.queryKey).toStrictEqual(["shows", "existence", 0]);
		expect(disabled.enabled).toBe(false);
		expect(enabled.queryKey).toStrictEqual(["shows", "existence", 77]);
		expect(enabled.enabled).toBe(true);
	});

	it("passes the tmdb id through to the existence server fn", async () => {
		mocks.checkShowExistsFn.mockResolvedValue(true);

		const options = showExistenceQuery(88);

		await expect(options.queryFn!({} as never)).resolves.toBe(true);
		expect(mocks.checkShowExistsFn).toHaveBeenCalledWith({
			data: { tmdbId: 88 },
		});
	});
});
