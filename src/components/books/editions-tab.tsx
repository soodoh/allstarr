import { useState } from "react";
import type { JSX } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ChevronDown,
  ChevronUp,
  ChevronsUpDown,
  ImageIcon,
} from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "src/components/ui/table";
import { TabsContent } from "src/components/ui/tabs";
import Skeleton from "src/components/ui/skeleton";
import TablePagination from "src/components/shared/table-pagination";
import { hardcoverBookEditionsQuery } from "src/lib/queries";
import type { EditionSortKey } from "src/server/search";

type EditionColumn = {
  key: EditionSortKey | "author";
  label: string;
  sortable: boolean;
};

const EDITION_COLUMNS: EditionColumn[] = [
  { key: "title", label: "Title", sortable: true },
  { key: "author", label: "Author", sortable: false },
  { key: "publisher", label: "Publisher", sortable: true },
  { key: "type", label: "Type", sortable: true },
  { key: "pages", label: "Pages", sortable: true },
  { key: "releaseDate", label: "Release Date", sortable: true },
  { key: "isbn13", label: "ISBN-13", sortable: true },
  { key: "isbn10", label: "ISBN-10", sortable: true },
  { key: "asin", label: "ASIN", sortable: true },
  { key: "language", label: "Language", sortable: true },
  { key: "country", label: "Country", sortable: true },
  { key: "readers", label: "Readers", sortable: true },
  { key: "score", label: "Data Score", sortable: true },
];

// oxlint-disable-next-line complexity -- Rendering edition table with sort, pagination, and loading states
export default function EditionsTab({
  foreignBookId,
  enabled,
}: {
  foreignBookId: string | undefined;
  enabled: boolean;
}): JSX.Element {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [sortBy, setSortBy] = useState<EditionSortKey>("readers");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const bookId = foreignBookId ? Number(foreignBookId) : 0;

  const { data, isLoading } = useQuery({
    ...hardcoverBookEditionsQuery(bookId, { page, pageSize, sortBy, sortDir }),
    enabled: enabled && bookId > 0,
  });

  const handleSort = (key: EditionSortKey) => {
    if (sortBy === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(key);
      setSortDir("asc");
    }
    setPage(1);
  };

  const handlePageSizeChange = (size: number) => {
    setPageSize(size);
    setPage(1);
  };

  const SortIcon = ({ col }: { col: EditionSortKey }) => {
    if (sortBy !== col) {
      return (
        <ChevronsUpDown className="ml-1 h-3.5 w-3.5 text-muted-foreground/50 inline" />
      );
    }
    return sortDir === "asc" ? (
      <ChevronUp className="ml-1 h-3.5 w-3.5 inline" />
    ) : (
      <ChevronDown className="ml-1 h-3.5 w-3.5 inline" />
    );
  };

  if (!foreignBookId) {
    return (
      <TabsContent value="editions" className="overflow-y-auto flex-1 min-h-0">
        <p className="text-sm text-muted-foreground py-4">
          No Hardcover ID linked to this book.
        </p>
      </TabsContent>
    );
  }

  return (
    <TabsContent
      value="editions"
      className="flex-1 min-h-0 flex flex-col gap-3"
    >
      <div className="overflow-auto flex-1 min-h-0">
        <Table className="min-w-max">
          <colgroup>
            <col className="w-14" />
            {EDITION_COLUMNS.map((col) => (
              <col key={col.key} />
            ))}
          </colgroup>
          <TableHeader>
            <TableRow>
              <TableHead />
              {EDITION_COLUMNS.map(({ key, label, sortable }) =>
                sortable ? (
                  <TableHead
                    key={key}
                    className="cursor-pointer select-none hover:text-foreground"
                    onClick={() => handleSort(key as EditionSortKey)}
                  >
                    {label}
                    <SortIcon col={key as EditionSortKey} />
                  </TableHead>
                ) : (
                  <TableHead key={key}>
                    {label}
                  </TableHead>
                ),
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading &&
              Array.from({ length: 5 }).map((_, i) => (
                // oxlint-disable-next-line react/no-array-index-key -- Skeleton rows have no unique identity
                <TableRow key={i}>
                  <TableCell>
                    <Skeleton className="w-10 aspect-[2/3] rounded-sm" />
                  </TableCell>
                  {EDITION_COLUMNS.map((col) => (
                    <TableCell key={col.key}>
                      <Skeleton className="h-4 w-16" />
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            {!isLoading && data && data.editions.length > 0 &&
              data.editions.map((edition) => (
                <TableRow key={edition.id}>
                  <TableCell>
                    {edition.coverUrl ? (
                      <img
                        src={edition.coverUrl}
                        alt={edition.title}
                        className="aspect-[2/3] w-full rounded-sm object-cover"
                      />
                    ) : (
                      <div className="aspect-[2/3] w-full rounded-sm bg-muted flex items-center justify-center">
                        <ImageIcon className="h-4 w-4 text-muted-foreground" />
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="font-medium max-w-48 truncate">
                    {edition.title}
                  </TableCell>
                  <TableCell className="max-w-36 truncate">
                    {edition.author || "—"}
                  </TableCell>
                  <TableCell className="max-w-36 truncate">
                    {edition.publisher || "—"}
                  </TableCell>
                  <TableCell>{edition.type || "—"}</TableCell>
                  <TableCell>{edition.pages ?? "—"}</TableCell>
                  <TableCell className="whitespace-nowrap">
                    {edition.releaseDate || "—"}
                  </TableCell>
                  <TableCell>{edition.isbn13 || "—"}</TableCell>
                  <TableCell>{edition.isbn10 || "—"}</TableCell>
                  <TableCell>{edition.asin || "—"}</TableCell>
                  <TableCell>{edition.language || "—"}</TableCell>
                  <TableCell>{edition.country || "—"}</TableCell>
                  <TableCell>{edition.readers.toLocaleString()}</TableCell>
                  <TableCell>{edition.score.toLocaleString()}</TableCell>
                </TableRow>
              ))}
            {!isLoading && (!data || data.editions.length === 0) && (
              <TableRow>
                <TableCell
                  colSpan={EDITION_COLUMNS.length + 1}
                  className="text-center text-muted-foreground py-8"
                >
                  No editions found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      {data && data.total > 0 && (
        <TablePagination
          page={data.page}
          pageSize={pageSize}
          totalItems={data.total}
          totalPages={data.totalPages}
          onPageChange={setPage}
          onPageSizeChange={handlePageSizeChange}
        />
      )}
    </TabsContent>
  );
}
