import { useState } from "react";
import { ChevronDown, ChevronUp, ChevronsUpDown } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "src/components/ui/table";
import { useBookDetailModal } from "src/components/books/book-detail-modal-provider";

type Book = {
  id: number;
  title: string;
  authorName: string | undefined;
  releaseDate: string | undefined;
};

type BookTableProps = {
  books: Book[];
  children?: React.ReactNode;
};

type SortKey = "title" | "authorName" | "releaseDate";

export default function BookTable({
  books,
  children,
}: BookTableProps): React.JSX.Element {
  const { openBookModal } = useBookDetailModal();
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
    ? [...books].toSorted((a, b) => {
        const av = a[sortKey] ?? "";
        const bv = b[sortKey] ?? "";
        const cmp = String(av).localeCompare(String(bv));
        return sortDir === "asc" ? cmp : -cmp;
      })
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
      <TableHeader>
        <TableRow>
          {(
            [
              { key: "title", label: "Title" },
              { key: "authorName", label: "Author" },
              { key: "releaseDate", label: "Release Date" },
            ] as Array<{ key: SortKey; label: string }>
          ).map(({ key, label }) => (
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
        {sorted.map((book) => (
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
        {children}
      </TableBody>
    </Table>
  );
}
