import { QueryClient } from "@tanstack/react-query";
import { act } from "@testing-library/react";
import { renderHook } from "src/test/render";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
	addMissingCollectionMoviesFn,
	addMovieImportExclusionFn,
	error,
	invalidateQueries,
	refreshCollectionsFn,
	success,
	updateMovieCollectionFn,
} = vi.hoisted(() => ({
	addMissingCollectionMoviesFn: vi.fn(),
	addMovieImportExclusionFn: vi.fn(),
	error: vi.fn(),
	invalidateQueries: vi.fn(),
	refreshCollectionsFn: vi.fn(),
	success: vi.fn(),
	updateMovieCollectionFn: vi.fn(),
}));

vi.mock("sonner", () => ({
	toast: {
		error,
		success,
	},
}));

vi.mock("src/server/movie-collections", () => ({
	addMissingCollectionMoviesFn: (...args: unknown[]) =>
		addMissingCollectionMoviesFn(...args),
	addMovieImportExclusionFn: (...args: unknown[]) =>
		addMovieImportExclusionFn(...args),
	refreshCollectionsFn: (...args: unknown[]) => refreshCollectionsFn(...args),
	updateMovieCollectionFn: (...args: unknown[]) =>
		updateMovieCollectionFn(...args),
}));

import { queryKeys } from "src/lib/query-keys";

import {
	useAddMissingCollectionMovies,
	useAddMovieImportExclusion,
	useRefreshCollections,
	useUpdateMovieCollection,
} from "./movie-collections";

