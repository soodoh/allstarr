// oxlint-disable explicit-module-boundary-types -- useMutation return type is complex generic
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  createBookFn,
  updateBookFn,
  deleteBookFn,
  toggleBookMonitorFn,
  updateEditionFn,
} from "src/server/books";
import { queryKeys } from "src/lib/query-keys";
import type { createBookSchema, updateBookSchema } from "src/lib/validators";
import type { z } from "zod";

export function useCreateBook() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: z.infer<typeof createBookSchema>) =>
      createBookFn({ data }),
    onSuccess: () => {
      toast.success("Book added");
      queryClient.invalidateQueries({ queryKey: queryKeys.books.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.authors.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.history.all });
    },
    onError: () => toast.error("Failed to add book"),
  });
}

export function useUpdateBook() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: z.infer<typeof updateBookSchema>) =>
      updateBookFn({ data }),
    onSuccess: () => {
      toast.success("Book updated");
      queryClient.invalidateQueries({ queryKey: queryKeys.books.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.authors.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.history.all });
    },
    onError: () => toast.error("Failed to update book"),
  });
}

export function useDeleteBook() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => deleteBookFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Book deleted");
      queryClient.invalidateQueries({ queryKey: queryKeys.books.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.authors.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.history.all });
    },
    onError: () => toast.error("Failed to delete book"),
  });
}

export function useToggleBookMonitor() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { bookId: number; monitor: boolean }) =>
      toggleBookMonitorFn({ data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.books.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.authors.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.history.all });
    },
    onError: () => toast.error("Failed to update monitoring"),
  });
}

export function useUpdateEdition() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { id: number; monitored?: boolean }) =>
      updateEditionFn({ data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.books.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.authors.all });
    },
    onError: () => toast.error("Failed to update edition"),
  });
}
