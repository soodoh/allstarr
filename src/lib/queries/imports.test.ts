import { requireValue } from "src/test/require-value";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	getImportSourcesFn: vi.fn(),
}));

vi.mock("src/server/import-sources", () => ({
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

	it("builds the placeholder plan query as disabled", async () => {
		const options = importPlanQuery(7);

		expect(options.queryKey).toStrictEqual(["imports", "plan", 7]);
		expect(options.enabled).toBe(false);
		const queryFn = requireValue(options.queryFn);
		await expect(queryFn({} as never)).resolves.toEqual([]);
	});

	it("builds the placeholder review query as disabled", async () => {
		const options = importReviewQuery(9);

		expect(options.queryKey).toStrictEqual(["imports", "review", 9]);
		expect(options.enabled).toBe(false);
		const queryFn = requireValue(options.queryFn);
		await expect(queryFn({} as never)).resolves.toEqual([]);
	});
});
