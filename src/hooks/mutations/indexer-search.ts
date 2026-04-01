import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { queryKeys } from "src/lib/query-keys";
import type {
	grabReleaseSchema,
	searchIndexersSchema,
} from "src/lib/validators";
import { grabReleaseFn, searchIndexersFn } from "src/server/indexers";
import type { z } from "zod";

export function useSearchIndexers(bookId?: number) {
	return useMutation({
		mutationKey:
			bookId === undefined ? undefined : queryKeys.indexers.search(bookId),
		mutationFn: (data: z.infer<typeof searchIndexersSchema>) =>
			searchIndexersFn({ data }),
		onSuccess: (data) => {
			for (const w of data.warnings) {
				toast.warning(w);
			}
		},
		onError: (error) =>
			toast.error(error instanceof Error ? error.message : "Search failed"),
	});
}

export function useGrabRelease() {
	return useMutation({
		mutationFn: (data: z.infer<typeof grabReleaseSchema>) =>
			grabReleaseFn({ data }),
		onError: (error) =>
			toast.error(
				error instanceof Error ? error.message : "Failed to grab release",
			),
	});
}
