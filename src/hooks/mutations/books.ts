// oxlint-disable explicit-module-boundary-types -- useMutation return type is complex generic
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  createBookFn,
  updateBookFn,
  deleteBookFn,
  toggleBookProfileFn,
  toggleEditionProfileFn,
  updateEditionFn,
  deleteEditionFn,
  reassignBookFilesFn,
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

export function useToggleBookProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { bookId: number; qualityProfileId: number }) =>
      toggleBookProfileFn({ data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.books.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.authors.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.history.all });
    },
    onError: () => toast.error("Failed to update monitoring"),
  });
}

export function useToggleEditionProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { editionId: number; qualityProfileId: number }) =>
      toggleEditionProfileFn({ data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.books.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.authors.all });
    },
    onError: () => toast.error("Failed to update edition monitoring"),
  });
}

export function useUpdateEdition() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { id: number }) => updateEditionFn({ data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.books.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.authors.all });
    },
    onError: () => toast.error("Failed to update edition"),
  });
}

export function useDeleteEdition() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => deleteEditionFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Edition deleted");
      queryClient.invalidateQueries({ queryKey: queryKeys.books.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.authors.all });
    },
    onError: () => toast.error("Failed to delete edition"),
  });
}

export function useReassignBookFiles() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { fromBookId: number; toBookId: number }) =>
      reassignBookFilesFn({ data }),
    onSuccess: (result) => {
      toast.success(`Reassigned ${result.reassigned} file(s)`);
      queryClient.invalidateQueries({ queryKey: queryKeys.books.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.authors.all });
    },
    onError: () => toast.error("Failed to reassign files"),
  });
}
