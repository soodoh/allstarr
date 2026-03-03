// oxlint-disable explicit-module-boundary-types -- useMutation return type is complex generic
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  removeFromBlocklistFn,
  bulkRemoveFromBlocklistFn,
} from "src/server/blocklist";
import { queryKeys } from "src/lib/query-keys";

export function useRemoveFromBlocklist() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => removeFromBlocklistFn({ data: { id } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.blocklist.all });
      toast.success("Removed from blocklist");
    },
    onError: (error) =>
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to remove from blocklist",
      ),
  });
}

export function useBulkRemoveFromBlocklist() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (ids: number[]) => bulkRemoveFromBlocklistFn({ data: { ids } }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.blocklist.all });
      toast.success(`Removed ${data.removed} items from blocklist`);
    },
    onError: (error) =>
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to remove from blocklist",
      ),
  });
}
