import { QueryClient } from "@tanstack/react-query";
import { runMutation } from "src/test/mutations";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
	applyImportPlanFn,
	createImportSourceFn,
	deleteImportSourceFn,
	error,
	invalidateQueries,
	refreshImportSourceFn,
	resolveImportReviewItemFn,
	success,
	updateImportSourceFn,
} = vi.hoisted(() => ({
	applyImportPlanFn: vi.fn(),
	createImportSourceFn: vi.fn(),
	deleteImportSourceFn: vi.fn(),
	error: vi.fn(),
	invalidateQueries: vi.fn(),
	refreshImportSourceFn: vi.fn(),
	resolveImportReviewItemFn: vi.fn(),
	success: vi.fn(),
	updateImportSourceFn: vi.fn(),
}));

vi.mock("sonner", () => ({
	toast: {
		error,
		success,
	},
}));

vi.mock("src/server/import-sources", () => ({
	applyImportPlanFn: (...args: unknown[]) => applyImportPlanFn(...args),
	createImportSourceFn: (...args: unknown[]) => createImportSourceFn(...args),
	deleteImportSourceFn: (...args: unknown[]) => deleteImportSourceFn(...args),
	refreshImportSourceFn: (...args: unknown[]) => refreshImportSourceFn(...args),
	resolveImportReviewItemFn: (...args: unknown[]) =>
		resolveImportReviewItemFn(...args),
	updateImportSourceFn: (...args: unknown[]) => updateImportSourceFn(...args),
}));

import { queryKeys } from "src/lib/query-keys";

import {
	useApplyImportPlan,
	useCreateImportSource,
	useDeleteImportSource,
	useRefreshImportSource,
	useResolveImportReviewItem,
	useUpdateImportSource,
} from "./imports";

