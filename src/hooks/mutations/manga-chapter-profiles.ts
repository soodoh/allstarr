// oxlint-disable explicit-module-boundary-types -- useMutation return type is complex generic
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  bulkMonitorMangaChapterProfileFn,
  bulkUnmonitorMangaChapterProfileFn,
} from "src/server/manga";
import { queryKeys } from "src/lib/query-keys";

export function useBulkMonitorMangaChapterProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { chapterIds: number[]; downloadProfileId: number }) =>
      bulkMonitorMangaChapterProfileFn({ data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.manga.all });
    },
    onError: () => toast.error("Failed to monitor chapters"),
  });
}

export function useBulkUnmonitorMangaChapterProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      chapterIds: number[];
      downloadProfileId: number;
      deleteFiles: boolean;
    }) => bulkUnmonitorMangaChapterProfileFn({ data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.manga.all });
    },
    onError: () => toast.error("Failed to unmonitor chapters"),
  });
}
