import { QueryClient } from "@tanstack/react-query";
import { runMutation } from "src/test/mutations";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
	bulkMonitorEpisodeProfileFn,
	bulkUnmonitorEpisodeProfileFn,
	error,
	invalidateQueries,
	monitorEpisodeProfileFn,
	success,
	unmonitorEpisodeProfileFn,
} = vi.hoisted(() => ({
	bulkMonitorEpisodeProfileFn: vi.fn(),
	bulkUnmonitorEpisodeProfileFn: vi.fn(),
	error: vi.fn(),
	invalidateQueries: vi.fn(),
	monitorEpisodeProfileFn: vi.fn(),
	success: vi.fn(),
	unmonitorEpisodeProfileFn: vi.fn(),
}));

vi.mock("sonner", () => ({
	toast: {
		error,
		success,
	},
}));

vi.mock("src/server/shows", () => ({
	bulkMonitorEpisodeProfileFn: (...args: unknown[]) =>
		bulkMonitorEpisodeProfileFn(...args),
	bulkUnmonitorEpisodeProfileFn: (...args: unknown[]) =>
		bulkUnmonitorEpisodeProfileFn(...args),
	monitorEpisodeProfileFn: (...args: unknown[]) =>
		monitorEpisodeProfileFn(...args),
	unmonitorEpisodeProfileFn: (...args: unknown[]) =>
		unmonitorEpisodeProfileFn(...args),
}));

import { queryKeys } from "src/lib/query-keys";

import {
	useBulkMonitorEpisodeProfile,
	useBulkUnmonitorEpisodeProfile,
	useMonitorEpisodeProfile,
	useUnmonitorEpisodeProfile,
} from "./episode-profiles";

describe("mutations/episode-profiles", () => {
	beforeEach(() => {
		vi.spyOn(QueryClient.prototype, "invalidateQueries").mockImplementation(
			invalidateQueries,
		);
	});

	afterEach(() => {
		vi.restoreAllMocks();
		bulkMonitorEpisodeProfileFn.mockReset();
		bulkUnmonitorEpisodeProfileFn.mockReset();
		error.mockReset();
		invalidateQueries.mockReset();
		monitorEpisodeProfileFn.mockReset();
		success.mockReset();
		unmonitorEpisodeProfileFn.mockReset();
	});

	it.each([
		{
			name: "monitor an episode profile",
			hook: useMonitorEpisodeProfile,
			fn: monitorEpisodeProfileFn,
			variables: { episodeId: 1, downloadProfileId: 2 },
			call: { data: { episodeId: 1, downloadProfileId: 2 } },
		},
		{
			name: "unmonitor an episode profile",
			hook: useUnmonitorEpisodeProfile,
			fn: unmonitorEpisodeProfileFn,
			variables: { episodeId: 3, downloadProfileId: 4, deleteFiles: true },
			call: { data: { episodeId: 3, downloadProfileId: 4, deleteFiles: true } },
		},
		{
			name: "bulk monitor episode profiles",
			hook: useBulkMonitorEpisodeProfile,
			fn: bulkMonitorEpisodeProfileFn,
			variables: { episodeIds: [5, 6], downloadProfileId: 7 },
			call: { data: { episodeIds: [5, 6], downloadProfileId: 7 } },
		},
		{
			name: "bulk unmonitor episode profiles",
			hook: useBulkUnmonitorEpisodeProfile,
			fn: bulkUnmonitorEpisodeProfileFn,
			variables: {
				episodeIds: [8, 9],
				downloadProfileId: 10,
				deleteFiles: false,
			},
			call: {
				data: {
					episodeIds: [8, 9],
					downloadProfileId: 10,
					deleteFiles: false,
				},
			},
		},
	])("wires $name mutations and invalidates the shows cache", async ({
		hook,
		fn,
		variables,
		call,
	}) => {
		fn.mockResolvedValue({ ok: true });

		await runMutation(hook, variables);

		expect(fn).toHaveBeenCalledWith(call);
		expect(invalidateQueries).toHaveBeenCalledWith({
			queryKey: queryKeys.shows.all,
		});
	});

	it.each([
		{
			name: "monitor an episode profile",
			hook: useMonitorEpisodeProfile,
			fn: monitorEpisodeProfileFn,
			variables: { episodeId: 11, downloadProfileId: 12 },
			errorText: "Failed to monitor episode",
		},
		{
			name: "unmonitor an episode profile",
			hook: useUnmonitorEpisodeProfile,
			fn: unmonitorEpisodeProfileFn,
			variables: { episodeId: 13, downloadProfileId: 14, deleteFiles: true },
			errorText: "Failed to unmonitor episode",
		},
		{
			name: "bulk monitor episode profiles",
			hook: useBulkMonitorEpisodeProfile,
			fn: bulkMonitorEpisodeProfileFn,
			variables: { episodeIds: [15, 16], downloadProfileId: 17 },
			errorText: "Failed to monitor episodes",
		},
		{
			name: "bulk unmonitor episode profiles",
			hook: useBulkUnmonitorEpisodeProfile,
			fn: bulkUnmonitorEpisodeProfileFn,
			variables: {
				episodeIds: [18, 19],
				downloadProfileId: 20,
				deleteFiles: false,
			},
			errorText: "Failed to unmonitor episodes",
		},
	])("shows the $name error toast when the mutation fails", async ({
		hook,
		fn,
		variables,
		errorText,
	}) => {
		fn.mockRejectedValue(new Error("boom"));

		await runMutation(hook, variables, true);

		expect(error).toHaveBeenCalledWith(errorText);
	});
});
