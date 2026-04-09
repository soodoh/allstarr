import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	getHistoryFn: vi.fn(),
}));

vi.mock("src/server/history", () => ({
	getHistoryFn: mocks.getHistoryFn,
}));

import { historyListQuery } from "./history";

describe("history queries", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("builds the default history query and forwards empty params", async () => {
		mocks.getHistoryFn.mockResolvedValue({
			items: [],
			page: 1,
			total: 0,
			totalPages: 0,
		});

		const options = historyListQuery();

		expect(options.queryKey).toStrictEqual([
			"history",
			"list",
			1,
			"all",
			undefined,
		]);
		await expect(options.queryFn!({} as never)).resolves.toEqual({
			items: [],
			page: 1,
			total: 0,
			totalPages: 0,
		});
		expect(mocks.getHistoryFn).toHaveBeenCalledWith({ data: {} });
	});

	it("includes page, event type, limit, and bookId in the query key", async () => {
		mocks.getHistoryFn.mockResolvedValue({
			items: [],
			page: 3,
			total: 0,
			totalPages: 0,
		});

		const options = historyListQuery({
			bookId: 99,
			eventType: "download",
			limit: 25,
			page: 3,
		});

		expect(options.queryKey).toStrictEqual([
			"history",
			"list",
			3,
			"download",
			99,
		]);
		await expect(options.queryFn!({} as never)).resolves.toEqual({
			items: [],
			page: 3,
			total: 0,
			totalPages: 0,
		});
		expect(mocks.getHistoryFn).toHaveBeenCalledWith({
			data: {
				bookId: 99,
				eventType: "download",
				limit: 25,
				page: 3,
			},
		});
	});
});
