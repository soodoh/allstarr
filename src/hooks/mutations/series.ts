import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { queryKeys } from "src/lib/query-keys";
import type { updateSeriesSchema } from "src/lib/validators";
import { refreshSeriesFn, updateSeriesFn } from "src/server/series";
import type { z } from "zod";

export function useUpdateSeries() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (data: z.infer<typeof updateSeriesSchema>) =>
			updateSeriesFn({ data }),
		onSuccess: () => {
			toast.success("Series updated");
			queryClient.invalidateQueries({ queryKey: queryKeys.series.all });
			queryClient.invalidateQueries({ queryKey: queryKeys.authors.all });
		},
		onError: () => toast.error("Failed to update series"),
	});
}

export function useRefreshSeries() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (data?: { seriesId?: number }) =>
			refreshSeriesFn({ data: data ?? {} }),
		onSuccess: (data) => {
			const msg =
				data.booksAdded > 0
					? `Refreshed series, added ${data.booksAdded} book${data.booksAdded === 1 ? "" : "s"}`
					: "Series refreshed, no new books";
			toast.success(msg);
			queryClient.invalidateQueries({ queryKey: queryKeys.series.all });
			queryClient.invalidateQueries({ queryKey: queryKeys.books.all });
			queryClient.invalidateQueries({ queryKey: queryKeys.authors.all });
			queryClient.invalidateQueries({ queryKey: queryKeys.history.all });
		},
		onError: () => toast.error("Failed to refresh series"),
	});
}
