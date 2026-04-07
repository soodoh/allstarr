import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import {
	importHardcoverAuthorFn,
	importHardcoverBookFn,
	refreshAuthorMetadataFn,
	refreshBookMetadataFn,
} from "src/server/import";

export type ImportAuthorData = {
	foreignAuthorId: number;
	downloadProfileIds: number[];
	monitorOption?:
		| "all"
		| "future"
		| "missing"
		| "existing"
		| "first"
		| "latest"
		| "none";
	monitorNewBooks?: "all" | "none" | "new";
	searchOnAdd?: boolean;
};

type ImportBookData = {
	foreignBookId: number;
	downloadProfileIds: number[];
	monitorOption?:
		| "all"
		| "future"
		| "missing"
		| "existing"
		| "first"
		| "latest"
		| "none";
	monitorNewBooks?: "all" | "none" | "new";
	searchOnAdd?: boolean;
};

export function useImportHardcoverAuthor() {
	return useMutation({
		mutationFn: (data: ImportAuthorData) => importHardcoverAuthorFn({ data }),
		onMutate: () => {
			const toastId = toast.loading("Starting author import...", {
				id: "submit-import-author",
			});
			return { toastId };
		},
		onSuccess: (_result, _vars, context) => {
			toast.dismiss(context?.toastId);
		},
		onError: (error, _vars, context) =>
			toast.error(
				error instanceof Error ? error.message : "Failed to add author.",
				{ id: context?.toastId },
			),
	});
}

export function useImportHardcoverBook() {
	return useMutation({
		mutationFn: (data: ImportBookData) => importHardcoverBookFn({ data }),
		onMutate: () => {
			const toastId = toast.loading("Starting book import...", {
				id: "submit-import-book",
			});
			return { toastId };
		},
		onSuccess: (_result, _vars, context) => {
			toast.dismiss(context?.toastId);
		},
		onError: (error, _vars, context) =>
			toast.error(
				error instanceof Error ? error.message : "Failed to add book.",
				{ id: context?.toastId },
			),
	});
}

export function useRefreshAuthorMetadata() {
	return useMutation({
		mutationFn: (authorId: number) =>
			refreshAuthorMetadataFn({ data: { authorId } }),
		onError: (error) =>
			toast.error(
				error instanceof Error ? error.message : "Failed to refresh metadata.",
			),
	});
}

export function useRefreshBookMetadata() {
	return useMutation({
		mutationFn: (bookId: number) => refreshBookMetadataFn({ data: { bookId } }),
		onError: (error) =>
			toast.error(
				error instanceof Error ? error.message : "Failed to refresh metadata.",
			),
	});
}
