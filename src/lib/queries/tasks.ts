// oxlint-disable explicit-module-boundary-types -- queryOptions return type is complex generic
// oxlint-disable import/prefer-default-export -- barrel-imported; default export would break re-exports
import { queryOptions } from "@tanstack/react-query";
import { getScheduledTasksFn } from "src/server/tasks";
import { queryKeys } from "src/lib/query-keys";

export const scheduledTasksQuery = () =>
  queryOptions({
    queryKey: queryKeys.tasks.list(),
    queryFn: () => getScheduledTasksFn(),
    refetchInterval: 10_000,
  });
