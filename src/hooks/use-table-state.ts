import { useState, useMemo, useEffect } from "react";

export type SortDirection = "asc" | "desc" | undefined;

export type TableState<TData> = {
  page: number;
  pageSize: number;
  sortColumn: string | undefined;
  sortDirection: SortDirection;
  setPage: (page: number) => void;
  setPageSize: (size: number) => void;
  setSortColumn: (col: string | undefined) => void;
  setSortDirection: (dir: SortDirection) => void;
  handleSort: (col: string) => void;
  paginatedData: TData[];
  totalPages: number;
};

type UseTableStateOptions<TData> = {
  data: TData[];
  defaultPageSize?: number;
  comparators?: Partial<Record<string, (a: TData, b: TData) => number>>;
};

export function useTableState<TData>({
  data,
  defaultPageSize = 25,
  comparators = {},
}: UseTableStateOptions<TData>): TableState<TData> {
  const [page, setPageRaw] = useState(1);
  const [pageSize, setPageSizeRaw] = useState(defaultPageSize);
  const [sortColumn, setSortColumnRaw] = useState<string | undefined>(
    undefined,
  );
  const [sortDirection, setSortDirectionRaw] =
    useState<SortDirection>(undefined);

  const setPage = (p: number) => setPageRaw(p);

  const setPageSize = (size: number) => {
    setPageSizeRaw(size);
    setPageRaw(1);
  };

  const setSortColumn = (col: string | undefined) => {
    setSortColumnRaw(col);
    setPageRaw(1);
  };

  const setSortDirection = (dir: SortDirection) => {
    setSortDirectionRaw(dir);
    setPageRaw(1);
  };

  /** Cycle: null → asc → desc → null */
  const handleSort = (col: string) => {
    if (sortColumn !== col) {
      setSortColumnRaw(col);
      setSortDirectionRaw("asc");
      setPageRaw(1);
    } else if (sortDirection === "asc") {
      setSortDirectionRaw("desc");
      setPageRaw(1);
    } else if (sortDirection === "desc") {
      setSortColumnRaw(undefined);
      setSortDirectionRaw(undefined);
      setPageRaw(1);
    }
  };

  const sortedData = useMemo(() => {
    if (!sortColumn || !sortDirection) {
      return data;
    }
    const comparator = comparators[sortColumn];
    if (!comparator) {
      return data;
    }
    const sorted = [...data].toSorted(comparator);
    return sortDirection === "desc" ? sorted.toReversed() : sorted;
  }, [data, sortColumn, sortDirection, comparators]);

  const totalPages = Math.max(1, Math.ceil(sortedData.length / pageSize));

  // Clamp page when data shrinks (e.g. after a filter or page size increase)
  useEffect(() => {
    if (page > totalPages) {
      setPageRaw(totalPages);
    }
  }, [page, totalPages]);

  const paginatedData = useMemo(() => {
    const start = (page - 1) * pageSize;
    return sortedData.slice(start, start + pageSize);
  }, [sortedData, page, pageSize]);

  return {
    page,
    pageSize,
    sortColumn,
    sortDirection,
    setPage,
    setPageSize,
    setSortColumn,
    setSortDirection,
    handleSort,
    paginatedData,
    totalPages,
  };
}
