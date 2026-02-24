// oxlint-disable explicit-module-boundary-types -- useMutation return type is complex generic
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  importHardcoverAuthorFn,
  importHardcoverBookFn,
} from "~/server/import";
import { queryKeys } from "~/lib/query-keys";

type BookEntry = {
  title: string;
  foreignBookId: string;
  releaseDate?: string | undefined;
  monitored: boolean;
  images?: Array<{ url: string; coverType: string }>;
  ratings?: { value: number; votes: number } | undefined;
  series?: Array<{
    foreignSeriesId: string;
    title: string;
    position?: string | undefined;
  }>;
};

export type ImportAuthorData = {
  name: string;
  foreignAuthorId: string;
  slug?: string | undefined;
  overview?: string | undefined;
  status: string;
  monitored: boolean;
  qualityProfileId?: number | undefined;
  rootFolderPath?: string | undefined;
  images?: Array<{ url: string; coverType: string }>;
  books: BookEntry[];
};

export type ImportBookData = BookEntry & {
  authorId: number;
};

export function useImportHardcoverAuthor() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: ImportAuthorData) => importHardcoverAuthorFn({ data }),
    onSuccess: (_, variables) => {
      toast.success(`${variables.name} added to library.`);
      queryClient.invalidateQueries({ queryKey: queryKeys.authors.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.books.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.history.all });
    },
    onError: (error) =>
      toast.error(
        error instanceof Error ? error.message : "Failed to add author.",
      ),
  });
}

export function useImportHardcoverBook() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: ImportBookData) => importHardcoverBookFn({ data }),
    onSuccess: (_, variables) => {
      toast.success(`"${variables.title}" added to library.`);
      queryClient.invalidateQueries({ queryKey: queryKeys.books.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.authors.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.history.all });
    },
    onError: (error) =>
      toast.error(
        error instanceof Error ? error.message : "Failed to add book.",
      ),
  });
}