describe("mutations/movie-collections", () => {
	beforeEach(() => {
		vi.spyOn(QueryClient.prototype, "invalidateQueries").mockImplementation(
			invalidateQueries,
		);
	});

	afterEach(() => {
		vi.restoreAllMocks();
		addMissingCollectionMoviesFn.mockReset();
		addMovieImportExclusionFn.mockReset();
		error.mockReset();
		invalidateQueries.mockReset();
		refreshCollectionsFn.mockReset();
		success.mockReset();
		updateMovieCollectionFn.mockReset();
	});

	it("wires collection updates and invalidates the collection cache", async () => {
		updateMovieCollectionFn.mockResolvedValue({ success: true });

		const { result } = renderHook(() => useUpdateMovieCollection());

		await act(async () => {
			await result.current.mutateAsync({
				id: 5,
				downloadProfileIds: [1, 2],
				minimumAvailability: "released",
			} as never);
		});

		expect(updateMovieCollectionFn).toHaveBeenCalledWith({
			data: {
				id: 5,
				downloadProfileIds: [1, 2],
				minimumAvailability: "released",
			},
		});
		expect(success).toHaveBeenCalledWith("Collection updated");
		expect(invalidateQueries).toHaveBeenCalledWith({
			queryKey: queryKeys.movieCollections.all,
		});
	});

	it("shows the collection update error toast", async () => {
		updateMovieCollectionFn.mockRejectedValue(new Error("boom"));

		const { result } = renderHook(() => useUpdateMovieCollection());

		await act(async () => {
			await result.current.mutateAsync({ id: 5 } as never).catch(() => {});
		});

		expect(error).toHaveBeenCalledWith("Failed to update collection");
	});

	it("announces refreshes that add movies and invalidates dependent caches", async () => {
		refreshCollectionsFn.mockResolvedValue({ added: 2 });

		const { result } = renderHook(() => useRefreshCollections());

		await act(async () => {
			await result.current.mutateAsync(undefined);
		});

		expect(refreshCollectionsFn).toHaveBeenCalledWith();
		expect(success).toHaveBeenCalledWith(
			"Refreshed collections, added 2 movies",
		);
		expect(invalidateQueries).toHaveBeenNthCalledWith(1, {
			queryKey: queryKeys.movieCollections.all,
		});
		expect(invalidateQueries).toHaveBeenNthCalledWith(2, {
			queryKey: queryKeys.movies.all,
		});
	});

	it("announces refreshes that add no movies", async () => {
		refreshCollectionsFn.mockResolvedValue({ added: 0 });

		const { result } = renderHook(() => useRefreshCollections());

		await act(async () => {
			await result.current.mutateAsync(undefined);
		});

		expect(success).toHaveBeenCalledWith(
			"Collections refreshed, no new movies",
		);
	});

	it("shows the refresh collections error toast", async () => {
		refreshCollectionsFn.mockRejectedValue("nope");

		const { result } = renderHook(() => useRefreshCollections());

		await act(async () => {
			await result.current.mutateAsync(undefined).catch(() => {});
		});

		expect(error).toHaveBeenCalledWith("Failed to refresh collections");
	});

	it("announces added missing movies and invalidates all dependent caches", async () => {
		addMissingCollectionMoviesFn.mockResolvedValue({ added: 1 });

		const { result } = renderHook(() => useAddMissingCollectionMovies());

		await act(async () => {
			await result.current.mutateAsync({
				collectionId: 9,
				downloadProfileIds: [1],
				minimumAvailability: "released",
				monitorOption: "movieAndCollection",
			} as never);
		});

		expect(addMissingCollectionMoviesFn).toHaveBeenCalledWith({
			data: {
				collectionId: 9,
				downloadProfileIds: [1],
				minimumAvailability: "released",
				monitorOption: "movieAndCollection",
			},
		});
		expect(success).toHaveBeenCalledWith("Added 1 movie");
		expect(invalidateQueries).toHaveBeenNthCalledWith(1, {
			queryKey: queryKeys.movieCollections.all,
		});
		expect(invalidateQueries).toHaveBeenNthCalledWith(2, {
			queryKey: queryKeys.movies.all,
		});
		expect(invalidateQueries).toHaveBeenNthCalledWith(3, {
			queryKey: queryKeys.history.all,
		});
	});

	it("announces when there are no missing movies to add", async () => {
		addMissingCollectionMoviesFn.mockResolvedValue({ added: 0 });

		const { result } = renderHook(() => useAddMissingCollectionMovies());

		await act(async () => {
			await result.current.mutateAsync({
				collectionId: 9,
				downloadProfileIds: [],
				minimumAvailability: "released",
				monitorOption: "none",
			} as never);
		});

		expect(success).toHaveBeenCalledWith("No new movies to add");
	});

	it("shows the add-missing-movies error toast", async () => {
		addMissingCollectionMoviesFn.mockRejectedValue(new Error("boom"));

		const { result } = renderHook(() => useAddMissingCollectionMovies());

		await act(async () => {
			await result.current
				.mutateAsync({
					collectionId: 9,
					downloadProfileIds: [],
					minimumAvailability: "released",
					monitorOption: "none",
				} as never)
				.catch(() => {});
		});

		expect(error).toHaveBeenCalledWith("Failed to add missing movies");
	});

	it("wires import exclusions and invalidates the movie collections cache", async () => {
		addMovieImportExclusionFn.mockResolvedValue({ ok: true });

		const { result } = renderHook(() => useAddMovieImportExclusion());

		await act(async () => {
			await result.current.mutateAsync({
				tmdbId: 44,
				title: "Inception",
			} as never);
		});

		expect(addMovieImportExclusionFn).toHaveBeenCalledWith({
			data: { tmdbId: 44, title: "Inception" },
		});
		expect(success).toHaveBeenCalledWith("Movie excluded from import");
		expect(invalidateQueries).toHaveBeenCalledWith({
			queryKey: queryKeys.movieCollections.all,
		});
	});

	it("shows the import exclusion error toast", async () => {
		addMovieImportExclusionFn.mockRejectedValue("nope");

		const { result } = renderHook(() => useAddMovieImportExclusion());

		await act(async () => {
			await result.current
				.mutateAsync({
					tmdbId: 44,
					title: "Inception",
				} as never)
				.catch(() => {});
		});

		expect(error).toHaveBeenCalledWith("Failed to exclude movie");
	});
});
