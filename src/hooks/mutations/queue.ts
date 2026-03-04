// oxlint-disable explicit-module-boundary-types -- useMutation return type is complex generic
// oxlint-disable import/prefer-default-export -- barrel-imported; default export would break re-exports
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { removeFromQueueFn } from "src/server/queue";
import { queryKeys } from "src/lib/query-keys";
import type { removeFromQueueSchema } from "src/lib/validators";
import type { z } from "zod";

export function useRemoveFromQueue() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: z.infer<typeof removeFromQueueSchema>) =>
      removeFromQueueFn({ data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.queue.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.blocklist.all });
      toast.success("Removed from queue");
    },
    onError: (error) =>
      toast.error(
        error instanceof Error ? error.message : "Failed to remove from queue",
      ),
  });
}
