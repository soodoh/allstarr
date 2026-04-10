import { QueryClient } from "@tanstack/react-query";
import { renderHook } from "src/test/render";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
	bulkMonitorBookProfileFn,
	bulkUnmonitorBookProfileFn,
	deleteBookFn,
	deleteEditionFn,
	error,
	invalidateQueries,
	monitorBookProfileFn,
	reassignBookFilesFn,
	setEditionForProfileFn,
	success,
	unmonitorBookProfileFn,
	updateBookFn,
} = vi.hoisted(() => ({
	bulkMonitorBookProfileFn: vi.fn(),
	bulkUnmonitorBookProfileFn: vi.fn(),
	deleteBookFn: vi.fn(),
	deleteEditionFn: vi.fn(),
	error: vi.fn(),
	invalidateQueries: vi.fn(),
	monitorBookProfileFn: vi.fn(),
	reassignBookFilesFn: vi.fn(),
	setEditionForProfileFn: vi.fn(),
	success: vi.fn(),
	unmonitorBookProfileFn: vi.fn(),
	updateBookFn: vi.fn(),
}));

vi.mock("sonner", () => ({
	toast: {
		error,
		success,
	},
}));

vi.mock("src/server/books", () => ({
	bulkMonitorBookProfileFn: (...args: unknown[]) =>
		bulkMonitorBookProfileFn(...args),
	bulkUnmonitorBookProfileFn: (...args: unknown[]) =>
		bulkUnmonitorBookProfileFn(...args),
	deleteBookFn: (...args: unknown[]) => deleteBookFn(...args),
	deleteEditionFn: (...args: unknown[]) => deleteEditionFn(...args),
	monitorBookProfileFn: (...args: unknown[]) => monitorBookProfileFn(...args),
	reassignBookFilesFn: (...args: unknown[]) => reassignBookFilesFn(...args),
	setEditionForProfileFn: (...args: unknown[]) =>
		setEditionForProfileFn(...args),
	unmonitorBookProfileFn: (...args: unknown[]) =>
		unmonitorBookProfileFn(...args),
	updateBookFn: (...args: unknown[]) => updateBookFn(...args),
}));

import { queryKeys } from "src/lib/query-keys";

import {
	useBulkMonitorBookProfile,
	useBulkUnmonitorBookProfile,
	useDeleteBook,
	useDeleteEdition,
	useMonitorBookProfile,
	useReassignBookFiles,
	useSetEditionForProfile,
	useUnmonitorBookProfile,
	useUpdateBook,
} from "./books";

type HookRunner = () => { mutateAsync: (variables: any) => Promise<any> };

async function runMutation(
	useHook: HookRunner,
	variables: unknown,
	swallowError = false,
) {
	const { result } = await renderHook(() => useHook());

	const promise = result.current.mutateAsync(variables as never);
	if (swallowError) {
		await promise.catch(() => {});
		return;
	}
	await promise;
}

