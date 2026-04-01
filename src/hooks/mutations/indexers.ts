import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { queryKeys } from "src/lib/query-keys";
import type {
	createIndexerSchema,
	updateIndexerSchema,
	updateSyncedIndexerSchema,
} from "src/lib/validators";
import {
	createIndexerFn,
	deleteIndexerFn,
	updateIndexerFn,
	updateSyncedIndexerFn,
} from "src/server/indexers";
import type { z } from "zod";

export function useCreateIndexer() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (data: z.infer<typeof createIndexerSchema>) =>
			createIndexerFn({ data }),
		onSuccess: () => {
			toast.success("Indexer added");
			queryClient.invalidateQueries({ queryKey: queryKeys.indexers.all });
		},
		onError: () => toast.error("Failed to add indexer"),
	});
}

export function useUpdateIndexer() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (data: z.infer<typeof updateIndexerSchema>) =>
			updateIndexerFn({ data }),
		onSuccess: () => {
			toast.success("Indexer updated");
			queryClient.invalidateQueries({ queryKey: queryKeys.indexers.all });
		},
		onError: () => toast.error("Failed to update indexer"),
	});
}

export function useDeleteIndexer() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (id: number) => deleteIndexerFn({ data: { id } }),
		onSuccess: () => {
			toast.success("Indexer deleted");
			queryClient.invalidateQueries({ queryKey: queryKeys.indexers.all });
		},
		onError: () => toast.error("Failed to delete indexer"),
	});
}

export function useUpdateSyncedIndexer() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (data: z.infer<typeof updateSyncedIndexerSchema>) =>
			updateSyncedIndexerFn({ data }),
		onSuccess: () => {
			toast.success("Synced indexer updated");
			queryClient.invalidateQueries({
				queryKey: queryKeys.syncedIndexers.all,
			});
		},
		onError: () => toast.error("Failed to update synced indexer"),
	});
}
