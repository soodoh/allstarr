import { QueryClient } from "@tanstack/react-query";
import { renderHook } from "src/test/render";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
	addMovieFn,
	deleteMovieFn,
	dismiss,
	error,
	invalidateQueries,
	loading,
	monitorMovieProfileFn,
	refreshMovieMetadataFn,
	success,
	unmonitorMovieProfileFn,
	updateMovieFn,
} = vi.hoisted(() => ({
	addMovieFn: vi.fn(),
	deleteMovieFn: vi.fn(),
	dismiss: vi.fn(),
	error: vi.fn(),
	invalidateQueries: vi.fn(),
	loading: vi.fn(),
	monitorMovieProfileFn: vi.fn(),
	refreshMovieMetadataFn: vi.fn(),
	success: vi.fn(),
	unmonitorMovieProfileFn: vi.fn(),
	updateMovieFn: vi.fn(),
}));

vi.mock("sonner", () => ({
	toast: {
		dismiss,
		error,
		loading,
		success,
	},
}));

vi.mock("src/server/movies", () => ({
	addMovieFn: (...args: unknown[]) => addMovieFn(...args),
	deleteMovieFn: (...args: unknown[]) => deleteMovieFn(...args),
	monitorMovieProfileFn: (...args: unknown[]) => monitorMovieProfileFn(...args),
	refreshMovieMetadataFn: (...args: unknown[]) =>
		refreshMovieMetadataFn(...args),
	unmonitorMovieProfileFn: (...args: unknown[]) =>
		unmonitorMovieProfileFn(...args),
	updateMovieFn: (...args: unknown[]) => updateMovieFn(...args),
}));

import { queryKeys } from "src/lib/query-keys";

import {
	useAddMovie,
	useDeleteMovie,
	useMonitorMovieProfile,
	useRefreshMovieMetadata,
	useUnmonitorMovieProfile,
	useUpdateMovie,
} from "./movies";

