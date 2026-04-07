import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { queryKeys } from "src/lib/query-keys";
import type { updateAuthorSchema } from "src/lib/validators";
import { deleteAuthorFn, updateAuthorFn } from "src/server/authors";
import type { z } from "zod";

export function useUpdateAuthor() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (data: z.infer<typeof updateAuthorSchema>) =>
			updateAuthorFn({ data }),
		onSuccess: () => {
			toast.success("Author updated");
			queryClient.invalidateQueries({ queryKey: queryKeys.authors.all });
			queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.all });
			queryClient.invalidateQueries({ queryKey: queryKeys.history.all });
		},
		onError: () => toast.error("Failed to update author"),
	});
}

export function useDeleteAuthor() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (id: number) => deleteAuthorFn({ data: { id } }),
		onSuccess: () => {
			toast.success("Author deleted");
			queryClient.invalidateQueries({ queryKey: queryKeys.authors.all });
			queryClient.invalidateQueries({ queryKey: queryKeys.books.all });
			queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.all });
			queryClient.invalidateQueries({ queryKey: queryKeys.history.all });
		},
		onError: () => toast.error("Failed to delete author"),
	});
}
