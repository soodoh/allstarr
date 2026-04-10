import { QueryClient } from "@tanstack/react-query";
import { renderHook } from "src/test/render";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
	addShowFn,
	deleteShowFn,
	dismiss,
	error,
	invalidateQueries,
	loading,
	monitorShowProfileFn,
	refreshShowMetadataFn,
	success,
	unmonitorShowProfileFn,
	updateShowFn,
} = vi.hoisted(() => ({
	addShowFn: vi.fn(),
	deleteShowFn: vi.fn(),
	dismiss: vi.fn(),
	error: vi.fn(),
	invalidateQueries: vi.fn(),
	loading: vi.fn(),
	monitorShowProfileFn: vi.fn(),
	refreshShowMetadataFn: vi.fn(),
	success: vi.fn(),
	unmonitorShowProfileFn: vi.fn(),
	updateShowFn: vi.fn(),
}));

vi.mock("sonner", () => ({
	toast: {
		dismiss,
		error,
		loading,
		success,
	},
}));

vi.mock("src/server/shows", () => ({
	addShowFn: (...args: unknown[]) => addShowFn(...args),
	deleteShowFn: (...args: unknown[]) => deleteShowFn(...args),
	monitorShowProfileFn: (...args: unknown[]) => monitorShowProfileFn(...args),
	refreshShowMetadataFn: (...args: unknown[]) => refreshShowMetadataFn(...args),
	unmonitorShowProfileFn: (...args: unknown[]) =>
		unmonitorShowProfileFn(...args),
	updateShowFn: (...args: unknown[]) => updateShowFn(...args),
}));

import { queryKeys } from "src/lib/query-keys";

import {
	useAddShow,
	useDeleteShow,
	useMonitorShowProfile,
	useRefreshShowMetadata,
	useUnmonitorShowProfile,
	useUpdateShow,
} from "./shows";

