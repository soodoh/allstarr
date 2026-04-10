import { renderHook } from "src/test/render";
import { afterEach, describe, expect, it, vi } from "vitest";

const { useQuery } = vi.hoisted(() => ({
	useQuery: vi.fn(),
}));

vi.mock("@tanstack/react-query", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@tanstack/react-query")>();

	return {
		...actual,
		useQuery: (...args: Parameters<typeof actual.useQuery>) =>
			useQuery(...args),
	};
});

vi.mock("src/lib/queries/user-settings", () => ({
	userSettingsQuery: (tableId: string) => ({
		queryFn: vi.fn(),
		queryKey: ["user-settings", tableId],
	}),
}));

import { useTableColumns } from "./use-table-columns";

describe("useTableColumns", () => {
	afterEach(() => {
		useQuery.mockReset();
	});

	it("uses the table defaults when user settings are absent", async () => {
		useQuery.mockReturnValue({ data: undefined });

		const { result } = await renderHook(() => useTableColumns("books"));

		expect(result.current.columnOrder).toEqual([
			"monitored",
			"cover",
			"title",
			"author",
			"series",
			"readers",
			"rating",
			"releaseDate",
		]);
		expect(result.current.hiddenColumnKeys).toEqual([]);
		expect(result.current.visibleColumns.map((column) => column.key)).toEqual([
			"monitored",
			"cover",
			"title",
			"author",
			"series",
			"readers",
			"rating",
			"releaseDate",
		]);
	});

	it("resolves saved order, appends new columns, removes stale keys, and keeps locked columns visible", async () => {
		useQuery.mockReturnValue({
			data: {
				columnOrder: ["title", "monitored", "missing-key", "cover"],
				hiddenColumns: ["monitored", "cover"],
			},
		});

		const { result } = await renderHook(() => useTableColumns("books"));

		expect(result.current.columnOrder).toEqual([
			"title",
			"monitored",
			"cover",
			"author",
			"series",
			"readers",
			"rating",
			"releaseDate",
		]);
		expect(result.current.allColumns.map((column) => column.key)).toEqual(
			result.current.columnOrder,
		);
		expect(result.current.hiddenKeys.has("monitored")).toBe(false);
		expect(result.current.hiddenKeys.has("cover")).toBe(true);
		expect(result.current.hiddenKeys.has("author")).toBe(true);
		expect(result.current.hiddenColumnKeys).toEqual([
			"cover",
			"author",
			"series",
			"readers",
			"rating",
			"releaseDate",
		]);
		expect(result.current.visibleColumns.map((column) => column.key)).toEqual([
			"title",
			"monitored",
		]);
	});

	it("falls back to defaults when the saved column order is empty", async () => {
		useQuery.mockReturnValue({
			data: {
				columnOrder: [],
				hiddenColumns: ["cover"],
			},
		});

		const { result } = await renderHook(() => useTableColumns("movies"));

		expect(result.current.columnOrder).toEqual([
			"monitored",
			"cover",
			"title",
			"year",
			"studio",
			"status",
		]);
		expect(result.current.hiddenColumnKeys).toEqual([]);
		expect(result.current.visibleColumns.map((column) => column.key)).toEqual([
			"monitored",
			"cover",
			"title",
			"year",
			"studio",
			"status",
		]);
	});
});
