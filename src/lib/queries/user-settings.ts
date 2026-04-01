import { queryOptions } from "@tanstack/react-query";
import { queryKeys } from "src/lib/query-keys";
import { getUserSettingsFn } from "src/server/user-settings";

export const userSettingsQuery = (tableId: string) =>
	queryOptions({
		queryKey: queryKeys.userSettings.byTable(tableId),
		queryFn: () => getUserSettingsFn({ data: { tableId } }),
		staleTime: Number.POSITIVE_INFINITY,
	});
