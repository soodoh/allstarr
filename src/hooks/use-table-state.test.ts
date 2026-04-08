import { act } from "@testing-library/react";
import { renderHook } from "src/test/render";
import { describe, expect, it } from "vitest";

import { useTableState } from "./use-table-state";

describe("useTableState", () => {
	it("uses the unsorted data when no default sort is configured", () => {
		const data = [{ value: 3 }, { value: 1 }, { value: 2 }];

		const { result } = renderHook(() =>
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

	it("sorts asc, desc, then clears the sort when handleSort is called repeatedly", () => {
		const data = [{ value: 3 }, { value: 1 }, { value: 2 }];
		const comparators = {
			value: (a: (typeof data)[number], b: (typeof data)[number]) =>
				a.value - b.value,
		};

		const { result } = renderHook(() =>
			useTableState({
				comparators,
				data,
				defaultPageSize: 10,
			}),
		);

		act(() => {
			result.current.setPage(2);
			result.current.handleSort("value");
		});

		expect(result.current.page).toBe(1);
		expect(result.current.sortColumn).toBe("value");
		expect(result.current.sortDirection).toBe("asc");
		expect(result.current.paginatedData).toEqual([
			{ value: 1 },
			{ value: 2 },
			{ value: 3 },
		]);

		act(() => {
			result.current.handleSort("value");
		});

		expect(result.current.sortDirection).toBe("desc");
		expect(result.current.paginatedData).toEqual([
			{ value: 3 },
			{ value: 2 },
			{ value: 1 },
		]);

		act(() => {
			result.current.handleSort("value");
		});

		expect(result.current.sortColumn).toBeUndefined();
		expect(result.current.sortDirection).toBeUndefined();
		expect(result.current.paginatedData).toEqual(data);
	});

	it("resets pagination when page size or explicit sort state changes", () => {
		const data = [{ value: 1 }, { value: 2 }, { value: 3 }];

		const { result } = renderHook(() =>
			useTableState({
				data,
				defaultPageSize: 1,
			}),
		);

		act(() => {
			result.current.setPage(3);
		});

		expect(result.current.page).toBe(3);

		act(() => {
			result.current.setPageSize(2);
		});

		expect(result.current.page).toBe(1);
		expect(result.current.pageSize).toBe(2);

		act(() => {
			result.current.setPage(2);
			result.current.setSortColumn("value");
		});

		expect(result.current.page).toBe(1);
		expect(result.current.sortColumn).toBe("value");

		act(() => {
			result.current.setPage(2);
			result.current.setSortDirection("desc");
		});

		expect(result.current.page).toBe(1);
		expect(result.current.sortDirection).toBe("desc");
	});

	it("clamps the page when the sorted data shrinks", () => {
		const comparators = {
			value: (a: { value: number }, b: { value: number }) => a.value - b.value,
		};

		const { result, rerender } = renderHook(
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

		act(() => {
			result.current.setPage(2);
		});

		expect(result.current.page).toBe(2);
		expect(result.current.paginatedData).toEqual([{ value: 3 }, { value: 4 }]);

		rerender({
			data: [{ value: 1 }],
		});

		expect(result.current.page).toBe(1);
		expect(result.current.totalPages).toBe(1);
		expect(result.current.paginatedData).toEqual([{ value: 1 }]);
	});

	it("ignores a sort column when no comparator exists", () => {
		const data = [{ value: 2 }, { value: 1 }];

		const { result } = renderHook(() =>
			useTableState({
				data,
				defaultSortColumn: "missing",
				defaultSortDirection: "asc",
			}),
		);

		expect(result.current.paginatedData).toEqual(data);
	});
});
