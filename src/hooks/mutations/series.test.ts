import { QueryClient } from "@tanstack/react-query";
import { renderHook } from "src/test/render";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { error, invalidateQueries, refreshSeriesFn, success, updateSeriesFn } =
	vi.hoisted(() => ({
		error: vi.fn(),
		invalidateQueries: vi.fn(),
		refreshSeriesFn: vi.fn(),
		success: vi.fn(),
		updateSeriesFn: vi.fn(),
	}));

vi.mock("sonner", () => ({
	toast: {
		error,
		success,
	},
}));

vi.mock("src/server/series", () => ({
	refreshSeriesFn: (...args: unknown[]) => refreshSeriesFn(...args),
	updateSeriesFn: (...args: unknown[]) => updateSeriesFn(...args),
}));

import { queryKeys } from "src/lib/query-keys";

import { useRefreshSeries, useUpdateSeries } from "./series";

describe("mutations/series", () => {
	beforeEach(() => {
		vi.spyOn(QueryClient.prototype, "invalidateQueries").mockImplementation(
			invalidateQueries,
		);
	});

	afterEach(() => {
		vi.restoreAllMocks();
		error.mockReset();
		invalidateQueries.mockReset();
		refreshSeriesFn.mockReset();
		success.mockReset();
		updateSeriesFn.mockReset();
	});

	it("wires update series mutations and success handling", async () => {
		updateSeriesFn.mockResolvedValue({ ok: true });

		const { result } = await renderHook(() => useUpdateSeries());

		await result.current.mutateAsync({ id: 4 } as never);

		expect(updateSeriesFn).toHaveBeenCalledWith({ data: { id: 4 } });
		expect(success).toHaveBeenCalledWith("Series updated");
		expect(invalidateQueries).toHaveBeenNthCalledWith(1, {
			queryKey: queryKeys.series.all,
		});
		expect(invalidateQueries).toHaveBeenNthCalledWith(2, {
			queryKey: queryKeys.authors.all,
		});
	});

	it("shows the series update error toast", async () => {
		updateSeriesFn.mockRejectedValue(new Error("boom"));

		const { result } = await renderHook(() => useUpdateSeries());

		await result.current.mutateAsync({ id: 4 } as never).catch(() => {});

		expect(error).toHaveBeenCalledWith("Failed to update series");
	});

	it("announces when a refresh adds books", async () => {
		refreshSeriesFn.mockResolvedValue({ booksAdded: 2 });

		const { result } = await renderHook(() => useRefreshSeries());

		await result.current.mutateAsync({ seriesId: 8 });

		expect(refreshSeriesFn).toHaveBeenCalledWith({
			data: { seriesId: 8 },
		});
		expect(success).toHaveBeenCalledWith("Refreshed series, added 2 books");
		expect(invalidateQueries).toHaveBeenNthCalledWith(1, {
			queryKey: queryKeys.series.all,
		});
		expect(invalidateQueries).toHaveBeenNthCalledWith(2, {
			queryKey: queryKeys.books.all,
		});
		expect(invalidateQueries).toHaveBeenNthCalledWith(3, {
			queryKey: queryKeys.authors.all,
		});
		expect(invalidateQueries).toHaveBeenNthCalledWith(4, {
			queryKey: queryKeys.history.all,
		});
	});

	it("announces when a refresh adds no books", async () => {
		refreshSeriesFn.mockResolvedValue({ booksAdded: 0 });

		const { result } = await renderHook(() => useRefreshSeries());

		await result.current.mutateAsync(undefined);

		expect(success).toHaveBeenCalledWith("Series refreshed, no new books");
	});

	it("shows the series refresh error toast", async () => {
		refreshSeriesFn.mockRejectedValue("nope");

		const { result } = await renderHook(() => useRefreshSeries());

		await result.current.mutateAsync(undefined).catch(() => {});

		expect(error).toHaveBeenCalledWith("Failed to refresh series");
	});
});
