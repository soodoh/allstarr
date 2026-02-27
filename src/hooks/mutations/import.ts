// oxlint-disable explicit-module-boundary-types -- useMutation return type is complex generic
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  importHardcoverAuthorFn,
  importHardcoverBookFn,
  refreshAuthorMetadataFn,
  refreshBookMetadataFn,
} from "src/server/import";
import { queryKeys } from "src/lib/query-keys";

export type ImportAuthorData = {
  foreignAuthorId: number;
  qualityProfileId?: number;
  rootFolderPath?: string;
};

export type ImportBookData = {
  foreignBookId: number;
  qualityProfileId?: number;
  rootFolderPath?: string;
};

export function useImportHardcoverAuthor() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: ImportAuthorData) => importHardcoverAuthorFn({ data }),
    onMutate: () => {
      const toastId = toast.loading("Importing author metadata…");
      return { toastId };
    },
    onSuccess: (result, _vars, context) => {
      toast.success(
        `Author added with ${result.booksAdded} books and ${result.editionsAdded} editions.`,
        { id: context?.toastId },
      );
      queryClient.invalidateQueries({ queryKey: queryKeys.authors.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.books.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.history.all });
    },
    onError: (error, _vars, context) =>
      toast.error(
        error instanceof Error ? error.message : "Failed to add author.",
        { id: context?.toastId },
      ),
  });
}

export function useImportHardcoverBook() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: ImportBookData) => importHardcoverBookFn({ data }),
    onMutate: () => {
      const toastId = toast.loading("Importing book metadata…");
      return { toastId };
    },
    onSuccess: (_result, _vars, context) => {
      toast.success("Book added to library.", { id: context?.toastId });
      queryClient.invalidateQueries({ queryKey: queryKeys.books.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.authors.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.history.all });
    },
    onError: (error, _vars, context) =>
      toast.error(
        error instanceof Error ? error.message : "Failed to add book.",
        { id: context?.toastId },
      ),
  });
}

export function useRefreshAuthorMetadata() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (authorId: number) =>
      refreshAuthorMetadataFn({ data: { authorId } }),
    onSuccess: (result) => {
      const parts: string[] = [];
      if (result.booksAdded > 0) {parts.push(`${result.booksAdded} new books`);}
      if (result.booksUpdated > 0)
        {parts.push(`${result.booksUpdated} books updated`);}
      if (result.editionsAdded > 0)
        {parts.push(`${result.editionsAdded} new editions`);}
      toast.success(
        parts.length > 0
          ? `Metadata updated: ${parts.join(", ")}.`
          : "Metadata is up to date.",
      );
      queryClient.invalidateQueries({ queryKey: queryKeys.authors.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.books.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.history.all });
    },
    onError: (error) =>
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to refresh metadata.",
      ),
  });
}

export function useRefreshBookMetadata() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (bookId: number) =>
      refreshBookMetadataFn({ data: { bookId } }),
    onSuccess: (result) => {
      const parts: string[] = [];
      if (result.editionsAdded > 0)
        {parts.push(`${result.editionsAdded} new editions`);}
      if (result.editionsUpdated > 0)
        {parts.push(`${result.editionsUpdated} editions updated`);}
      toast.success(
        parts.length > 0
          ? `Metadata updated: ${parts.join(", ")}.`
          : "Metadata is up to date.",
      );
      queryClient.invalidateQueries({ queryKey: queryKeys.books.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.history.all });
    },
    onError: (error) =>
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to refresh metadata.",
      ),
  });
}
