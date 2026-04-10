import { renderHook } from "src/test/render";
import { describe, expect, it, vi } from "vitest";

import { useTableState } from "./use-table-state";

describe("useTableState", () => {
	it("uses the unsorted data when no default sort is configured", async () => {
		const data = [{ value: 3 }, { value: 1 }, { value: 2 }];

		const { result } = await renderHook(() =>
			useTableState({
				data,
				defaultPageSize: 2,
			}),
		);

		expect(result.current.page).toBe(1);
		expect(result.current.pageSize).toBe(2);
		expect(result.current.totalPages).toBe(2);
		expect(result.current.paginatedData).toEqual([{ value: 3 }, { value: 1 }]);
	});

	it("sorts asc, desc, then clears the sort when handleSort is called repeatedly", async () => {
		const data = [{ value: 3 }, { value: 1 }, { value: 2 }];
		const comparators = {
			value: (a: (typeof data)[number], b: (typeof data)[number]) =>
				a.value - b.value,
		};

		const { result } = await renderHook(() =>
			useTableState({
				comparators,
				data,
				defaultPageSize: 10,
			}),
		);

		result.current.setPage(2);
		result.current.handleSort("value");

		await vi.waitFor(() => {
			expect(result.current.page).toBe(1);
			expect(result.current.sortColumn).toBe("value");
			expect(result.current.sortDirection).toBe("asc");
			expect(result.current.paginatedData).toEqual([
				{ value: 1 },
				{ value: 2 },
				{ value: 3 },
			]);
		});

		result.current.handleSort("value");

		await vi.waitFor(() => {
			expect(result.current.sortDirection).toBe("desc");
			expect(result.current.paginatedData).toEqual([
				{ value: 3 },
				{ value: 2 },
				{ value: 1 },
			]);
		});

		result.current.handleSort("value");

		await vi.waitFor(() => {
			expect(result.current.sortColumn).toBeUndefined();
			expect(result.current.sortDirection).toBeUndefined();
			expect(result.current.paginatedData).toEqual(data);
		});
	});

	it("resets pagination when page size or explicit sort state changes", async () => {
		const data = [{ value: 1 }, { value: 2 }, { value: 3 }];

		const { result } = await renderHook(() =>
			useTableState({
				data,
				defaultPageSize: 1,
			}),
		);

		result.current.setPage(3);

		await vi.waitFor(() => {
			expect(result.current.page).toBe(3);
		});

		result.current.setPageSize(2);

		await vi.waitFor(() => {
			expect(result.current.page).toBe(1);
			expect(result.current.pageSize).toBe(2);
		});

		result.current.setPage(2);
		result.current.setSortColumn("value");

		await vi.waitFor(() => {
			expect(result.current.page).toBe(1);
			expect(result.current.sortColumn).toBe("value");
		});

		result.current.setPage(2);
		result.current.setSortDirection("desc");

		await vi.waitFor(() => {
			expect(result.current.page).toBe(1);
			expect(result.current.sortDirection).toBe("desc");
		});
	});

	it("clamps the page when the sorted data shrinks", async () => {
		const comparators = {
			value: (a: { value: number }, b: { value: number }) => a.value - b.value,
		};

		const { result, rerender } = await renderHook(
			({ data }: { data: Array<{ value: number }> }) =>
				useTableState({
					comparators,
					data,
					defaultPageSize: 2,
					defaultSortColumn: "value",
					defaultSortDirection: "asc",
				}),
			{
				initialProps: {
					data: [{ value: 1 }, { value: 2 }, { value: 3 }, { value: 4 }],
				},
			},
		);

		result.current.setPage(2);

		await vi.waitFor(() => {
			expect(result.current.page).toBe(2);
			expect(result.current.paginatedData).toEqual([
				{ value: 3 },
				{ value: 4 },
			]);
		});

		rerender({
			data: [{ value: 1 }],
		});

		await vi.waitFor(() => {
			expect(result.current.page).toBe(1);
			expect(result.current.totalPages).toBe(1);
			expect(result.current.paginatedData).toEqual([{ value: 1 }]);
		});
	});

	it("ignores a sort column when no comparator exists", async () => {
		const data = [{ value: 2 }, { value: 1 }];

		const { result } = await renderHook(() =>
			useTableState({
				data,
				defaultSortColumn: "missing",
				defaultSortDirection: "asc",
			}),
		);

		expect(result.current.paginatedData).toEqual(data);
	});
});
