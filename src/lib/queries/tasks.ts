import { queryOptions } from "@tanstack/react-query";
import { queryKeys } from "src/lib/query-keys";
import { getScheduledTasksFn } from "src/server/tasks";

export const scheduledTasksQuery = () =>
	queryOptions({
		queryKey: queryKeys.tasks.list(),
		queryFn: () => getScheduledTasksFn(),
		refetchInterval: 60_000,
	});
