// oxlint-disable explicit-module-boundary-types -- useMutation return type is complex generic
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { addShowFn, updateShowFn, deleteShowFn } from "src/server/shows";
import { queryKeys } from "src/lib/query-keys";
import type {
  addShowSchema,
  updateShowSchema,
  deleteShowSchema,
} from "src/lib/tmdb-validators";
import type { z } from "zod";

export function useAddShow() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: z.infer<typeof addShowSchema>) => addShowFn({ data }),
    onSuccess: () => {
      toast.success("Show added");
      queryClient.invalidateQueries({ queryKey: queryKeys.shows.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.history.all });
    },
    onError: () => toast.error("Failed to add show"),
  });
}

export function useUpdateShow() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: z.infer<typeof updateShowSchema>) =>
      updateShowFn({ data }),
    onSuccess: () => {
      toast.success("Show updated");
      queryClient.invalidateQueries({ queryKey: queryKeys.shows.all });
    },
    onError: () => toast.error("Failed to update show"),
  });
}

export function useDeleteShow() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: z.infer<typeof deleteShowSchema>) =>
      deleteShowFn({ data }),
    onSuccess: () => {
      toast.success("Show deleted");
      queryClient.invalidateQueries({ queryKey: queryKeys.shows.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.history.all });
    },
    onError: () => toast.error("Failed to delete show"),
  });
}
