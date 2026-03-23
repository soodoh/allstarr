// oxlint-disable explicit-module-boundary-types -- useMutation return type is complex generic
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { addMovieFn, updateMovieFn, deleteMovieFn } from "src/server/movies";
import { queryKeys } from "src/lib/query-keys";
import type {
  addMovieSchema,
  updateMovieSchema,
  deleteMovieSchema,
} from "src/lib/tmdb-validators";
import type { z } from "zod";

export function useAddMovie() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: z.infer<typeof addMovieSchema>) => addMovieFn({ data }),
    onSuccess: () => {
      toast.success("Movie added");
      queryClient.invalidateQueries({ queryKey: queryKeys.movies.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.history.all });
    },
    onError: () => toast.error("Failed to add movie"),
  });
}

export function useUpdateMovie() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: z.infer<typeof updateMovieSchema>) =>
      updateMovieFn({ data }),
    onSuccess: () => {
      toast.success("Movie updated");
      queryClient.invalidateQueries({ queryKey: queryKeys.movies.all });
    },
    onError: () => toast.error("Failed to update movie"),
  });
}

export function useDeleteMovie() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: z.infer<typeof deleteMovieSchema>) =>
      deleteMovieFn({ data }),
    onSuccess: () => {
      toast.success("Movie deleted");
      queryClient.invalidateQueries({ queryKey: queryKeys.movies.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.history.all });
    },
    onError: () => toast.error("Failed to delete movie"),
  });
}
