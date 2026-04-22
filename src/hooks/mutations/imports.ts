import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { queryKeys } from "src/lib/query-keys";
import type {
	applyImportPlanSchema,
	createImportSourceSchema,
	deleteImportSourceSchema,
	refreshImportSourceSchema,
	resolveImportReviewItemSchema,
	updateImportSourceSchema,
} from "src/lib/validators";
import {
	applyImportPlanFn,
	createImportSourceFn,
	deleteImportSourceFn,
	refreshImportSourceFn,
	resolveImportReviewItemFn,
	updateImportSourceFn,
} from "src/server/import-sources";
import type { z } from "zod";

type CreateImportSourceInput = z.infer<typeof createImportSourceSchema>;
type UpdateImportSourceInput = z.infer<typeof updateImportSourceSchema>;
type DeleteImportSourceInput = z.infer<typeof deleteImportSourceSchema>;
type RefreshImportSourceInput = z.infer<typeof refreshImportSourceSchema>;
type ApplyImportPlanInput = z.infer<typeof applyImportPlanSchema>;
type ResolveImportReviewItemInput = z.infer<
	typeof resolveImportReviewItemSchema
>;

export function useCreateImportSource() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (data: CreateImportSourceInput) =>
			createImportSourceFn({ data }),
		onSuccess: () => {
			toast.success("Import source created");
			queryClient.invalidateQueries({ queryKey: queryKeys.imports.all });
		},
		onError: (error) =>
			toast.error(
				error instanceof Error
					? error.message
					: "Failed to create import source",
			),
	});
}

export function useUpdateImportSource() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (data: UpdateImportSourceInput) =>
			updateImportSourceFn({ data }),
		onSuccess: () => {
			toast.success("Import source updated");
			queryClient.invalidateQueries({ queryKey: queryKeys.imports.all });
		},
		onError: (error) =>
			toast.error(
				error instanceof Error
					? error.message
					: "Failed to update import source",
			),
	});
}

export function useDeleteImportSource() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (data: DeleteImportSourceInput) =>
			deleteImportSourceFn({ data }),
		onSuccess: () => {
			toast.success("Import source deleted");
			queryClient.invalidateQueries({ queryKey: queryKeys.imports.all });
		},
		onError: (error) =>
			toast.error(
				error instanceof Error
					? error.message
					: "Failed to delete import source",
			),
	});
}

export function useRefreshImportSource() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (data: RefreshImportSourceInput) =>
			refreshImportSourceFn({ data }),
		onSuccess: () => {
			toast.success("Import source refreshed");
			queryClient.invalidateQueries({ queryKey: queryKeys.imports.all });
		},
		onError: (error) =>
			toast.error(
				error instanceof Error
					? error.message
					: "Failed to refresh import source",
			),
	});
}

export function useApplyImportPlan() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (data: ApplyImportPlanInput) => applyImportPlanFn({ data }),
		onSuccess: (result) => {
			const appliedLabel = result.appliedCount === 1 ? "row" : "rows";
			const reviewLabel = result.reviewCount === 1 ? "item" : "items";
			toast.success(
				result.reviewCount > 0
					? `Applied ${result.appliedCount} ${appliedLabel}; ${result.reviewCount} review ${reviewLabel} queued`
					: `Applied ${result.appliedCount} ${appliedLabel}`,
			);
			queryClient.invalidateQueries({ queryKey: queryKeys.imports.all });
		},
		onError: (error) =>
			toast.error(
				error instanceof Error ? error.message : "Failed to apply import plan",
			),
	});
}

export function useResolveImportReviewItem() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (data: ResolveImportReviewItemInput) =>
			resolveImportReviewItemFn({ data }),
		onSuccess: () => {
			toast.success("Review item updated");
			queryClient.invalidateQueries({ queryKey: queryKeys.imports.all });
		},
		onError: (error) =>
			toast.error(
				error instanceof Error ? error.message : "Failed to update review item",
			),
	});
}
