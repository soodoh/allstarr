import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { queryKeys } from "src/lib/query-keys";
import type { UpdateSettingInput } from "src/lib/settings-registry";
import type { MetadataProfile } from "src/server/settings";
import {
	regenerateApiKeyFn,
	updateMetadataProfileFn,
	updateSettingFn,
} from "src/server/settings";

/**
 * Batches multiple setting updates into a single mutation.
 * Pass an array of `{ key, value }` pairs.
 */
export function useUpdateSettings() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async (entries: UpdateSettingInput[]) => {
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

export function useUpdateMetadataProfile() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (profile: MetadataProfile) =>
			updateMetadataProfileFn({ data: profile }),
		onSuccess: () => {
			toast.success("Metadata profile saved");
			queryClient.invalidateQueries({
				queryKey: queryKeys.metadataProfile.all,
			});
		},
		onError: () => toast.error("Failed to save metadata profile"),
	});
}
