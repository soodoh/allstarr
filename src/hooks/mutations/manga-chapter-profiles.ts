import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { queryKeys } from "src/lib/query-keys";
import {
	bulkMonitorMangaChaptersFn,
	bulkUnmonitorMangaChaptersFn,
} from "src/server/manga";

export function useBulkMonitorMangaChapters() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (data: { chapterIds: number[] }) =>
			bulkMonitorMangaChaptersFn({ data }),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.manga.all });
		},
		onError: () => toast.error("Failed to monitor chapters"),
	});
}

export function useBulkUnmonitorMangaChapters() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (data: { chapterIds: number[]; deleteFiles: boolean }) =>
			bulkUnmonitorMangaChaptersFn({ data }),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.manga.all });
		},
		onError: () => toast.error("Failed to unmonitor chapters"),
	});
}
