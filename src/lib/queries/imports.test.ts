import { requireValue } from "src/test/require-value";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	getImportPlanFn: vi.fn(),
	getImportReviewFn: vi.fn(),
	getImportSourcesFn: vi.fn(),
}));

vi.mock("src/server/import-sources", () => ({
	getImportPlanFn: mocks.getImportPlanFn,
	getImportReviewFn: mocks.getImportReviewFn,
	getImportSourcesFn: mocks.getImportSourcesFn,
}));

import {
	importPlanQuery,
	importReviewQuery,
	importSourcesQuery,
} from "./imports";

describe("imports queries", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("builds the import sources query", async () => {
		mocks.getImportSourcesFn.mockResolvedValue([{ id: 1, label: "Sonarr" }]);

		const options = importSourcesQuery();

		expect(options.queryKey).toStrictEqual(["imports", "sources"]);
		const queryFn = requireValue(options.queryFn);
		await expect(queryFn({} as never)).resolves.toEqual([
			{ id: 1, label: "Sonarr" },
		]);
		expect(mocks.getImportSourcesFn).toHaveBeenCalledTimes(1);
	});

	it("builds the import plan query for a selected source", async () => {
		mocks.getImportPlanFn.mockResolvedValue([
			{ sourceKey: "sonarr:7:show:101" },
		]);

		const options = importPlanQuery(7);

		expect(options.queryKey).toStrictEqual(["imports", "plan", 7]);
		expect(options.enabled).toBe(true);
		const queryFn = requireValue(options.queryFn);
		await expect(queryFn({} as never)).resolves.toEqual([
			{ sourceKey: "sonarr:7:show:101" },
		]);
		expect(mocks.getImportPlanFn).toHaveBeenCalledWith({
			data: { sourceId: 7 },
		});
	});

	it("builds the import review query for a selected source", async () => {
		mocks.getImportReviewFn.mockResolvedValue([
			{ sourceKey: "readarr:9:book:501" },
		]);

		const options = importReviewQuery(9);

		expect(options.queryKey).toStrictEqual(["imports", "review", 9]);
		expect(options.enabled).toBe(true);
		const queryFn = requireValue(options.queryFn);
		await expect(queryFn({} as never)).resolves.toEqual([
			{ sourceKey: "readarr:9:book:501" },
		]);
		expect(mocks.getImportReviewFn).toHaveBeenCalledWith({
			data: { sourceId: 9 },
		});
	});

	it("keeps plan and review queries disabled when no source is selected", () => {
		expect(importPlanQuery(null).enabled).toBe(false);
		expect(importReviewQuery(null).enabled).toBe(false);
	});
});