describe("mutations/books", () => {
	beforeEach(() => {
		vi.spyOn(QueryClient.prototype, "invalidateQueries").mockImplementation(
			invalidateQueries,
		);
	});

	afterEach(() => {
		vi.restoreAllMocks();
		bulkMonitorBookProfileFn.mockReset();
		bulkUnmonitorBookProfileFn.mockReset();
		deleteBookFn.mockReset();
		deleteEditionFn.mockReset();
		error.mockReset();
		invalidateQueries.mockReset();
		monitorBookProfileFn.mockReset();
		reassignBookFilesFn.mockReset();
		setEditionForProfileFn.mockReset();
		success.mockReset();
		unmonitorBookProfileFn.mockReset();
		updateBookFn.mockReset();
	});

	it.each([
		{
			name: "delete book",
			hook: useDeleteBook,
			fn: deleteBookFn,
			variables: { id: 1, deleteFiles: true, addImportExclusion: false },
			call: { data: { id: 1, deleteFiles: true, addImportExclusion: false } },
			toast: "Book deleted",
			invalidations: [
				queryKeys.books.all,
				queryKeys.authors.all,
				queryKeys.dashboard.all,
				queryKeys.history.all,
			],
		},
		{
			name: "update book",
			hook: useUpdateBook,
			fn: updateBookFn,
			variables: { id: 2, autoSwitchEdition: true },
			call: { data: { id: 2, autoSwitchEdition: true } },
			toast: "Book updated",
			invalidations: [queryKeys.books.all],
		},
		{
			name: "monitor a book profile",
			hook: useMonitorBookProfile,
			fn: monitorBookProfileFn,
			variables: { bookId: 3, downloadProfileId: 4 },
			call: { data: { bookId: 3, downloadProfileId: 4 } },
			invalidations: [
				queryKeys.books.all,
				queryKeys.authors.all,
				queryKeys.history.all,
			],
		},
		{
			name: "unmonitor a book profile",
			hook: useUnmonitorBookProfile,
			fn: unmonitorBookProfileFn,
			variables: { bookId: 5, downloadProfileId: 6, deleteFiles: true },
			call: { data: { bookId: 5, downloadProfileId: 6, deleteFiles: true } },
			invalidations: [
				queryKeys.books.all,
				queryKeys.authors.all,
				queryKeys.history.all,
			],
		},
		{
			name: "set the edition for a profile",
			hook: useSetEditionForProfile,
			fn: setEditionForProfileFn,
			variables: { editionId: 7, downloadProfileId: 8 },
			call: { data: { editionId: 7, downloadProfileId: 8 } },
			invalidations: [queryKeys.books.all, queryKeys.authors.all],
		},
		{
			name: "delete an edition",
			hook: useDeleteEdition,
			fn: deleteEditionFn,
			variables: 9,
			call: { data: { id: 9 } },
			toast: "Edition deleted",
			invalidations: [queryKeys.books.all, queryKeys.authors.all],
		},
		{
			name: "bulk monitor books",
			hook: useBulkMonitorBookProfile,
			fn: bulkMonitorBookProfileFn,
			variables: { bookIds: [1, 2], downloadProfileId: 10 },
			call: { data: { bookIds: [1, 2], downloadProfileId: 10 } },
			invalidations: [
				queryKeys.books.all,
				queryKeys.authors.all,
				queryKeys.history.all,
			],
		},
		{
			name: "bulk unmonitor books",
			hook: useBulkUnmonitorBookProfile,
			fn: bulkUnmonitorBookProfileFn,
			variables: {
				bookIds: [3, 4],
				downloadProfileId: 11,
				deleteFiles: false,
			},
			call: {
				data: {
					bookIds: [3, 4],
					downloadProfileId: 11,
					deleteFiles: false,
				},
			},
			invalidations: [
				queryKeys.books.all,
				queryKeys.authors.all,
				queryKeys.history.all,
			],
		},
		{
			name: "reassign files between books",
			hook: useReassignBookFiles,
			fn: reassignBookFilesFn,
			variables: { fromBookId: 12, toBookId: 13 },
			call: { data: { fromBookId: 12, toBookId: 13 } },
			toast: "Reassigned 3 file(s)",
			result: { reassigned: 3 },
			invalidations: [queryKeys.books.all, queryKeys.authors.all],
		},
	])("wires $name mutations, toast text, and invalidation", async ({
		hook,
		fn,
		variables,
		call,
		invalidations,
		toast,
		result,
	}) => {
		fn.mockResolvedValue(result ?? { ok: true });

		await runMutation(hook, variables);

		expect(fn).toHaveBeenCalledWith(call);
		if (toast) {
			expect(success).toHaveBeenCalledWith(toast);
		}
		for (const [index, queryKey] of invalidations.entries()) {
			expect(invalidateQueries).toHaveBeenNthCalledWith(index + 1, {
				queryKey,
			});
		}
	});

	it.each([
		{
			name: "delete book",
			hook: useDeleteBook,
			fn: deleteBookFn,
			variables: { id: 14, deleteFiles: false, addImportExclusion: true },
			errorText: "Failed to delete book",
		},
		{
			name: "update book",
			hook: useUpdateBook,
			fn: updateBookFn,
			variables: { id: 15, autoSwitchEdition: false },
			errorText: "Failed to update book",
		},
		{
			name: "monitor a book profile",
			hook: useMonitorBookProfile,
			fn: monitorBookProfileFn,
			variables: { bookId: 16, downloadProfileId: 17 },
			errorText: "Failed to monitor profile",
		},
		{
			name: "unmonitor a book profile",
			hook: useUnmonitorBookProfile,
			fn: unmonitorBookProfileFn,
			variables: { bookId: 18, downloadProfileId: 19, deleteFiles: true },
			errorText: "Failed to unmonitor profile",
		},
		{
			name: "set the edition for a profile",
			hook: useSetEditionForProfile,
			fn: setEditionForProfileFn,
			variables: { editionId: 20, downloadProfileId: 21 },
			errorText: "Failed to set edition",
		},
		{
			name: "delete an edition",
			hook: useDeleteEdition,
			fn: deleteEditionFn,
			variables: 22,
			errorText: "Failed to delete edition",
		},
		{
			name: "bulk monitor books",
			hook: useBulkMonitorBookProfile,
			fn: bulkMonitorBookProfileFn,
			variables: { bookIds: [23, 24], downloadProfileId: 25 },
			errorText: "Failed to monitor books",
		},
		{
			name: "bulk unmonitor books",
			hook: useBulkUnmonitorBookProfile,
			fn: bulkUnmonitorBookProfileFn,
			variables: {
				bookIds: [26, 27],
				downloadProfileId: 28,
				deleteFiles: false,
			},
			errorText: "Failed to unmonitor books",
		},
		{
			name: "reassign files between books",
			hook: useReassignBookFiles,
			fn: reassignBookFilesFn,
			variables: { fromBookId: 29, toBookId: 30 },
			errorText: "Failed to reassign files",
		},
	])("shows the $name error toast when the mutation fails", async ({
		hook,
		fn,
		variables,
		errorText,
	}) => {
		fn.mockRejectedValue(new Error("boom"));

		await runMutation(hook, variables, true);

		expect(error).toHaveBeenCalledWith(errorText);
		expect(success).not.toHaveBeenCalled();
	});
});
