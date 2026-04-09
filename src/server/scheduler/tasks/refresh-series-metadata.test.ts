import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	registerTask: vi.fn(),
	refreshSeriesInternal: vi.fn(),
}));

vi.mock("../registry", () => ({
	registerTask: mocks.registerTask,
}));

vi.mock("src/server/series", () => ({
	refreshSeriesInternal: mocks.refreshSeriesInternal,
}));

// Import to trigger registerTask at module level
await import("./refresh-series-metadata");

const taskDef = mocks.registerTask.mock.calls[0][0];
const handler = taskDef.handler;

describe("refresh-series-metadata task", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("registers with correct metadata", () => {
		expect(taskDef.id).toBe("refresh-series-metadata");
		expect(taskDef.name).toBe("Refresh Series Metadata");
		expect(taskDef.group).toBe("metadata");
		expect(taskDef.defaultInterval).toBe(12 * 60 * 60);
	});

	it("returns 'No monitored series' when 0 series refreshed", async () => {
		mocks.refreshSeriesInternal.mockResolvedValue({
			seriesRefreshed: 0,
			booksAdded: 0,
			authorsImported: 0,
			errors: [],
		});

		const result = await handler(vi.fn());

		expect(result).toEqual({ success: true, message: "No monitored series" });
	});

	it("builds message with series count only when no books or authors", async () => {
		mocks.refreshSeriesInternal.mockResolvedValue({
			seriesRefreshed: 3,
			booksAdded: 0,
			authorsImported: 0,
			errors: [],
		});

		const result = await handler(vi.fn());

		expect(result).toEqual({
			success: true,
			message: "Refreshed 3 series",
		});
	});

	it("includes books added in the message", async () => {
		mocks.refreshSeriesInternal.mockResolvedValue({
			seriesRefreshed: 2,
			booksAdded: 5,
			authorsImported: 0,
			errors: [],
		});

		const result = await handler(vi.fn());

		expect(result).toEqual({
			success: true,
			message: "Refreshed 2 series, 5 books added",
		});
	});

	it("includes authors imported in the message", async () => {
		mocks.refreshSeriesInternal.mockResolvedValue({
			seriesRefreshed: 1,
			booksAdded: 0,
			authorsImported: 3,
			errors: [],
		});

		const result = await handler(vi.fn());

		expect(result).toEqual({
			success: true,
			message: "Refreshed 1 series, 3 authors imported",
		});
	});

	it("includes all counts in the message", async () => {
		mocks.refreshSeriesInternal.mockResolvedValue({
			seriesRefreshed: 4,
			booksAdded: 10,
			authorsImported: 2,
			errors: [],
		});

		const result = await handler(vi.fn());

		expect(result).toEqual({
			success: true,
			message: "Refreshed 4 series, 10 books added, 2 authors imported",
		});
	});

	it("reports errors in the message and sets success to false", async () => {
		mocks.refreshSeriesInternal.mockResolvedValue({
			seriesRefreshed: 3,
			booksAdded: 2,
			authorsImported: 1,
			errors: ["Failed to fetch series X", "Timeout on series Y"],
		});

		const result = await handler(vi.fn());

		expect(result).toEqual({
			success: false,
			message:
				"Refreshed 3 series, 2 books added, 1 authors imported, 2 errors",
		});
	});

	it("reports errors even with no books or authors added", async () => {
		mocks.refreshSeriesInternal.mockResolvedValue({
			seriesRefreshed: 1,
			booksAdded: 0,
			authorsImported: 0,
			errors: ["API rate limit exceeded"],
		});

		const result = await handler(vi.fn());

		expect(result).toEqual({
			success: false,
			message: "Refreshed 1 series, 1 errors",
		});
	});
});
