// oxlint-disable explicit-module-boundary-types -- useMutation return type is complex generic
// oxlint-disable import/prefer-default-export -- barrel-imported; default export would break re-exports
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { regenerateApiKeyFn, updateSettingFn } from "~/server/settings";
import { queryKeys } from "~/lib/query-keys";

type SettingEntry = { key: string; value: string };

/**
 * Batches multiple setting updates into a single mutation.
 * Pass an array of `{ key, value }` pairs.
 */
export function useUpdateSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (entries: SettingEntry[]) => {
      for (const entry of entries) {
        await updateSettingFn({ data: entry });
      }
    },
    onSuccess: () => {
      toast.success("Settings saved");
      queryClient.invalidateQueries({ queryKey: queryKeys.settings.all });
    },
    onError: () => toast.error("Failed to save settings"),
  });
}

export function useRegenerateApiKey() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => regenerateApiKeyFn(),
    onSuccess: () => {
      toast.success("API key regenerated");
      queryClient.invalidateQueries({ queryKey: queryKeys.settings.all });
    },
    onError: () => toast.error("Failed to regenerate API key"),
  });
}
