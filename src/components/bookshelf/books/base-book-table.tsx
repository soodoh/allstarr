import type { JSX, ReactNode } from "react";
import { ChevronDown, ChevronUp, ChevronsUpDown, Star } from "lucide-react";
import OptimizedImage from "src/components/shared/optimized-image";
import { cn } from "src/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "src/components/ui/table";
import { Badge } from "src/components/ui/badge";
import AdditionalAuthors from "src/components/bookshelf/books/additional-authors";
import type { BookAuthorEntry } from "src/components/bookshelf/books/additional-authors";

export type { BookAuthorEntry };

export type BookTableRow = {
  key: string | number;
  bookId: number;
  title: string;
  coverUrl: string | null;
  bookAuthors: BookAuthorEntry[];
  authorName: string | null;
  releaseDate: string | null;
  usersCount: number | null;
  rating: number | null;
  ratingsCount: number | null;
  format: string | null;
  pageCount: number | null;
  audioLength: number | null;
  isbn10: string | null;
  isbn13: string | null;
  asin: string | null;
  score: number | null;
  publisher: string | null;
  editionInformation: string | null;
  language: string | null;
  country: string | null;
  series: Array<{ title: string; position: string | null }>;
  monitored: boolean;
  downloadProfileIds: number[];
};

export type ColumnKey =
  | "monitored"
  | "cover"
  | "title"
  | "author"
  | "releaseDate"
  | "readers"
  | "rating"
  | "format"
  | "pages"
  | "isbn10"
  | "isbn13"
  | "asin"
  | "score"
  | "publisher"
  | "information"
  | "language"
  | "country"
  | "series";

type ColumnDef = {
  label: string;
  render: (row: BookTableRow, currentAuthorId?: number) => ReactNode;
  cellClassName?: string;
};

const COLUMN_REGISTRY: Record<ColumnKey, ColumnDef> = {
  cover: {
    label: "Cover",
    render: () => null, // handled specially in the table body
  },
  title: {
    label: "Title",
    render: (row) => <span className="font-medium">{row.title}</span>,
  },
  author: {
    label: "Author",
    render: (row, currentAuthorId) => (
      <>
        <AdditionalAuthors
          bookAuthors={row.bookAuthors}
          currentAuthorId={currentAuthorId}
        />
        {row.bookAuthors.length === 0 && row.authorName}
      </>
    ),
    cellClassName: "text-muted-foreground",
  },
  releaseDate: {
    label: "Release Date",
    render: (row) => row.releaseDate || "Unknown",
    cellClassName: "whitespace-nowrap",
  },
  readers: {
    label: "Readers",
    render: (row) =>
      row.usersCount !== null && row.usersCount !== undefined
        ? row.usersCount.toLocaleString()
        : "\u2014",
  },
  rating: {
    label: "Rating",
    render: (row) =>
      row.rating ? (
        <span className="inline-flex items-center gap-1">
          <Star className="h-3.5 w-3.5 fill-yellow-500 text-yellow-500" />
          {row.rating.toFixed(1)}
          {row.ratingsCount !== null &&
            row.ratingsCount !== undefined &&
            row.ratingsCount > 0 && (
              <span className="text-muted-foreground">
                ({row.ratingsCount.toLocaleString()})
              </span>
            )}
        </span>
      ) : (
        "\u2014"
      ),
  },
  format: {
    label: "Type",
    render: (row) => row.format || "\u2014",
    cellClassName: "text-muted-foreground whitespace-nowrap",
  },
  pages: {
    label: "Pages",
    render: (row) => {
      if (row.audioLength) {
        const h = Math.floor(row.audioLength / 3600);
        const m = Math.floor((row.audioLength % 3600) / 60);
        return h > 0 ? `${h}h ${m}m` : `${m}m`;
      }
      return row.pageCount ?? "\u2014";
    },
    cellClassName: "text-muted-foreground whitespace-nowrap",
  },
  isbn10: {
    label: "ISBN 10",
    render: (row) => row.isbn10 || "\u2014",
    cellClassName: "text-muted-foreground",
  },
  isbn13: {
    label: "ISBN-13",
    render: (row) => row.isbn13 || "\u2014",
    cellClassName: "text-muted-foreground",
  },
  asin: {
    label: "ASIN",
    render: (row) => row.asin || "\u2014",
    cellClassName: "text-muted-foreground",
  },
  score: {
    label: "Data Score",
    render: (row) =>
      row.score !== null && row.score !== undefined
        ? row.score.toLocaleString()
        : "\u2014",
    cellClassName: "text-muted-foreground",
  },
  publisher: {
    label: "Publisher",
    render: (row) => row.publisher || "\u2014",
    cellClassName: "max-w-36 truncate",
  },
  information: {
    label: "Information",
    render: (row) => row.editionInformation || "\u2014",
    cellClassName: "max-w-48 truncate",
  },
  language: {
    label: "Language",
    render: (row) => row.language || "\u2014",
  },
  country: {
    label: "Country",
    render: (row) => row.country || "\u2014",
  },
  series: {
    label: "Series",
    render: (row) =>
      row.series.length > 0
        ? row.series
            .map((s) => (s.position ? `${s.title} (#${s.position})` : s.title))
            .join(", ")
        : "\u2014",
  },
  monitored: {
    label: "Monitored",
    render: (row) => (
      <Badge variant={row.monitored ? "default" : "secondary"}>
        {row.monitored ? "Yes" : "No"}
      </Badge>
    ),
  },
};

