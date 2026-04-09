import { QueryClient } from "@tanstack/react-query";
import { act } from "@testing-library/react";
import { renderHook } from "src/test/render";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
	createDownloadClientFn,
	deleteDownloadClientFn,
	error,
	invalidateQueries,
	success,
	updateDownloadClientFn,
} = vi.hoisted(() => ({
	createDownloadClientFn: vi.fn(),
	deleteDownloadClientFn: vi.fn(),
	error: vi.fn(),
	invalidateQueries: vi.fn(),
	success: vi.fn(),
	updateDownloadClientFn: vi.fn(),
}));

vi.mock("sonner", () => ({
	toast: {
		error,
		success,
	},
}));

vi.mock("src/server/download-clients", () => ({
	createDownloadClientFn: (...args: unknown[]) =>
		createDownloadClientFn(...args),
	deleteDownloadClientFn: (...args: unknown[]) =>
		deleteDownloadClientFn(...args),
	updateDownloadClientFn: (...args: unknown[]) =>
		updateDownloadClientFn(...args),
}));

import { queryKeys } from "src/lib/query-keys";

import {
	useCreateDownloadClient,
	useDeleteDownloadClient,
	useUpdateDownloadClient,
} from "./download-clients";

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

describe("mutations/download-clients", () => {
	beforeEach(() => {
		vi.spyOn(QueryClient.prototype, "invalidateQueries").mockImplementation(
			invalidateQueries,
		);
	});

	afterEach(() => {
		vi.restoreAllMocks();
		createDownloadClientFn.mockReset();
		deleteDownloadClientFn.mockReset();
		error.mockReset();
		invalidateQueries.mockReset();
		success.mockReset();
		updateDownloadClientFn.mockReset();
	});

	it.each([
		{
			name: "create a download client",
			hook: useCreateDownloadClient,
			fn: createDownloadClientFn,
			variables: { name: "qBittorrent" },
			call: { data: { name: "qBittorrent" } },
			toast: "Download client added",
		},
		{
			name: "update a download client",
			hook: useUpdateDownloadClient,
			fn: updateDownloadClientFn,
			variables: { id: 1, name: "qBittorrent" },
			call: { data: { id: 1, name: "qBittorrent" } },
			toast: "Download client updated",
		},
		{
			name: "delete a download client",
			hook: useDeleteDownloadClient,
			fn: deleteDownloadClientFn,
			variables: 2,
			call: { data: { id: 2 } },
			toast: "Download client deleted",
		},
	])("wires $name mutations and invalidates the download clients cache", async ({
		hook,
		fn,
		variables,
		call,
		toast,
	}) => {
		fn.mockResolvedValue({ ok: true });

		await runMutation(hook, variables);

		expect(fn).toHaveBeenCalledWith(call);
		expect(success).toHaveBeenCalledWith(toast);
		expect(invalidateQueries).toHaveBeenCalledWith({
			queryKey: queryKeys.downloadClients.all,
		});
	});

	it.each([
		{
			name: "create a download client",
			hook: useCreateDownloadClient,
			fn: createDownloadClientFn,
			variables: { name: "qBittorrent" },
			errorText: "Failed to add download client",
		},
		{
			name: "update a download client",
			hook: useUpdateDownloadClient,
			fn: updateDownloadClientFn,
			variables: { id: 3, name: "SABnzbd" },
			errorText: "Failed to update download client",
		},
		{
			name: "delete a download client",
			hook: useDeleteDownloadClient,
			fn: deleteDownloadClientFn,
			variables: 4,
			errorText: "Failed to delete download client",
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
