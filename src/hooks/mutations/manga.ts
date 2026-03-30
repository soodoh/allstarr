// oxlint-disable explicit-module-boundary-types -- useMutation return type is complex generic
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { importMangaFn, refreshMangaMetadataFn } from "src/server/manga-import";
import { updateMangaFn, deleteMangaFn } from "src/server/manga";
import { queryKeys } from "src/lib/query-keys";
import type {
  addMangaSchema,
  updateMangaSchema,
  deleteMangaSchema,
} from "src/lib/validators";
import type { z } from "zod";

export function useAddManga() {
  return useMutation({
    mutationFn: (data: z.infer<typeof addMangaSchema>) =>
      importMangaFn({ data }),
    onMutate: () => {
      const toastId = toast.loading("Starting manga import...", {
        id: "submit-manga",
      });
      return { toastId };
    },
    onSuccess: (_result, _vars, context) => {
      toast.dismiss(context?.toastId);
    },
    onError: (_error, _vars, context) =>
      toast.error("Failed to add manga", { id: context?.toastId }),
  });
}

export function useUpdateManga() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: z.infer<typeof updateMangaSchema>) =>
      updateMangaFn({ data }),
    onSuccess: () => {
      toast.success("Manga updated");
      queryClient.invalidateQueries({ queryKey: queryKeys.manga.all });
    },
    onError: () => toast.error("Failed to update manga"),
  });
}

export function useDeleteManga() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: z.infer<typeof deleteMangaSchema>) =>
      deleteMangaFn({ data }),
    onSuccess: () => {
      toast.success("Manga deleted");
      queryClient.invalidateQueries({ queryKey: queryKeys.manga.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.history.all });
    },
    onError: () => toast.error("Failed to delete manga"),
  });
}

export function useRefreshMangaMetadata() {
  return useMutation({
    mutationFn: (mangaId: number) =>
      refreshMangaMetadataFn({ data: { mangaId } }),
    onError: () => toast.error("Failed to refresh manga metadata"),
  });
}
