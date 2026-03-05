// oxlint-disable explicit-module-boundary-types -- queryOptions return type is complex generic
// oxlint-disable import/prefer-default-export -- barrel-imported; default export would break re-exports
import { queryOptions } from "@tanstack/react-query";
import { getQueueFn } from "src/server/queue";
import { queryKeys } from "src/lib/query-keys";

export const queueListQuery = () =>
  queryOptions({
    queryKey: queryKeys.queue.list(),
    queryFn: () => getQueueFn(),
    refetchInterval: 60_000,
  });

export const queueCountQuery = () =>
  queryOptions({
    queryKey: queryKeys.queue.count(),
    queryFn: async () => {
      const data = await getQueueFn();
      return data.items.length;
    },
    refetchInterval: 120_000,
  });
