import { useMemo } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "src/components/ui/table";
import SortableTableHead from "src/components/shared/sortable-table-head";
import TablePagination from "src/components/shared/table-pagination";
import { useBookDetailModal } from "src/components/books/book-detail-modal-provider";
import { useTableState } from "src/hooks/use-table-state";

type Book = {
  id: number;
  title: string;
  authorName: string | undefined;
  releaseDate: string | undefined;
};

type BookTableProps = {
  books: Book[];
};

export default function BookTable({
  books,
}: BookTableProps): React.JSX.Element {
  const { openBookModal } = useBookDetailModal();

  const comparators = useMemo(
    () => ({
      title: (a: Book, b: Book) => a.title.localeCompare(b.title),
      author: (a: Book, b: Book) =>
        (a.authorName ?? "").localeCompare(b.authorName ?? ""),
      releaseDate: (a: Book, b: Book) =>
        (a.releaseDate ?? "").localeCompare(b.releaseDate ?? ""),
    }),
    [],
  );

  const {
    page,
    pageSize,
    sortColumn,
    sortDirection,
    setPage,
    setPageSize,
    handleSort,
    paginatedData,
    totalPages,
  } = useTableState({ data: books, comparators });

  if (books.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        No books found. Add one to get started.
      </div>
    );
  }

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <SortableTableHead
              column="title"
              sortColumn={sortColumn}
              sortDirection={sortDirection}
              onSort={handleSort}
            >
              Title
            </SortableTableHead>
            <SortableTableHead
              column="author"
              sortColumn={sortColumn}
              sortDirection={sortDirection}
              onSort={handleSort}
            >
              Author
            </SortableTableHead>
            <SortableTableHead
              column="releaseDate"
              sortColumn={sortColumn}
              sortDirection={sortDirection}
              onSort={handleSort}
            >
              Release Date
            </SortableTableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {paginatedData.map((book) => (
            <TableRow
              key={book.id}
              className="cursor-pointer"
              onClick={() => openBookModal(book.id)}
            >
              <TableCell className="font-medium">{book.title}</TableCell>
              <TableCell>{book.authorName || "Unknown"}</TableCell>
              <TableCell>{book.releaseDate || "Unknown"}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <div className="mt-4">
        <TablePagination
          page={page}
          pageSize={pageSize}
          totalItems={books.length}
          totalPages={totalPages}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
        />
      </div>
    </>
  );
}
