import { useState } from "react";
import type { JSX, ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { ChevronDown, ChevronUp, ChevronsUpDown, ImageIcon, Star } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "src/components/ui/table";

type Book = {
  id: number;
  title: string;
  slug?: string | undefined;
  authorName: string | undefined;
  releaseDate: string | undefined;
  language: string | undefined;
  ratings?: { value: number; votes: number } | undefined;
  readers?: number | undefined;
  series: Array<{ title: string; position: string | undefined }>;
  images?: Array<{ url: string; coverType: string }>;
};

type BookTableProps = {
  books: Book[];
  children?: ReactNode;
};

type SortKey = "title" | "authorName" | "releaseDate" | "series" | "language" | "rating" | "readers";

function compareRating(a: Book, b: Book): number {
  return (a.ratings?.value ?? -1) - (b.ratings?.value ?? -1);
}

function compareSeries(a: Book, b: Book): number {
  const cmp = (a.series[0]?.title ?? "").localeCompare(b.series[0]?.title ?? "");
  if (cmp !== 0) {return cmp;}
  const ap = Number.parseFloat(a.series[0]?.position ?? "") || Number.POSITIVE_INFINITY;
  const bp = Number.parseFloat(b.series[0]?.position ?? "") || Number.POSITIVE_INFINITY;
  return ap - bp;
}

// oxlint-disable-next-line complexity -- sort dispatch across multiple keys
function compareBooks(a: Book, b: Book, key: SortKey, dir: "asc" | "desc"): number {
  if (key === "rating") {
    const cmp = compareRating(a, b);
    return dir === "asc" ? cmp : -cmp;
  }
  if (key === "readers") {
    const cmp = (a.readers ?? -1) - (b.readers ?? -1);
    return dir === "asc" ? cmp : -cmp;
  }
  if (key === "series") {
    const cmp = compareSeries(a, b);
    return dir === "asc" ? cmp : -cmp;
  }
  const av = a[key] ?? "";
  const bv = b[key] ?? "";
  const cmp = String(av).localeCompare(String(bv));
  return dir === "asc" ? cmp : -cmp;
}

export default function BookTable({
  books,
  children,
}: BookTableProps): JSX.Element {
  const navigate = useNavigate();
  const [sortKey, setSortKey] = useState<SortKey | undefined>(undefined);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const sorted = sortKey
    ? [...books].toSorted((a, b) => compareBooks(a, b, sortKey, sortDir))
    : books;

  const SortIcon = ({ col }: { col: SortKey }) => {
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
  };

  return (
    <Table>
      <colgroup>
        <col className="w-14" />
        <col />
        <col />
        <col />
        <col />
        <col />
        <col />
        <col />
      </colgroup>
      <TableHeader>
        <TableRow>
          <TableHead />
          {(
            [
              { key: "title", label: "Title" },
              { key: "authorName", label: "Author" },
              { key: "releaseDate", label: "Release Date" },
              { key: "series", label: "Series" },
              { key: "language", label: "Language" },
              { key: "readers", label: "Readers" },
              { key: "rating", label: "Rating" },
            ] as Array<{ key: SortKey | undefined; label: string }>
          ).map(({ key, label }) =>
            key ? (
              <TableHead
                key={label}
                className="cursor-pointer select-none hover:text-foreground"
                onClick={() => handleSort(key)}
              >
                {label}
                <SortIcon col={key} />
              </TableHead>
            ) : (
              <TableHead key={label}>{label}</TableHead>
            ),
          )}
        </TableRow>
      </TableHeader>
      <TableBody>
        {sorted.map((book) => {
          const bookImage = book.images?.[0]?.url;
          return (
            <TableRow
              key={book.id}
              className="cursor-pointer"
              onClick={() => navigate({ to: "/library/books/$bookSlug", params: { bookSlug: book.slug || String(book.id) } })}
            >
              <TableCell>
                {bookImage ? (
                  <img
                    src={bookImage}
                    alt={book.title}
                    className="aspect-[2/3] w-full rounded-sm object-cover"
                  />
                ) : (
                  <div className="aspect-[2/3] w-full rounded-sm bg-muted flex items-center justify-center">
                    <ImageIcon className="h-4 w-4 text-muted-foreground" />
                  </div>
                )}
              </TableCell>
              <TableCell className="font-medium">{book.title}</TableCell>
              <TableCell>{book.authorName || "Unknown"}</TableCell>
              <TableCell>{book.releaseDate || "Unknown"}</TableCell>
              <TableCell>
                {book.series.length > 0
                  ? book.series
                      .map((s) =>
                        s.position ? `${s.title} (#${s.position})` : s.title,
                      )
                      .join(", ")
                  : "—"}
              </TableCell>
              <TableCell>{book.language || "—"}</TableCell>
              <TableCell>
                {book.readers ? book.readers.toLocaleString() : "—"}
              </TableCell>
              <TableCell>
                {book.ratings ? (
                  <span className="inline-flex items-center gap-1">
                    <Star className="h-3.5 w-3.5 fill-yellow-500 text-yellow-500" />
                    {book.ratings.value.toFixed(1)}
                    <span className="text-muted-foreground">
                      ({book.ratings.votes.toLocaleString()})
                    </span>
                  </span>
                ) : (
                  "—"
                )}
              </TableCell>
            </TableRow>
          );
        })}
        {children}
      </TableBody>
    </Table>
  );
}
