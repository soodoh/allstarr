import { QueryClient } from "@tanstack/react-query";
import { runMutation } from "src/test/mutations";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
	cancelQueries,
	getQueryData,
	invalidateQueries,
	resetColumnSettingsFn,
	setQueryData,
	upsertUserSettingsFn,
} = vi.hoisted(() => ({
	cancelQueries: vi.fn(),
	getQueryData: vi.fn(),
	invalidateQueries: vi.fn(),
	resetColumnSettingsFn: vi.fn(),
	setQueryData: vi.fn(),
	upsertUserSettingsFn: vi.fn(),
}));

vi.mock("src/server/user-settings", () => ({
	resetColumnSettingsFn: (...args: unknown[]) => resetColumnSettingsFn(...args),
	upsertUserSettingsFn: (...args: unknown[]) => upsertUserSettingsFn(...args),
}));

import { queryKeys } from "src/lib/query-keys";

import { useResetColumnSettings, useUpsertUserSettings } from "./user-settings";

describe("mutations/user-settings", () => {
	beforeEach(() => {
		vi.spyOn(QueryClient.prototype, "cancelQueries").mockImplementation(
			cancelQueries,
		);
		vi.spyOn(QueryClient.prototype, "getQueryData").mockImplementation(
			getQueryData,
		);
		vi.spyOn(QueryClient.prototype, "invalidateQueries").mockImplementation(
			invalidateQueries,
		);
		vi.spyOn(QueryClient.prototype, "setQueryData").mockImplementation(
			setQueryData,
		);
	});

	afterEach(() => {
		vi.restoreAllMocks();
		cancelQueries.mockReset();
		getQueryData.mockReset();
		invalidateQueries.mockReset();
		resetColumnSettingsFn.mockReset();
		setQueryData.mockReset();
		upsertUserSettingsFn.mockReset();
	});

	it("optimistically updates table settings and invalidates the table cache", async () => {
		const previous = {
			addDefaults: { layout: "compact" },
			columnOrder: ["old"],
			hiddenColumns: ["secret"],
			viewMode: "table",
		};
		getQueryData.mockReturnValue(previous);
		upsertUserSettingsFn.mockResolvedValue({ success: true });

		await runMutation(useUpsertUserSettings, {
			addDefaults: { layout: "full" },
			columnOrder: ["title", "author"],
			hiddenColumns: ["isbn"],
			tableId: "books",
			viewMode: "grid",
		});

		expect(cancelQueries).toHaveBeenCalledWith({
			queryKey: queryKeys.userSettings.byTable("books"),
		});
		expect(getQueryData).toHaveBeenCalledWith(
			queryKeys.userSettings.byTable("books"),
		);
		const updater = setQueryData.mock.calls[0]?.[1] as (
			old: Record<string, unknown> | null,
		) => Record<string, unknown>;
		expect(
			updater({
				...previous,
				other: true,
			}),
		).toEqual({
			addDefaults: { layout: "full" },
			columnOrder: ["title", "author"],
			hiddenColumns: ["isbn"],
			other: true,
			viewMode: "grid",
		});
		expect(upsertUserSettingsFn).toHaveBeenCalledWith({
			data: {
				addDefaults: { layout: "full" },
				columnOrder: ["title", "author"],
				hiddenColumns: ["isbn"],
				tableId: "books",
				viewMode: "grid",
			},
		});
		expect(invalidateQueries).toHaveBeenCalledWith({
			queryKey: queryKeys.userSettings.byTable("books"),
		});
	});

	it("rolls back optimistic table settings when the mutation fails", async () => {
		const previous = {
			columnOrder: ["old"],
			hiddenColumns: ["secret"],
			viewMode: "table",
		};
		getQueryData.mockReturnValue(previous);
		upsertUserSettingsFn.mockRejectedValue(new Error("boom"));

		await runMutation(
			useUpsertUserSettings,
			{
				columnOrder: ["title", "author"],
				tableId: "books",
			},
			true,
		);

		expect(setQueryData).toHaveBeenNthCalledWith(
			1,
			queryKeys.userSettings.byTable("books"),
			expect.any(Function),
		);
		expect(setQueryData).toHaveBeenNthCalledWith(
			2,
			queryKeys.userSettings.byTable("books"),
			previous,
		);
		expect(invalidateQueries).toHaveBeenCalledWith({
			queryKey: queryKeys.userSettings.byTable("books"),
		});
	});

	it("optimistically resets table columns and invalidates the table cache", async () => {
		const previous = {
			columnOrder: ["old"],
			hiddenColumns: ["secret"],
			viewMode: "table",
		};
		getQueryData.mockReturnValue(previous);
		resetColumnSettingsFn.mockResolvedValue({ success: true });

		await runMutation(useResetColumnSettings, { tableId: "shows" });

		expect(cancelQueries).toHaveBeenCalledWith({
			queryKey: queryKeys.userSettings.byTable("shows"),
		});
		const updater = setQueryData.mock.calls[0]?.[1] as (
			old: Record<string, unknown> | null,
		) => Record<string, unknown>;
		expect(updater(previous)).toEqual({
			columnOrder: [],
			hiddenColumns: [],
			viewMode: "table",
		});
		expect(resetColumnSettingsFn).toHaveBeenCalledWith({
			data: { tableId: "shows" },
		});
		expect(invalidateQueries).toHaveBeenCalledWith({
			queryKey: queryKeys.userSettings.byTable("shows"),
		});
	});

	it("rolls back optimistic column resets when the mutation fails", async () => {
		const previous = {
			columnOrder: ["episode"],
			hiddenColumns: ["runtime"],
			viewMode: "grid",
		};
		getQueryData.mockReturnValue(previous);
		resetColumnSettingsFn.mockRejectedValue(new Error("boom"));

		await runMutation(useResetColumnSettings, { tableId: "shows" }, true);

		expect(setQueryData).toHaveBeenNthCalledWith(
			1,
			queryKeys.userSettings.byTable("shows"),
			expect.any(Function),
		);
		expect(setQueryData).toHaveBeenNthCalledWith(
			2,
			queryKeys.userSettings.byTable("shows"),
			previous,
		);
		expect(invalidateQueries).toHaveBeenCalledWith({
			queryKey: queryKeys.userSettings.byTable("shows"),
		});
	});
});
