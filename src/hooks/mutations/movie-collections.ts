// oxlint-disable explicit-module-boundary-types -- useMutation return type is complex generic
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  updateMovieCollectionFn,
  refreshCollectionsFn,
  addMissingCollectionMoviesFn,
  addMovieImportExclusionFn,
} from "src/server/movie-collections";
import { queryKeys } from "src/lib/query-keys";
import type {
  updateMovieCollectionSchema,
  addMissingCollectionMoviesSchema,
  addMovieImportExclusionSchema,
} from "src/lib/tmdb-validators";
import type { z } from "zod";

export function useUpdateMovieCollection() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: z.infer<typeof updateMovieCollectionSchema>) =>
      updateMovieCollectionFn({ data }),
    onSuccess: () => {
      toast.success("Collection updated");
      queryClient.invalidateQueries({
        queryKey: queryKeys.movieCollections.all,
      });
    },
    onError: () => toast.error("Failed to update collection"),
  });
}

export function useRefreshCollections() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => refreshCollectionsFn(),
    onSuccess: (data) => {
      toast.success(
        data.added > 0
          ? `Refreshed collections, added ${data.added} movie${data.added === 1 ? "" : "s"}`
          : "Collections refreshed, no new movies",
      );
      queryClient.invalidateQueries({
        queryKey: queryKeys.movieCollections.all,
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.movies.all });
    },
    onError: () => toast.error("Failed to refresh collections"),
  });
}

export function useAddMissingCollectionMovies() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: z.infer<typeof addMissingCollectionMoviesSchema>) =>
      addMissingCollectionMoviesFn({ data }),
    onSuccess: (data) => {
      toast.success(
        data.added > 0
          ? `Added ${data.added} movie${data.added === 1 ? "" : "s"}`
          : "No new movies to add",
      );
      queryClient.invalidateQueries({
        queryKey: queryKeys.movieCollections.all,
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.movies.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.history.all });
    },
    onError: () => toast.error("Failed to add missing movies"),
  });
}

export function useAddMovieImportExclusion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: z.infer<typeof addMovieImportExclusionSchema>) =>
      addMovieImportExclusionFn({ data }),
    onSuccess: () => {
      toast.success("Movie excluded from import");
      queryClient.invalidateQueries({
        queryKey: queryKeys.movieCollections.all,
      });
    },
    onError: () => toast.error("Failed to exclude movie"),
  });
}
