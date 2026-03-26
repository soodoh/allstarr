// oxlint-disable explicit-module-boundary-types -- queryOptions return type is complex generic
// oxlint-disable import/prefer-default-export -- consistent with other query files in this directory
import { queryOptions } from "@tanstack/react-query";
import { queryKeys } from "src/lib/query-keys";
import { getUserTableSettingsFn } from "src/server/user-table-settings";

export const userTableSettingsQuery = (tableId: string) =>
  queryOptions({
    queryKey: queryKeys.userTableSettings.byTable(tableId),
    queryFn: () => getUserTableSettingsFn({ data: { tableId } }),
    staleTime: Number.POSITIVE_INFINITY,
  });
