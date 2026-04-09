import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	getBlocklistFn: vi.fn(),
}));

vi.mock("src/server/blocklist", () => ({
	getBlocklistFn: mocks.getBlocklistFn,
}));

import { blocklistListQuery } from "./blocklist";

describe("blocklist queries", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("builds the default blocklist query", async () => {
		mocks.getBlocklistFn.mockResolvedValue({
			items: [],
			page: 1,
			total: 0,
			totalPages: 0,
		});

		const options = blocklistListQuery();

		expect(options.queryKey).toStrictEqual(["blocklist", "list", {}]);
		await expect(options.queryFn!({} as never)).resolves.toEqual({
			items: [],
			page: 1,
			total: 0,
			totalPages: 0,
		});
		expect(mocks.getBlocklistFn).toHaveBeenCalledWith({ data: {} });
	});

	it("passes page and limit through to the server query", async () => {
		mocks.getBlocklistFn.mockResolvedValue({
			items: [],
			page: 2,
			total: 0,
			totalPages: 0,
		});

		const options = blocklistListQuery({ page: 2, limit: 50 });

		expect(options.queryKey).toStrictEqual([
			"blocklist",
			"list",
			{ page: 2, limit: 50 },
		]);
		await expect(options.queryFn!({} as never)).resolves.toEqual({
			items: [],
			page: 2,
			total: 0,
			totalPages: 0,
		});
		expect(mocks.getBlocklistFn).toHaveBeenCalledWith({
			data: { limit: 50, page: 2 },
		});
	});
});
