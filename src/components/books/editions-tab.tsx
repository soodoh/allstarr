import { useMemo, useState } from "react";
import type { JSX } from "react";
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
import TablePagination from "src/components/shared/table-pagination";

type Edition = {
  id: number;
  title: string;
  foreignEditionId: string | undefined;
  format: string | undefined;
  publisher: string | undefined;
  editionInformation: string | undefined;
  pageCount: number | undefined;
  releaseDate: string | undefined;
  isbn10: string | undefined;
  isbn13: string | undefined;
  asin: string | undefined;
  language: string | undefined;
  languageCode: string | undefined;
  country: string | undefined;
  usersCount: number | undefined;
  score: number | undefined;
  images: Array<{ url: string; coverType: string }> | undefined;
};

type EditionSortKey = "title" | "publisher" | "information" | "format" | "pages" | "releaseDate" | "isbn13" | "isbn10" | "asin" | "language" | "country" | "readers" | "score";

type EditionColumn = {
  key: EditionSortKey;
  label: string;
};

const EDITION_COLUMNS: EditionColumn[] = [
  { key: "title", label: "Title" },
  { key: "publisher", label: "Publisher" },
  { key: "information", label: "Information" },
  { key: "format", label: "Type" },
  { key: "pages", label: "Pages" },
  { key: "releaseDate", label: "Release Date" },
  { key: "isbn13", label: "ISBN-13" },
  { key: "isbn10", label: "ISBN-10" },
  { key: "asin", label: "ASIN" },
  { key: "language", label: "Language" },
  { key: "country", label: "Country" },
  { key: "readers", label: "Readers" },
  { key: "score", label: "Data Score" },
];

const EDITION_SORT_ACCESSORS: Record<EditionSortKey, (e: Edition) => string | number> = {
  title: (e) => e.title || "",
  publisher: (e) => e.publisher || "",
  information: (e) => e.editionInformation || "",
  format: (e) => e.format || "",
  pages: (e) => e.pageCount ?? -1,
  releaseDate: (e) => e.releaseDate || "",
  isbn13: (e) => e.isbn13 || "",
  isbn10: (e) => e.isbn10 || "",
  asin: (e) => e.asin || "",
  language: (e) => e.language || "",
  country: (e) => e.country || "",
  readers: (e) => e.usersCount ?? -1,
  score: (e) => e.score ?? -1,
};

function getEditionSortValue(edition: Edition, key: EditionSortKey): string | number {
  return EDITION_SORT_ACCESSORS[key](edition);
}

export default function EditionsTab({
  editions,
}: {
  editions: Edition[];
}): JSX.Element {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [sortBy, setSortBy] = useState<EditionSortKey>("readers");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

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

  const sortedEditions = useMemo(() => {
    return [...editions].toSorted((a, b) => {
      const av = getEditionSortValue(a, sortBy);
      const bv = getEditionSortValue(b, sortBy);
      let cmp: number;
      if (typeof av === "number" && typeof bv === "number") {
        cmp = av - bv;
      } else {
        cmp = String(av).localeCompare(String(bv));
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [editions, sortBy, sortDir]);

  const total = sortedEditions.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const pagedEditions = sortedEditions.slice((page - 1) * pageSize, page * pageSize);

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
              {EDITION_COLUMNS.map(({ key, label }) => (
                <TableHead
                  key={key}
                  className="cursor-pointer select-none hover:text-foreground"
                  onClick={() => handleSort(key)}
                >
                  {label}
                  <SortIcon col={key} />
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {pagedEditions.length > 0 &&
              pagedEditions.map((edition) => {
                const coverUrl = edition.images?.[0]?.url;
                return (
                  <TableRow key={edition.id}>
                    <TableCell>
                      {coverUrl ? (
                        <img
                          src={coverUrl}
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
                      {edition.publisher || "—"}
                    </TableCell>
                    <TableCell className="max-w-48 truncate">
                      {edition.editionInformation || "—"}
                    </TableCell>
                    <TableCell>{edition.format || "—"}</TableCell>
                    <TableCell>{edition.pageCount ?? "—"}</TableCell>
                    <TableCell className="whitespace-nowrap">
                      {edition.releaseDate || "—"}
                    </TableCell>
                    <TableCell>{edition.isbn13 || "—"}</TableCell>
                    <TableCell>{edition.isbn10 || "—"}</TableCell>
                    <TableCell>{edition.asin || "—"}</TableCell>
                    <TableCell>{edition.language || "—"}</TableCell>
                    <TableCell>{edition.country || "—"}</TableCell>
                    <TableCell>{(edition.usersCount ?? 0).toLocaleString()}</TableCell>
                    <TableCell>{(edition.score ?? 0).toLocaleString()}</TableCell>
                  </TableRow>
                );
              })}
            {pagedEditions.length === 0 && (
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
      {total > 0 && (
        <TablePagination
          page={page}
          pageSize={pageSize}
          totalItems={total}
          totalPages={totalPages}
          onPageChange={setPage}
          onPageSizeChange={handlePageSizeChange}
        />
      )}
    </TabsContent>
  );
}
