import { QueryClient } from "@tanstack/react-query";
import { act } from "@testing-library/react";
import { renderHook } from "src/test/render";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
	createIndexerFn,
	deleteIndexerFn,
	error,
	invalidateQueries,
	success,
	updateIndexerFn,
	updateSyncedIndexerFn,
} = vi.hoisted(() => ({
	createIndexerFn: vi.fn(),
	deleteIndexerFn: vi.fn(),
	error: vi.fn(),
	invalidateQueries: vi.fn(),
	success: vi.fn(),
	updateIndexerFn: vi.fn(),
	updateSyncedIndexerFn: vi.fn(),
}));

vi.mock("sonner", () => ({
	toast: {
		error,
		success,
	},
}));

vi.mock("src/server/indexers", () => ({
	createIndexerFn: (...args: unknown[]) => createIndexerFn(...args),
	deleteIndexerFn: (...args: unknown[]) => deleteIndexerFn(...args),
	updateIndexerFn: (...args: unknown[]) => updateIndexerFn(...args),
	updateSyncedIndexerFn: (...args: unknown[]) => updateSyncedIndexerFn(...args),
}));

import { queryKeys } from "src/lib/query-keys";

import {
	useCreateIndexer,
	useDeleteIndexer,
	useUpdateIndexer,
	useUpdateSyncedIndexer,
} from "./indexers";

type HookRunner = () => { mutateAsync: (variables: any) => Promise<any> };

async function runMutation(
	useHook: HookRunner,
	variables: unknown,
	swallowError = false,
) {
	const { result } = renderHook(() => useHook());

	await act(async () => {
		const promise = result.current.mutateAsync(variables as never);
		if (swallowError) {
			await promise.catch(() => {});
			return;
		}
		await promise;
	});
}

describe("mutations/indexers", () => {
	beforeEach(() => {
		vi.spyOn(QueryClient.prototype, "invalidateQueries").mockImplementation(
			invalidateQueries,
		);
	});

	afterEach(() => {
		vi.restoreAllMocks();
		createIndexerFn.mockReset();
		deleteIndexerFn.mockReset();
		error.mockReset();
		invalidateQueries.mockReset();
		success.mockReset();
		updateIndexerFn.mockReset();
		updateSyncedIndexerFn.mockReset();
	});

	it.each([
		{
			name: "create an indexer",
			hook: useCreateIndexer,
			fn: createIndexerFn,
			variables: { name: "Prowlarr" },
			call: { data: { name: "Prowlarr" } },
			toast: "Indexer added",
			invalidations: [queryKeys.indexers.all],
		},
		{
			name: "update an indexer",
			hook: useUpdateIndexer,
			fn: updateIndexerFn,
			variables: { id: 1, name: "Prowlarr" },
			call: { data: { id: 1, name: "Prowlarr" } },
			toast: "Indexer updated",
			invalidations: [queryKeys.indexers.all],
		},
		{
			name: "delete an indexer",
			hook: useDeleteIndexer,
			fn: deleteIndexerFn,
			variables: 2,
			call: { data: { id: 2 } },
			toast: "Indexer deleted",
			invalidations: [queryKeys.indexers.all],
		},
		{
			name: "update a synced indexer",
			hook: useUpdateSyncedIndexer,
			fn: updateSyncedIndexerFn,
			variables: { id: 3, name: "Synced" },
			call: { data: { id: 3, name: "Synced" } },
			toast: "Synced indexer updated",
			invalidations: [queryKeys.syncedIndexers.all],
		},
	])("wires $name mutations and invalidates the expected cache", async ({
		hook,
		fn,
		variables,
		call,
		toast,
		invalidations,
	}) => {
		fn.mockResolvedValue({ ok: true });

		await runMutation(hook, variables);

		expect(fn).toHaveBeenCalledWith(call);
		expect(success).toHaveBeenCalledWith(toast);
		for (const queryKey of invalidations) {
			expect(invalidateQueries).toHaveBeenCalledWith({ queryKey });
		}
	});

	it.each([
		{
			name: "create an indexer",
			hook: useCreateIndexer,
			fn: createIndexerFn,
			variables: { name: "Prowlarr" },
			errorText: "Failed to add indexer",
		},
		{
			name: "update an indexer",
			hook: useUpdateIndexer,
			fn: updateIndexerFn,
			variables: { id: 4, name: "Prowlarr" },
			errorText: "Failed to update indexer",
		},
		{
			name: "delete an indexer",
			hook: useDeleteIndexer,
			fn: deleteIndexerFn,
			variables: 5,
			errorText: "Failed to delete indexer",
		},
		{
			name: "update a synced indexer",
			hook: useUpdateSyncedIndexer,
			fn: updateSyncedIndexerFn,
			variables: { id: 6, name: "Synced" },
			errorText: "Failed to update synced indexer",
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
	});
});
