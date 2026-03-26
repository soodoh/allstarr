// oxlint-disable explicit-module-boundary-types -- useMutation return type is complex generic
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  addShowFn,
  updateShowFn,
  deleteShowFn,
  refreshShowMetadataFn,
  monitorShowProfileFn,
  unmonitorShowProfileFn,
} from "src/server/shows";
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

export function useMonitorShowProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { showId: number; downloadProfileId: number }) =>
      monitorShowProfileFn({ data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.shows.all });
    },
    onError: () => toast.error("Failed to monitor show profile"),
  });
}

export function useUnmonitorShowProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { showId: number; downloadProfileId: number }) =>
      unmonitorShowProfileFn({ data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.shows.all });
    },
    onError: () => toast.error("Failed to unmonitor show profile"),
  });
}

export function useRefreshShowMetadata() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (showId: number) => refreshShowMetadataFn({ data: { showId } }),
    onSuccess: () => {
      toast.success("Show metadata updated");
      queryClient.invalidateQueries({ queryKey: queryKeys.shows.all });
    },
    onError: () => toast.error("Failed to refresh show metadata"),
  });
}
