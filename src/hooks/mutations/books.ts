import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { queryKeys } from "src/lib/query-keys";
import {
	bulkMonitorBookProfileFn,
	bulkUnmonitorBookProfileFn,
	deleteBookFn,
	deleteEditionFn,
	monitorBookProfileFn,
	reassignBookFilesFn,
	setEditionForProfileFn,
	unmonitorBookProfileFn,
	updateBookFn,
} from "src/server/books";

export function useDeleteBook() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (data: {
			id: number;
			deleteFiles: boolean;
			addImportExclusion: boolean;
		}) => deleteBookFn({ data }),
		onSuccess: () => {
			toast.success("Book deleted");
			queryClient.invalidateQueries({ queryKey: queryKeys.books.all });
			queryClient.invalidateQueries({ queryKey: queryKeys.authors.all });
			queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.all });
			queryClient.invalidateQueries({ queryKey: queryKeys.history.all });
		},
		onError: () => toast.error("Failed to delete book"),
	});
}

export function useUpdateBook() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (data: { id: number; autoSwitchEdition: boolean }) =>
			updateBookFn({ data }),
		onSuccess: () => {
			toast.success("Book updated");
			queryClient.invalidateQueries({ queryKey: queryKeys.books.all });
		},
		onError: () => {
			toast.error("Failed to update book");
		},
	});
}

export function useMonitorBookProfile() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (data: { bookId: number; downloadProfileId: number }) =>
			monitorBookProfileFn({ data }),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.books.all });
			queryClient.invalidateQueries({ queryKey: queryKeys.authors.all });
			queryClient.invalidateQueries({ queryKey: queryKeys.history.all });
		},
		onError: () => toast.error("Failed to monitor profile"),
	});
}

export function useUnmonitorBookProfile() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (data: {
			bookId: number;
			downloadProfileId: number;
			deleteFiles: boolean;
		}) => unmonitorBookProfileFn({ data }),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.books.all });
			queryClient.invalidateQueries({ queryKey: queryKeys.authors.all });
			queryClient.invalidateQueries({ queryKey: queryKeys.history.all });
		},
		onError: () => toast.error("Failed to unmonitor profile"),
	});
}

export function useSetEditionForProfile() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (data: { editionId: number; downloadProfileId: number }) =>
			setEditionForProfileFn({ data }),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.books.all });
			queryClient.invalidateQueries({ queryKey: queryKeys.authors.all });
		},
		onError: () => toast.error("Failed to set edition"),
	});
}

export function useDeleteEdition() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (id: number) => deleteEditionFn({ data: { id } }),
		onSuccess: () => {
			toast.success("Edition deleted");
			queryClient.invalidateQueries({ queryKey: queryKeys.books.all });
			queryClient.invalidateQueries({ queryKey: queryKeys.authors.all });
		},
		onError: () => toast.error("Failed to delete edition"),
	});
}

export function useBulkMonitorBookProfile() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (data: { bookIds: number[]; downloadProfileId: number }) =>
			bulkMonitorBookProfileFn({ data }),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.books.all });
			queryClient.invalidateQueries({ queryKey: queryKeys.authors.all });
			queryClient.invalidateQueries({ queryKey: queryKeys.history.all });
		},
		onError: () => toast.error("Failed to monitor books"),
	});
}

export function useBulkUnmonitorBookProfile() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (data: {
			bookIds: number[];
			downloadProfileId: number;
			deleteFiles: boolean;
		}) => bulkUnmonitorBookProfileFn({ data }),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.books.all });
			queryClient.invalidateQueries({ queryKey: queryKeys.authors.all });
			queryClient.invalidateQueries({ queryKey: queryKeys.history.all });
		},
		onError: () => toast.error("Failed to unmonitor books"),
	});
}

export function useReassignBookFiles() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (data: { fromBookId: number; toBookId: number }) =>
			reassignBookFilesFn({ data }),
		onSuccess: (result) => {
			toast.success(`Reassigned ${result.reassigned} file(s)`);
			queryClient.invalidateQueries({ queryKey: queryKeys.books.all });
			queryClient.invalidateQueries({ queryKey: queryKeys.authors.all });
		},
		onError: () => toast.error("Failed to reassign files"),
	});
}
