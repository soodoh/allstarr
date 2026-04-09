import { QueryClient } from "@tanstack/react-query";
import { act } from "@testing-library/react";
import { renderHook } from "src/test/render";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
	addCategoryToProfileFn,
	bulkSetProfileCFScoresFn,
	createCustomFormatFn,
	deleteCustomFormatFn,
	duplicateCustomFormatFn,
	error,
	invalidateQueries,
	removeProfileCFsFn,
	setProfileCFScoreFn,
	success,
	updateCustomFormatFn,
} = vi.hoisted(() => ({
	addCategoryToProfileFn: vi.fn(),
	bulkSetProfileCFScoresFn: vi.fn(),
	createCustomFormatFn: vi.fn(),
	deleteCustomFormatFn: vi.fn(),
	duplicateCustomFormatFn: vi.fn(),
	error: vi.fn(),
	invalidateQueries: vi.fn(),
	removeProfileCFsFn: vi.fn(),
	setProfileCFScoreFn: vi.fn(),
	success: vi.fn(),
	updateCustomFormatFn: vi.fn(),
}));

vi.mock("sonner", () => ({
	toast: {
		error,
		success,
	},
}));

vi.mock("src/server/custom-formats", () => ({
	addCategoryToProfileFn: (...args: unknown[]) =>
		addCategoryToProfileFn(...args),
	bulkSetProfileCFScoresFn: (...args: unknown[]) =>
		bulkSetProfileCFScoresFn(...args),
	createCustomFormatFn: (...args: unknown[]) => createCustomFormatFn(...args),
	deleteCustomFormatFn: (...args: unknown[]) => deleteCustomFormatFn(...args),
	duplicateCustomFormatFn: (...args: unknown[]) =>
		duplicateCustomFormatFn(...args),
	removeProfileCFsFn: (...args: unknown[]) => removeProfileCFsFn(...args),
	setProfileCFScoreFn: (...args: unknown[]) => setProfileCFScoreFn(...args),
	updateCustomFormatFn: (...args: unknown[]) => updateCustomFormatFn(...args),
}));

import { queryKeys } from "src/lib/query-keys";

import {
	useAddCategoryToProfile,
	useBulkSetProfileCFScores,
	useCreateCustomFormat,
	useDeleteCustomFormat,
	useDuplicateCustomFormat,
	useRemoveProfileCFs,
	useSetProfileCFScore,
	useUpdateCustomFormat,
} from "./custom-formats";

type HookRunner = () => { mutateAsync: (variables: any) => Promise<any> };

async function runMutation(useHook: HookRunner, variables: unknown) {
	const { result } = renderHook(() => useHook());

	await act(async () => {
		await result.current.mutateAsync(variables as never);
	});
}

describe("mutations/custom-formats", () => {
	beforeEach(() => {
		vi.spyOn(QueryClient.prototype, "invalidateQueries").mockImplementation(
			invalidateQueries,
		);
	});

	afterEach(() => {
		vi.restoreAllMocks();
		addCategoryToProfileFn.mockReset();
		bulkSetProfileCFScoresFn.mockReset();
		createCustomFormatFn.mockReset();
		deleteCustomFormatFn.mockReset();
		duplicateCustomFormatFn.mockReset();
		error.mockReset();
		invalidateQueries.mockReset();
		removeProfileCFsFn.mockReset();
		setProfileCFScoreFn.mockReset();
		success.mockReset();
		updateCustomFormatFn.mockReset();
	});

	it.each([
		{
			name: "create custom format",
			hook: useCreateCustomFormat,
			fn: createCustomFormatFn,
			variables: { name: "New format" },
			call: { data: { name: "New format" } },
			toast: "Custom format created",
		},
		{
			name: "update custom format",
			hook: useUpdateCustomFormat,
			fn: updateCustomFormatFn,
			variables: { id: 1, name: "Renamed" },
			call: { data: { id: 1, name: "Renamed" } },
			toast: "Custom format updated",
		},
		{
			name: "delete custom format",
			hook: useDeleteCustomFormat,
			fn: deleteCustomFormatFn,
			variables: 2,
			call: { data: { id: 2 } },
			toast: "Custom format deleted",
		},
		{
			name: "duplicate custom format",
			hook: useDuplicateCustomFormat,
			fn: duplicateCustomFormatFn,
			variables: 3,
			call: { data: { id: 3 } },
			toast: "Custom format duplicated",
		},
		{
			name: "set a profile score",
			hook: useSetProfileCFScore,
			fn: setProfileCFScoreFn,
			variables: { profileId: 4, customFormatId: 5, score: 6 },
			call: { data: { profileId: 4, customFormatId: 5, score: 6 } },
		},
		{
			name: "bulk set profile scores",
			hook: useBulkSetProfileCFScores,
			fn: bulkSetProfileCFScoresFn,
			variables: {
				profileId: 7,
				scores: [{ customFormatId: 8, score: 9 }],
			},
			call: {
				data: {
					profileId: 7,
					scores: [{ customFormatId: 8, score: 9 }],
				},
			},
			toast: "Custom format scores updated",
		},
		{
			name: "remove profile formats",
			hook: useRemoveProfileCFs,
			fn: removeProfileCFsFn,
			variables: { profileId: 10, customFormatIds: [11, 12] },
			call: { data: { profileId: 10, customFormatIds: [11, 12] } },
		},
		{
			name: "add category formats",
			hook: useAddCategoryToProfile,
			fn: addCategoryToProfileFn,
			variables: { profileId: 13, category: "Science Fiction" },
			call: { data: { profileId: 13, category: "Science Fiction" } },
			toast: "Category formats added",
		},
	])("wires $name mutations and invalidates custom format caches", async ({
		hook,
		fn,
		variables,
		call,
		toast,
	}) => {
		fn.mockResolvedValue({ ok: true });

		await runMutation(hook, variables);

		expect(fn).toHaveBeenCalledWith(call);
		if (toast) {
			expect(success).toHaveBeenCalledWith(toast);
		}
		expect(invalidateQueries).toHaveBeenCalledWith({
			queryKey: queryKeys.customFormats.all,
		});
	});
});