describe("mutations/movies", () => {
	beforeEach(() => {
		vi.spyOn(QueryClient.prototype, "invalidateQueries").mockImplementation(
			invalidateQueries,
		);
	});

	afterEach(() => {
		vi.restoreAllMocks();
		addMovieFn.mockReset();
		deleteMovieFn.mockReset();
		dismiss.mockReset();
		error.mockReset();
		invalidateQueries.mockReset();
		loading.mockReset();
		monitorMovieProfileFn.mockReset();
		refreshMovieMetadataFn.mockReset();
		success.mockReset();
		unmonitorMovieProfileFn.mockReset();
		updateMovieFn.mockReset();
	});

	it("wires movie imports and dismisses the loading toast on success", async () => {
		addMovieFn.mockResolvedValue({ ok: true });
		loading.mockReturnValue("submit-add-movie");

		const { result } = await renderHook(() => useAddMovie());

		await result.current.mutateAsync({
			downloadProfileIds: [2],
			minimumAvailability: "released",
			monitorOption: "movieOnly",
			searchOnAdd: true,
			tmdbId: 77,
		} as never);

		expect(addMovieFn).toHaveBeenCalledWith({
			data: {
				downloadProfileIds: [2],
				minimumAvailability: "released",
				monitorOption: "movieOnly",
				searchOnAdd: true,
				tmdbId: 77,
			},
		});
		expect(loading).toHaveBeenCalledWith("Starting movie import...", {
			id: "submit-add-movie",
		});
		expect(dismiss).toHaveBeenCalledWith("submit-add-movie");
	});

	it("shows the movie import fallback error toast when the mutation fails", async () => {
		addMovieFn.mockRejectedValue("nope");
		loading.mockReturnValue("submit-add-movie");

		const { result } = await renderHook(() => useAddMovie());

		await result.current
			.mutateAsync({
				downloadProfileIds: [2],
				minimumAvailability: "released",
				monitorOption: "movieOnly",
				searchOnAdd: false,
				tmdbId: 77,
			} as never)
			.catch(() => {});

		expect(error).toHaveBeenCalledWith("Failed to add movie", {
			id: "submit-add-movie",
		});
	});

	it("wires movie updates and invalidates the movies cache", async () => {
		updateMovieFn.mockResolvedValue({ ok: true });

		const { result } = await renderHook(() => useUpdateMovie());

		await result.current.mutateAsync({
			id: 13,
			downloadProfileIds: [4, 5],
			minimumAvailability: "released",
		} as never);

		expect(updateMovieFn).toHaveBeenCalledWith({
			data: {
				id: 13,
				downloadProfileIds: [4, 5],
				minimumAvailability: "released",
			},
		});
		expect(success).toHaveBeenCalledWith("Movie updated");
		expect(invalidateQueries).toHaveBeenCalledWith({
			queryKey: queryKeys.movies.all,
		});
	});

	it("shows the movie update error toast", async () => {
		updateMovieFn.mockRejectedValue(new Error("boom"));

		const { result } = await renderHook(() => useUpdateMovie());

		await result.current
			.mutateAsync({
				id: 13,
				downloadProfileIds: [4, 5],
			} as never)
			.catch(() => {});

		expect(error).toHaveBeenCalledWith("Failed to update movie");
	});

	it("wires movie deletes and invalidates all dependent caches", async () => {
		deleteMovieFn.mockResolvedValue({ ok: true });

		const { result } = await renderHook(() => useDeleteMovie());

		await result.current.mutateAsync({
			id: 22,
			deleteFiles: false,
		} as never);

		expect(deleteMovieFn).toHaveBeenCalledWith({
			data: { id: 22, deleteFiles: false },
		});
		expect(success).toHaveBeenCalledWith("Movie deleted");
		expect(invalidateQueries).toHaveBeenNthCalledWith(1, {
			queryKey: queryKeys.movies.all,
		});
		expect(invalidateQueries).toHaveBeenNthCalledWith(2, {
			queryKey: queryKeys.dashboard.all,
		});
		expect(invalidateQueries).toHaveBeenNthCalledWith(3, {
			queryKey: queryKeys.history.all,
		});
		expect(invalidateQueries).toHaveBeenNthCalledWith(4, {
			queryKey: queryKeys.movieCollections.all,
		});
	});

	it("shows the movie delete error toast", async () => {
		deleteMovieFn.mockRejectedValue("nope");

		const { result } = await renderHook(() => useDeleteMovie());

		await result.current
			.mutateAsync({
				id: 22,
				deleteFiles: false,
			} as never)
			.catch(() => {});

		expect(error).toHaveBeenCalledWith("Failed to delete movie");
	});

	it("wires movie metadata refreshes and invalidates the movies cache", async () => {
		refreshMovieMetadataFn.mockResolvedValue({ ok: true });

		const { result } = await renderHook(() => useRefreshMovieMetadata());

		await result.current.mutateAsync(99);

		expect(refreshMovieMetadataFn).toHaveBeenCalledWith({
			data: { movieId: 99 },
		});
		expect(success).toHaveBeenCalledWith("Movie metadata updated");
		expect(invalidateQueries).toHaveBeenCalledWith({
			queryKey: queryKeys.movies.all,
		});
	});

	it("shows the movie metadata refresh error toast", async () => {
		refreshMovieMetadataFn.mockRejectedValue(new Error("boom"));

		const { result } = await renderHook(() => useRefreshMovieMetadata());

		await result.current.mutateAsync(99).catch(() => {});

		expect(error).toHaveBeenCalledWith("Failed to refresh movie metadata");
	});

	it("wires movie monitor mutations and invalidates the movies cache", async () => {
		monitorMovieProfileFn.mockResolvedValue({ ok: true });

		const { result } = await renderHook(() => useMonitorMovieProfile());

		await result.current.mutateAsync({
			downloadProfileId: 5,
			movieId: 88,
		});

		expect(monitorMovieProfileFn).toHaveBeenCalledWith({
			data: { downloadProfileId: 5, movieId: 88 },
		});
		expect(invalidateQueries).toHaveBeenCalledWith({
			queryKey: queryKeys.movies.all,
		});
	});

	it("shows the movie monitor error toast", async () => {
		monitorMovieProfileFn.mockRejectedValue("nope");

		const { result } = await renderHook(() => useMonitorMovieProfile());

		await result.current
			.mutateAsync({
				downloadProfileId: 5,
				movieId: 88,
			})
			.catch(() => {});

		expect(error).toHaveBeenCalledWith("Failed to monitor movie profile");
	});

	it("wires movie unmonitor mutations and invalidates the movies cache", async () => {
		unmonitorMovieProfileFn.mockResolvedValue({ ok: true });

		const { result } = await renderHook(() => useUnmonitorMovieProfile());

		await result.current.mutateAsync({
			downloadProfileId: 5,
			movieId: 88,
		});

		expect(unmonitorMovieProfileFn).toHaveBeenCalledWith({
			data: { downloadProfileId: 5, movieId: 88 },
		});
		expect(invalidateQueries).toHaveBeenCalledWith({
			queryKey: queryKeys.movies.all,
		});
	});

	it("shows the movie unmonitor error toast", async () => {
		unmonitorMovieProfileFn.mockRejectedValue(new Error("boom"));

		const { result } = await renderHook(() => useUnmonitorMovieProfile());

		await result.current
			.mutateAsync({
				downloadProfileId: 5,
				movieId: 88,
			})
			.catch(() => {});

		expect(error).toHaveBeenCalledWith("Failed to unmonitor movie profile");
	});
});
