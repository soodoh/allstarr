import { QueryClient } from "@tanstack/react-query";
import { runMutation } from "src/test/mutations";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
	createDownloadFormatFn,
	createDownloadProfileFn,
	deleteDownloadFormatFn,
	deleteDownloadProfileFn,
	error,
	invalidateQueries,
	success,
	updateDownloadFormatFn,
	updateDownloadProfileFn,
} = vi.hoisted(() => ({
	createDownloadFormatFn: vi.fn(),
	createDownloadProfileFn: vi.fn(),
	deleteDownloadFormatFn: vi.fn(),
	deleteDownloadProfileFn: vi.fn(),
	error: vi.fn(),
	invalidateQueries: vi.fn(),
	success: vi.fn(),
	updateDownloadFormatFn: vi.fn(),
	updateDownloadProfileFn: vi.fn(),
}));

vi.mock("sonner", () => ({
	toast: {
		error,
		success,
	},
}));

vi.mock("src/server/download-profiles", () => ({
	createDownloadFormatFn: (...args: unknown[]) =>
		createDownloadFormatFn(...args),
	createDownloadProfileFn: (...args: unknown[]) =>
		createDownloadProfileFn(...args),
	deleteDownloadFormatFn: (...args: unknown[]) =>
		deleteDownloadFormatFn(...args),
	deleteDownloadProfileFn: (...args: unknown[]) =>
		deleteDownloadProfileFn(...args),
	updateDownloadFormatFn: (...args: unknown[]) =>
		updateDownloadFormatFn(...args),
	updateDownloadProfileFn: (...args: unknown[]) =>
		updateDownloadProfileFn(...args),
}));

import { queryKeys } from "src/lib/query-keys";

import {
	useCreateDownloadFormat,
	useCreateDownloadProfile,
	useDeleteDownloadFormat,
	useDeleteDownloadProfile,
	useUpdateDownloadFormat,
	useUpdateDownloadProfile,
} from "./download-profiles";

describe("mutations/download-profiles", () => {
	beforeEach(() => {
		vi.spyOn(QueryClient.prototype, "invalidateQueries").mockImplementation(
			invalidateQueries,
		);
	});

	afterEach(() => {
		vi.restoreAllMocks();
		createDownloadFormatFn.mockReset();
		createDownloadProfileFn.mockReset();
		deleteDownloadFormatFn.mockReset();
		deleteDownloadProfileFn.mockReset();
		error.mockReset();
		invalidateQueries.mockReset();
		success.mockReset();
		updateDownloadFormatFn.mockReset();
		updateDownloadProfileFn.mockReset();
	});

	it.each([
		{
			name: "create a download profile",
			hook: useCreateDownloadProfile,
			fn: createDownloadProfileFn,
			variables: { name: "Standard" },
			call: { data: { name: "Standard" } },
			toast: "Profile created",
			invalidations: [queryKeys.downloadProfiles.all],
		},
		{
			name: "update a download profile",
			hook: useUpdateDownloadProfile,
			fn: updateDownloadProfileFn,
			variables: { id: 1, name: "Standard" },
			call: { data: { id: 1, name: "Standard" } },
			toast: "Profile updated",
			invalidations: [queryKeys.downloadProfiles.all],
		},
		{
			name: "delete a download profile",
			hook: useDeleteDownloadProfile,
			fn: deleteDownloadProfileFn,
			variables: 2,
			call: { data: { id: 2 } },
			toast: "Profile deleted",
			invalidations: [queryKeys.downloadProfiles.all],
		},
		{
			name: "create a download format",
			hook: useCreateDownloadFormat,
			fn: createDownloadFormatFn,
			variables: { name: "Hardcover" },
			call: { data: { name: "Hardcover" } },
			toast: "Format created",
			invalidations: [
				queryKeys.downloadFormats.all,
				queryKeys.downloadProfiles.all,
			],
		},
		{
			name: "update a download format",
			hook: useUpdateDownloadFormat,
			fn: updateDownloadFormatFn,
			variables: { id: 3, name: "Hardcover" },
			call: { data: { id: 3, name: "Hardcover" } },
			invalidations: [
				queryKeys.downloadFormats.all,
				queryKeys.downloadProfiles.all,
			],
		},
		{
			name: "delete a download format",
			hook: useDeleteDownloadFormat,
			fn: deleteDownloadFormatFn,
			variables: 4,
			call: { data: { id: 4 } },
			toast: "Format deleted",
			invalidations: [
				queryKeys.downloadFormats.all,
				queryKeys.downloadProfiles.all,
			],
		},
	])("wires $name mutations and invalidates the download profile caches", async ({
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
		if (toast) {
			expect(success).toHaveBeenCalledWith(toast);
		}
		for (const queryKey of invalidations) {
			expect(invalidateQueries).toHaveBeenCalledWith({ queryKey });
		}
	});

	it.each([
		{
			name: "delete a download profile",
			hook: useDeleteDownloadProfile,
			fn: deleteDownloadProfileFn,
			variables: 5,
			errorText: "Failed to delete profile",
		},
		{
			name: "create a download format",
			hook: useCreateDownloadFormat,
			fn: createDownloadFormatFn,
			variables: { name: "Paperback" },
			errorText: "Failed to create download format",
		},
		{
			name: "update a download format",
			hook: useUpdateDownloadFormat,
			fn: updateDownloadFormatFn,
			variables: { id: 6, name: "Paperback" },
			errorText: "Failed to update download format",
		},
		{
			name: "delete a download format",
			hook: useDeleteDownloadFormat,
			fn: deleteDownloadFormatFn,
			variables: 7,
			errorText: "Failed to delete download format",
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
