import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	getDashboardContentStatsFn: vi.fn(),
	getDashboardQualityBreakdownFn: vi.fn(),
	getDashboardRecentActivityFn: vi.fn(),
	getDashboardStorageStatsFn: vi.fn(),
}));

vi.mock("src/server/dashboard", () => ({
	getDashboardContentStatsFn: mocks.getDashboardContentStatsFn,
	getDashboardQualityBreakdownFn: mocks.getDashboardQualityBreakdownFn,
	getDashboardRecentActivityFn: mocks.getDashboardRecentActivityFn,
	getDashboardStorageStatsFn: mocks.getDashboardStorageStatsFn,
}));

import {
	dashboardContentStatsQuery,
	dashboardQualityBreakdownQuery,
	dashboardRecentActivityQuery,
	dashboardStorageQuery,
} from "./dashboard";

describe("dashboard queries", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it.each([
		[
			"content stats",
			dashboardContentStatsQuery,
			mocks.getDashboardContentStatsFn,
			["dashboard", "contentStats"],
			{ books: 10 },
		],
		[
			"quality breakdown",
			dashboardQualityBreakdownQuery,
			mocks.getDashboardQualityBreakdownFn,
			["dashboard", "qualityBreakdown"],
			{ good: 7 },
		],
		[
			"storage",
			dashboardStorageQuery,
			mocks.getDashboardStorageStatsFn,
			["dashboard", "storage"],
			{ total: 123 },
		],
		[
			"recent activity",
			dashboardRecentActivityQuery,
			mocks.getDashboardRecentActivityFn,
			["dashboard", "recentActivity"],
			[{ id: 1 }],
		],
	])("builds the %s query", async (_label, makeQuery, mockFn, queryKey, value) => {
		mockFn.mockResolvedValue(value);

		const options = makeQuery();

		expect(options.queryKey).toStrictEqual(queryKey);
		await expect(options.queryFn!({} as never)).resolves.toEqual(value);
		expect(mockFn).toHaveBeenCalledTimes(1);
	});
});
