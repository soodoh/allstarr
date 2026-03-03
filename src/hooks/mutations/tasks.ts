// oxlint-disable explicit-module-boundary-types -- useMutation return type is complex generic
// oxlint-disable import/prefer-default-export -- named export matches other mutation hooks
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { runScheduledTaskFn } from "src/server/tasks";
import { queryKeys } from "src/lib/query-keys";

export function useRunTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (taskId: string) => runScheduledTaskFn({ data: { taskId } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.tasks.all });
      toast.success("Task completed");
    },
    onError: (error) =>
      toast.error(
        error instanceof Error ? error.message : "Failed to run task",
      ),
  });
}
