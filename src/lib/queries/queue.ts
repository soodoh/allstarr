import { queryOptions } from "@tanstack/react-query";
import { queryKeys } from "src/lib/query-keys";
import { getQueueFn } from "src/server/queue";

export const queueListQuery = () =>
	queryOptions({
		queryKey: queryKeys.queue.list(),
		queryFn: () => getQueueFn(),
	});
