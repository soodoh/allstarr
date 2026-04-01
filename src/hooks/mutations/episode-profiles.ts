import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { queryKeys } from "src/lib/query-keys";
import {
	bulkMonitorEpisodeProfileFn,
	bulkUnmonitorEpisodeProfileFn,
	monitorEpisodeProfileFn,
	unmonitorEpisodeProfileFn,
} from "src/server/shows";

export function useMonitorEpisodeProfile() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (data: { episodeId: number; downloadProfileId: number }) =>
			monitorEpisodeProfileFn({ data }),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.shows.all });
		},
		onError: () => toast.error("Failed to monitor episode"),
	});
}

export function useUnmonitorEpisodeProfile() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (data: {
			episodeId: number;
			downloadProfileId: number;
			deleteFiles: boolean;
		}) => unmonitorEpisodeProfileFn({ data }),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.shows.all });
		},
		onError: () => toast.error("Failed to unmonitor episode"),
	});
}

export function useBulkMonitorEpisodeProfile() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (data: { episodeIds: number[]; downloadProfileId: number }) =>
			bulkMonitorEpisodeProfileFn({ data }),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.shows.all });
		},
		onError: () => toast.error("Failed to monitor episodes"),
	});
}

export function useBulkUnmonitorEpisodeProfile() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (data: {
			episodeIds: number[];
			downloadProfileId: number;
			deleteFiles: boolean;
		}) => bulkUnmonitorEpisodeProfileFn({ data }),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.shows.all });
		},
		onError: () => toast.error("Failed to unmonitor episodes"),
	});
}