describe("mutations/imports", () => {
	beforeEach(() => {
		vi.spyOn(QueryClient.prototype, "invalidateQueries").mockImplementation(
			invalidateQueries,
		);
	});

	afterEach(() => {
		vi.restoreAllMocks();
		applyImportPlanFn.mockReset();
		createImportSourceFn.mockReset();
		deleteImportSourceFn.mockReset();
		error.mockReset();
		invalidateQueries.mockReset();
		refreshImportSourceFn.mockReset();
		resolveImportReviewItemFn.mockReset();
		success.mockReset();
		updateImportSourceFn.mockReset();
	});

	it.each([
		{
			name: "create an import source",
			hook: useCreateImportSource,
			fn: createImportSourceFn,
			variables: {
				apiKey: "secret",
				baseUrl: "http://localhost:8989",
				kind: "sonarr",
				label: "Sonarr",
			},
			call: {
				data: {
					apiKey: "secret",
					baseUrl: "http://localhost:8989",
					kind: "sonarr",
					label: "Sonarr",
				},
			},
			toast: "Import source created",
		},
		{
			name: "update an import source",
			hook: useUpdateImportSource,
			fn: updateImportSourceFn,
			variables: {
				apiKey: "secret",
				baseUrl: "http://localhost:8989",
				id: 1,
				kind: "sonarr",
				label: "Sonarr Main",
			},
			call: {
				data: {
					apiKey: "secret",
					baseUrl: "http://localhost:8989",
					id: 1,
					kind: "sonarr",
					label: "Sonarr Main",
				},
			},
			toast: "Import source updated",
		},
		{
			name: "delete an import source",
			hook: useDeleteImportSource,
			fn: deleteImportSourceFn,
			variables: { id: 2 },
			call: { data: { id: 2 } },
			toast: "Import source deleted",
		},
		{
			name: "refresh an import source",
			hook: useRefreshImportSource,
			fn: refreshImportSourceFn,
			variables: { id: 3 },
			call: { data: { id: 3 } },
			toast: "Import source refreshed",
		},
		{
			name: "resolve an import review item",
			hook: useResolveImportReviewItem,
			fn: resolveImportReviewItemFn,
			variables: { id: 4, status: "resolved" as const },
			call: { data: { id: 4, status: "resolved" } },
			toast: "Review item updated",
		},
	])("wires $name and invalidates the imports cache", async ({
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
			queryKey: queryKeys.imports.all,
		});
	});

	it("wires import plan apply success messaging and invalidation", async () => {
		applyImportPlanFn.mockResolvedValue({
			appliedCount: 2,
			reviewCount: 1,
		});

		await runMutation(useApplyImportPlan, {
			selectedRows: [],
			sourceId: 5,
		});

		expect(applyImportPlanFn).toHaveBeenCalledWith({
			data: {
				selectedRows: [],
				sourceId: 5,
			},
		});
		expect(success).toHaveBeenCalledWith(
			"Applied 2 rows; 1 review item queued",
		);
		expect(invalidateQueries).toHaveBeenCalledWith({
			queryKey: queryKeys.imports.all,
		});
	});

	it.each([
		{
			hook: useCreateImportSource,
			fn: createImportSourceFn,
			variables: {
				apiKey: "secret",
				baseUrl: "http://localhost:8989",
				kind: "sonarr",
				label: "Sonarr",
			},
			fallback: "Failed to create import source",
		},
		{
			hook: useUpdateImportSource,
			fn: updateImportSourceFn,
			variables: {
				apiKey: "secret",
				baseUrl: "http://localhost:8989",
				id: 1,
				kind: "sonarr",
				label: "Sonarr Main",
			},
			fallback: "Failed to update import source",
		},
		{
			hook: useDeleteImportSource,
			fn: deleteImportSourceFn,
			variables: { id: 2 },
			fallback: "Failed to delete import source",
		},
		{
			hook: useRefreshImportSource,
			fn: refreshImportSourceFn,
			variables: { id: 3 },
			fallback: "Failed to refresh import source",
		},
		{
			hook: useApplyImportPlan,
			fn: applyImportPlanFn,
			variables: { selectedRows: [], sourceId: 5 },
			fallback: "Failed to apply import plan",
		},
		{
			hook: useResolveImportReviewItem,
			fn: resolveImportReviewItemFn,
			variables: { id: 4, status: "resolved" as const },
			fallback: "Failed to update review item",
		},
	])("shows the server error message when %p fails", async ({
		hook,
		fn,
		variables,
	}) => {
		fn.mockRejectedValue(new Error("boom"));

		await runMutation(hook, variables, true);

		expect(error).toHaveBeenCalledWith("boom");
	});

	it.each([
		{
			hook: useCreateImportSource,
			fn: createImportSourceFn,
			variables: {
				apiKey: "secret",
				baseUrl: "http://localhost:8989",
				kind: "sonarr",
				label: "Sonarr",
			},
			fallback: "Failed to create import source",
		},
		{
			hook: useUpdateImportSource,
			fn: updateImportSourceFn,
			variables: {
				apiKey: "secret",
				baseUrl: "http://localhost:8989",
				id: 1,
				kind: "sonarr",
				label: "Sonarr Main",
			},
			fallback: "Failed to update import source",
		},
		{
			hook: useDeleteImportSource,
			fn: deleteImportSourceFn,
			variables: { id: 2 },
			fallback: "Failed to delete import source",
		},
		{
			hook: useRefreshImportSource,
			fn: refreshImportSourceFn,
			variables: { id: 3 },
			fallback: "Failed to refresh import source",
		},
		{
			hook: useApplyImportPlan,
			fn: applyImportPlanFn,
			variables: { selectedRows: [], sourceId: 5 },
			fallback: "Failed to apply import plan",
		},
		{
			hook: useResolveImportReviewItem,
			fn: resolveImportReviewItemFn,
			variables: { id: 4, status: "resolved" as const },
			fallback: "Failed to update review item",
		},
	])("shows fallback error messages for non-Error failures", async ({
		hook,
		fn,
		variables,
		fallback,
	}) => {
		fn.mockRejectedValue("nope");

		await runMutation(hook, variables, true);

		expect(error).toHaveBeenCalledWith(fallback);
	});

	it.each([
		{
			result: { appliedCount: 1, reviewCount: 0 },
			message: "Applied 1 row",
		},
		{
			result: { appliedCount: 1, reviewCount: 2 },
			message: "Applied 1 row; 2 review items queued",
		},
	])("shows alternate import plan success labels", async ({
		result,
		message,
	}) => {
		applyImportPlanFn.mockResolvedValue(result);

		await runMutation(useApplyImportPlan, {
			selectedRows: [],
			sourceId: 5,
		});

		expect(success).toHaveBeenCalledWith(message);
	});

	it("invalidates imports after refresh errors so source status stays current", async () => {
		refreshImportSourceFn.mockRejectedValue(new Error("boom"));

		await runMutation(useRefreshImportSource, { id: 3 }, true);

		expect(error).toHaveBeenCalledWith("boom");
		expect(invalidateQueries).toHaveBeenCalledWith({
			queryKey: queryKeys.imports.all,
		});
	});
});
