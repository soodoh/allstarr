// oxlint-disable explicit-module-boundary-types -- useMutation return type is complex generic
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { createRootFolderFn, deleteRootFolderFn } from "src/server/root-folders";
import { queryKeys } from "src/lib/query-keys";

export function useCreateRootFolder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (path: string) => createRootFolderFn({ data: { path } }),
    onSuccess: () => {
      toast.success("Root folder added");
      queryClient.invalidateQueries({ queryKey: queryKeys.rootFolders.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.all });
    },
    onError: () => toast.error("Failed to add root folder"),
  });
}

export function useDeleteRootFolder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => deleteRootFolderFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Root folder removed");
      queryClient.invalidateQueries({ queryKey: queryKeys.rootFolders.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.all });
    },
    onError: () => toast.error("Failed to remove root folder"),
  });
}
