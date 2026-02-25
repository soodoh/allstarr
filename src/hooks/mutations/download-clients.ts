// oxlint-disable explicit-module-boundary-types -- useMutation return type is complex generic
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  createDownloadClientFn,
  updateDownloadClientFn,
  deleteDownloadClientFn,
} from "src/server/download-clients";
import { queryKeys } from "src/lib/query-keys";
import type {
  createDownloadClientSchema,
  updateDownloadClientSchema,
} from "src/lib/validators";
import type { z } from "zod";

export function useCreateDownloadClient() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: z.infer<typeof createDownloadClientSchema>) =>
      createDownloadClientFn({ data }),
    onSuccess: () => {
      toast.success("Download client added");
      queryClient.invalidateQueries({
        queryKey: queryKeys.downloadClients.all,
      });
    },
    onError: () => toast.error("Failed to add download client"),
  });
}

export function useUpdateDownloadClient() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: z.infer<typeof updateDownloadClientSchema>) =>
      updateDownloadClientFn({ data }),
    onSuccess: () => {
      toast.success("Download client updated");
      queryClient.invalidateQueries({
        queryKey: queryKeys.downloadClients.all,
      });
    },
    onError: () => toast.error("Failed to update download client"),
  });
}

export function useDeleteDownloadClient() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => deleteDownloadClientFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Download client deleted");
      queryClient.invalidateQueries({
        queryKey: queryKeys.downloadClients.all,
      });
    },
    onError: () => toast.error("Failed to delete download client"),
  });
}
