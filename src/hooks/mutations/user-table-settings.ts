// oxlint-disable explicit-module-boundary-types -- useMutation return type is complex generic
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "src/lib/query-keys";
import {
  upsertUserTableSettingsFn,
  deleteUserTableSettingsFn,
} from "src/server/user-table-settings";

export function useUpsertTableSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      tableId: string;
      columnOrder: string[];
      hiddenColumns: string[];
    }) => upsertUserTableSettingsFn({ data }),
    onMutate: async (variables) => {
      const queryKey = queryKeys.userTableSettings.byTable(variables.tableId);
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData(queryKey);
      queryClient.setQueryData(queryKey, {
        columnOrder: variables.columnOrder,
        hiddenColumns: variables.hiddenColumns,
      });
      return { previous };
    },
    onError: (_err, variables, context) => {
      if (context?.previous !== undefined) {
        queryClient.setQueryData(
          queryKeys.userTableSettings.byTable(variables.tableId),
          context.previous,
        );
      }
    },
    onSettled: (_data, _err, variables) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.userTableSettings.byTable(variables.tableId),
      });
    },
  });
}

export function useResetTableSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { tableId: string }) =>
      deleteUserTableSettingsFn({ data }),
    onMutate: async (variables) => {
      const queryKey = queryKeys.userTableSettings.byTable(variables.tableId);
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData(queryKey);
      queryClient.setQueryData(queryKey, null);
      return { previous };
    },
    onError: (_err, variables, context) => {
      if (context?.previous !== undefined) {
        queryClient.setQueryData(
          queryKeys.userTableSettings.byTable(variables.tableId),
          context.previous,
        );
      }
    },
    onSettled: (_data, _err, variables) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.userTableSettings.byTable(variables.tableId),
      });
    },
  });
}
