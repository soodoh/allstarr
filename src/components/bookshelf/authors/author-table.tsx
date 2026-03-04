import { Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import type { JSX, ReactNode } from "react";
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

type Author = {
  id: number;
  name: string;
  sortName: string;
  status: string;
  bookCount: number;
  totalReaders: number;
  images: Array<{ url: string; coverType: string }> | null;
};

type AuthorTableProps = {
  authors: Author[];
  children?: ReactNode;
};

export default function AuthorTable({
  authors,
  children,
}: AuthorTableProps): JSX.Element {
  const navigate = useNavigate();
  const [sortKey, setSortKey] = useState<keyof Author | undefined>(
    "totalReaders",
  );
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const handleSort = (key: keyof Author) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const sorted = sortKey
    ? [...authors].toSorted((a, b) => {
        const av = a[sortKey];
        const bv = b[sortKey];
        let cmp = 0;
        if (typeof av === "string" && typeof bv === "string") {
          cmp = av.localeCompare(bv);
        } else if (typeof av === "number" && typeof bv === "number") {
          cmp = av - bv;
        } else if (typeof av === "boolean" && typeof bv === "boolean") {
          cmp = Number(av) - Number(bv);
        }
        if (cmp === 0 && sortKey !== "totalReaders") {
          cmp = (b.totalReaders ?? 0) - (a.totalReaders ?? 0);
        }
        return sortDir === "asc" ? cmp : -cmp;
      })
    : authors;

  const SortIcon = ({ col }: { col: keyof Author }) => {
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
      </colgroup>
      <TableHeader>
        <TableRow>
          <TableHead />
          {(
            [
              { key: "name", label: "Name" },
              { key: "bookCount", label: "Books" },
              { key: "totalReaders", label: "Readers" },
            ] as Array<{ key: keyof Author; label: string }>
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
        {sorted.map((author) => {
          const authorImage = author.images?.[0]?.url;
          return (
            <TableRow
              key={author.id}
              className="cursor-pointer hover:bg-accent/50 transition-colors"
              onClick={() =>
                navigate({
                  to: "/bookshelf/authors/$authorId",
                  params: { authorId: String(author.id) },
                })
              }
            >
              <TableCell>
                {authorImage ? (
                  <img
                    src={authorImage}
                    alt={author.name}
                    className="aspect-square w-full rounded-full object-cover"
                  />
                ) : (
                  <div className="aspect-square w-full rounded-full bg-muted flex items-center justify-center">
                    <ImageIcon className="h-5 w-5 text-muted-foreground" />
                  </div>
                )}
              </TableCell>
              <TableCell>
                <Link
                  to="/bookshelf/authors/$authorId"
                  params={{ authorId: String(author.id) }}
                  className="font-medium hover:underline"
                  onClick={(e) => e.stopPropagation()}
                >
                  {author.name}
                </Link>
              </TableCell>
              <TableCell>{author.bookCount}</TableCell>
              <TableCell>{author.totalReaders.toLocaleString()}</TableCell>
            </TableRow>
          );
        })}
        {children}
      </TableBody>
    </Table>
  );
}