export type ColumnConfig = {
  key: ColumnKey;
  sortable?: boolean;
};

type BaseBookTableProps = {
  rows: BookTableRow[];
  columns: ColumnConfig[];
  sortKey?: string;
  sortDir?: "asc" | "desc";
  onSort?: (key: string) => void;
  renderLeadingCell?: (row: BookTableRow) => ReactNode;
  onRowClick?: (row: BookTableRow) => void;
  selectedRowKey?: number | string;
  emptyMessage?: string;
  currentAuthorId?: number;
  children?: ReactNode;
  className?: string;
};

function SortIcon({
  col,
  sortKey,
  sortDir,
}: {
  col: string;
  sortKey?: string;
  sortDir?: "asc" | "desc";
}): JSX.Element {
  if (sortKey !== col) {
    return (
      <ChevronsUpDown className="ml-1 h-3.5 w-3.5 text-muted-foreground/50 inline" />
    );
  }
  return sortDir === "asc" ? (
    <ChevronUp className="ml-1 h-3.5 w-3.5 inline" />
  ) : (
    <ChevronDown className="ml-1 h-3.5 w-3.5 inline" />
  );
}

export default function BaseBookTable({
  rows,
  columns,
  sortKey,
  sortDir,
  onSort,
  renderLeadingCell,
  onRowClick,
  selectedRowKey,
  emptyMessage = "No items found.",
  currentAuthorId,
  children,
  className,
}: BaseBookTableProps): JSX.Element {
  const totalCols = columns.length;

  return (
    <Table className={className}>
      <colgroup>
        {columns.map((col) => (
          <col
            key={col.key}
            className={cn(
              col.key === "monitored" && "w-10",
              col.key === "cover" && "w-14",
            )}
          />
        ))}
      </colgroup>
      <TableHeader>
        <TableRow>
          {columns.map(({ key, sortable }) => {
            if (key === "monitored") {
              return <TableHead key={key} className="w-10" />;
            }
            if (key === "cover") {
              return <TableHead key={key} className="w-14" />;
            }
            const def = COLUMN_REGISTRY[key];
            if (sortable && onSort) {
              return (
                <TableHead
                  key={key}
                  className="cursor-pointer select-none hover:text-foreground"
                  onClick={() => onSort(key)}
                >
                  {def.label}
                  <SortIcon col={key} sortKey={sortKey} sortDir={sortDir} />
                </TableHead>
              );
            }
            return <TableHead key={key}>{def.label}</TableHead>;
          })}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.length > 0
          ? rows.map((row) => (
              <TableRow
                key={row.key}
                className={cn(
                  onRowClick && "cursor-pointer",
                  selectedRowKey === row.key &&
                    "bg-primary/10 ring-1 ring-primary/30",
                )}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
              >
                {columns.map(({ key }) => {
                  if (key === "monitored") {
                    return (
                      <TableCell key={key} className="w-10 p-0">
                        {renderLeadingCell?.(row)}
                      </TableCell>
                    );
                  }
                  if (key === "cover") {
                    return (
                      <TableCell key={key} className="min-w-14 w-14 p-2">
                        <OptimizedImage
                          src={row.coverUrl ?? null}
                          alt={row.title}
                          type="book"
                          width={56}
                          height={84}
                          className="aspect-[2/3] w-full rounded-sm"
                        />
                      </TableCell>
                    );
                  }
                  const def = COLUMN_REGISTRY[key];
                  return (
                    <TableCell key={key} className={def.cellClassName}>
                      {def.render(row, currentAuthorId)}
                    </TableCell>
                  );
                })}
              </TableRow>
            ))
          : !children && (
              <TableRow>
                <TableCell
                  colSpan={totalCols}
                  className="text-center text-muted-foreground py-8"
                >
                  {emptyMessage}
                </TableCell>
              </TableRow>
            )}
        {children}
      </TableBody>
    </Table>
  );
}