describe("mutations/shows", () => {
	beforeEach(() => {
		vi.spyOn(QueryClient.prototype, "invalidateQueries").mockImplementation(
			invalidateQueries,
		);
	});

	afterEach(() => {
		vi.restoreAllMocks();
		addShowFn.mockReset();
		deleteShowFn.mockReset();
		dismiss.mockReset();
		error.mockReset();
		invalidateQueries.mockReset();
		loading.mockReset();
		monitorShowProfileFn.mockReset();
		refreshShowMetadataFn.mockReset();
		success.mockReset();
		unmonitorShowProfileFn.mockReset();
		updateShowFn.mockReset();
	});

	it("wires show imports and dismisses the loading toast on success", async () => {
		addShowFn.mockResolvedValue({ ok: true });
		loading.mockReturnValue("submit-add-show");

		const { result } = await renderHook(() => useAddShow());

		await result.current.mutateAsync({
			downloadProfileIds: [3],
			episodeGroupId: null,
			monitorOption: "none",
			searchCutoffUnmet: false,
			searchOnAdd: true,
			seriesType: "standard",
			tmdbId: 15,
			useSeasonFolder: true,
		} as never);

		expect(addShowFn).toHaveBeenCalledWith({
			data: {
				tmdbId: 15,
				downloadProfileIds: [3],
				episodeGroupId: null,
				monitorOption: "none",
				searchCutoffUnmet: false,
				searchOnAdd: true,
				seriesType: "standard",
				useSeasonFolder: true,
			},
		});

		expect(loading).toHaveBeenCalledWith("Starting show import...", {
			id: "submit-add-show",
		});
		expect(dismiss).toHaveBeenCalledWith("submit-add-show");
	});

	it("shows the show import fallback error toast when the mutation fails", async () => {
		addShowFn.mockRejectedValue("nope");
		loading.mockReturnValue("submit-add-show");

		const { result } = await renderHook(() => useAddShow());

		await result.current
			.mutateAsync({
				downloadProfileIds: [3],
				episodeGroupId: null,
				monitorOption: "none",
				searchCutoffUnmet: false,
				searchOnAdd: false,
				seriesType: "standard",
				tmdbId: 15,
				useSeasonFolder: true,
			} as never)
			.catch(() => {});

		expect(error).toHaveBeenCalledWith("Failed to add show", {
			id: "submit-add-show",
		});
	});

	it("wires show updates and invalidates the shows cache", async () => {
		updateShowFn.mockResolvedValue({ ok: true });

		const { result } = await renderHook(() => useUpdateShow());

		await result.current.mutateAsync({
			id: 14,
			downloadProfileIds: [6],
			episodeGroupId: null,
			seriesType: "anime",
		} as never);

		expect(updateShowFn).toHaveBeenCalledWith({
			data: {
				id: 14,
				downloadProfileIds: [6],
				episodeGroupId: null,
				seriesType: "anime",
			},
		});
		expect(success).toHaveBeenCalledWith("Show updated");
		expect(invalidateQueries).toHaveBeenCalledWith({
			queryKey: queryKeys.shows.all,
		});
	});

	it("shows the show update error toast", async () => {
		updateShowFn.mockRejectedValue(new Error("boom"));

		const { result } = await renderHook(() => useUpdateShow());

		await result.current
			.mutateAsync({
				id: 14,
				downloadProfileIds: [6],
			} as never)
			.catch(() => {});

		expect(error).toHaveBeenCalledWith("Failed to update show");
	});

	it("wires show deletes and invalidates all dependent caches", async () => {
		deleteShowFn.mockResolvedValue({ ok: true });

		const { result } = await renderHook(() => useDeleteShow());

		await result.current.mutateAsync({ deleteFiles: false, id: 21 } as never);

		expect(deleteShowFn).toHaveBeenCalledWith({
			data: { deleteFiles: false, id: 21 },
		});
		expect(success).toHaveBeenCalledWith("Show deleted");
		expect(invalidateQueries).toHaveBeenNthCalledWith(1, {
			queryKey: queryKeys.shows.all,
		});
		expect(invalidateQueries).toHaveBeenNthCalledWith(2, {
			queryKey: queryKeys.dashboard.all,
		});
		expect(invalidateQueries).toHaveBeenNthCalledWith(3, {
			queryKey: queryKeys.history.all,
		});
	});

	it("shows the show delete error toast", async () => {
		deleteShowFn.mockRejectedValue("nope");

		const { result } = await renderHook(() => useDeleteShow());

		await result.current
			.mutateAsync({ deleteFiles: false, id: 21 } as never)
			.catch(() => {});

		expect(error).toHaveBeenCalledWith("Failed to delete show");
	});

	it("wires show monitor mutations and invalidates the shows cache", async () => {
		monitorShowProfileFn.mockResolvedValue({ ok: true });

		const { result } = await renderHook(() => useMonitorShowProfile());

		await result.current.mutateAsync({
			downloadProfileId: 7,
			showId: 34,
		});

		expect(monitorShowProfileFn).toHaveBeenCalledWith({
			data: { downloadProfileId: 7, showId: 34 },
		});
		expect(invalidateQueries).toHaveBeenCalledWith({
			queryKey: queryKeys.shows.all,
		});
	});

	it("shows the show monitor error toast", async () => {
		monitorShowProfileFn.mockRejectedValue(new Error("boom"));

		const { result } = await renderHook(() => useMonitorShowProfile());

		await result.current
			.mutateAsync({
				downloadProfileId: 7,
				showId: 34,
			})
			.catch(() => {});

		expect(error).toHaveBeenCalledWith("Failed to monitor show profile");
	});

	it("wires show unmonitor mutations and invalidates the shows cache", async () => {
		unmonitorShowProfileFn.mockResolvedValue({ ok: true });

		const { result } = await renderHook(() => useUnmonitorShowProfile());

		await result.current.mutateAsync({
			downloadProfileId: 7,
			showId: 34,
		});

		expect(unmonitorShowProfileFn).toHaveBeenCalledWith({
			data: { downloadProfileId: 7, showId: 34 },
		});
		expect(invalidateQueries).toHaveBeenCalledWith({
			queryKey: queryKeys.shows.all,
		});
	});

	it("shows the show unmonitor error toast", async () => {
		unmonitorShowProfileFn.mockRejectedValue("nope");

		const { result } = await renderHook(() => useUnmonitorShowProfile());

		await result.current
			.mutateAsync({
				downloadProfileId: 7,
				showId: 34,
			})
			.catch(() => {});

		expect(error).toHaveBeenCalledWith("Failed to unmonitor show profile");
	});

	it("wires show metadata refreshes and invalidates the shows cache", async () => {
		refreshShowMetadataFn.mockResolvedValue({ ok: true });

		const { result } = await renderHook(() => useRefreshShowMetadata());

		await result.current.mutateAsync(66);

		expect(refreshShowMetadataFn).toHaveBeenCalledWith({
			data: { showId: 66 },
		});
		expect(success).toHaveBeenCalledWith("Show metadata updated");
		expect(invalidateQueries).toHaveBeenCalledWith({
			queryKey: queryKeys.shows.all,
		});
	});

	it("shows the show metadata refresh error toast", async () => {
		refreshShowMetadataFn.mockRejectedValue(new Error("boom"));

		const { result } = await renderHook(() => useRefreshShowMetadata());

		await result.current.mutateAsync(66).catch(() => {});

		expect(error).toHaveBeenCalledWith("Failed to refresh show metadata");
	});
});
