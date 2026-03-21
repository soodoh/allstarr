// oxlint-disable explicit-module-boundary-types -- queryOptions return type is complex generic
// oxlint-disable import/prefer-default-export -- barrel-imported; default export would break re-exports
import { queryOptions } from "@tanstack/react-query";
import { getQueueFn } from "src/server/queue";
import { queryKeys } from "src/lib/query-keys";

export const queueListQuery = () =>
  queryOptions({
    queryKey: queryKeys.queue.list(),
    queryFn: () => getQueueFn(),
  });
