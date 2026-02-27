import { useState } from "react";
import type { JSX, ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  ChevronDown,
  ChevronUp,
  ChevronsUpDown,
  ImageIcon,
  Star,
} from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "src/components/ui/table";
import AdditionalAuthors from "src/components/books/additional-authors";

type ForeignAuthorIdEntry = { foreignAuthorId: string; name: string };

type Book = {
  id: number;
  title: string;
  authorName: string | null;
  authorForeignId: string | null;
  foreignAuthorIds: ForeignAuthorIdEntry[] | null;
  releaseDate: string | null;
  rating: number | null;
  ratingsCount: number | null;
  usersCount: number | null;
  series: Array<{ title: string; position: string | null }>;
  images: Array<{ url: string; coverType: string }> | null;
};

type BookTableProps = {
  books: Book[];
  resolvedAuthors: Record<string, { id: number; name: string }>;
  children?: ReactNode;
};

type SortKey =
  | "title"
  | "authorName"
  | "releaseDate"
  | "series"
  | "rating"
  | "readers";

function compareRating(a: Book, b: Book): number {
  return (a.rating ?? -1) - (b.rating ?? -1);
}

function compareSeries(a: Book, b: Book): number {
  const cmp = (a.series[0]?.title ?? "").localeCompare(
    b.series[0]?.title ?? "",
  );
  if (cmp !== 0) {
    return cmp;
  }
  const ap =
    Number.parseFloat(a.series[0]?.position ?? "") || Number.POSITIVE_INFINITY;
  const bp =
    Number.parseFloat(b.series[0]?.position ?? "") || Number.POSITIVE_INFINITY;
  return ap - bp;
}

// oxlint-disable-next-line complexity -- sort dispatch across multiple keys
function compareBooks(
  a: Book,
  b: Book,
  key: SortKey,
  dir: "asc" | "desc",
): number {
  if (key === "rating") {
    const cmp = compareRating(a, b);
    return dir === "asc" ? cmp : -cmp;
  }
  if (key === "readers") {
    const cmp = (a.usersCount ?? -1) - (b.usersCount ?? -1);
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
  resolvedAuthors,
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
          const primaryAuthor =
            book.authorForeignId && book.authorName
              ? { foreignAuthorId: book.authorForeignId, name: book.authorName }
              : null;
          return (
            <TableRow
              key={book.id}
              className="cursor-pointer"
              onClick={() =>
                navigate({
                  to: "/library/books/$bookId",
                  params: { bookId: String(book.id) },
                })
              }
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
              <TableCell>
                <AdditionalAuthors
                  foreignAuthorIds={book.foreignAuthorIds}
                  resolvedAuthors={resolvedAuthors}
                  primaryAuthor={primaryAuthor}
                />
                {!book.authorForeignId && book.authorName}
              </TableCell>
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
              <TableCell>
                {book.usersCount ? book.usersCount.toLocaleString() : "—"}
              </TableCell>
              <TableCell>
                {book.rating ? (
                  <span className="inline-flex items-center gap-1">
                    <Star className="h-3.5 w-3.5 fill-yellow-500 text-yellow-500" />
                    {book.rating.toFixed(1)}
                    {book.ratingsCount !== null && book.ratingsCount > 0 && (
                      <span className="text-muted-foreground">
                        ({book.ratingsCount.toLocaleString()})
                      </span>
                    )}
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
