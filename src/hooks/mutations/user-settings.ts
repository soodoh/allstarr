// oxlint-disable explicit-module-boundary-types -- useMutation return type is complex generic
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "src/lib/query-keys";
import {
  upsertUserSettingsFn,
  resetColumnSettingsFn,
} from "src/server/user-settings";

export function useUpsertUserSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      tableId: string;
      columnOrder?: string[];
      hiddenColumns?: string[];
      viewMode?: "table" | "grid";
      addDefaults?: Record<string, unknown>;
    }) => upsertUserSettingsFn({ data }),
    onMutate: async (variables) => {
      const queryKey = queryKeys.userSettings.byTable(variables.tableId);
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData(queryKey);
      queryClient.setQueryData(
        queryKey,
        (old: Record<string, unknown> | null) => {
          const { tableId: _, ...rest } = variables;
          return { ...old, ...rest };
        },
      );
      return { previous };
    },
    onError: (_err, variables, context) => {
      if (context?.previous !== undefined) {
        queryClient.setQueryData(
          queryKeys.userSettings.byTable(variables.tableId),
          context.previous,
        );
      }
    },
    onSettled: (_data, _err, variables) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.userSettings.byTable(variables.tableId),
      });
    },
  });
}

export function useResetColumnSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { tableId: string }) => resetColumnSettingsFn({ data }),
    onMutate: async (variables) => {
      const queryKey = queryKeys.userSettings.byTable(variables.tableId);
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData(queryKey);
      queryClient.setQueryData(
        queryKey,
        (old: Record<string, unknown> | null) => ({
          ...old,
          columnOrder: [],
          hiddenColumns: [],
        }),
      );
      return { previous };
    },
    onError: (_err, variables, context) => {
      if (context?.previous !== undefined) {
        queryClient.setQueryData(
          queryKeys.userSettings.byTable(variables.tableId),
          context.previous,
        );
      }
    },
    onSettled: (_data, _err, variables) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.userSettings.byTable(variables.tableId),
      });
    },
  });
}
