import { Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { ChevronDown, ChevronUp, ChevronsUpDown } from "lucide-react";
import { Badge } from "src/components/ui/badge";
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
  slug?: string | undefined;
  sortName: string;
  status: string;
  bookCount: number;
};

type AuthorTableProps = {
  authors: Author[];
  children?: React.ReactNode;
};

export default function AuthorTable({
  authors,
  children,
}: AuthorTableProps): React.JSX.Element {
  const navigate = useNavigate();
  const [sortKey, setSortKey] = useState<keyof Author | undefined>(undefined);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

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
      <TableHeader>
        <TableRow>
          {(
            [
              { key: "name", label: "Name" },
              { key: "status", label: "Status" },
              { key: "bookCount", label: "Books" },
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
        {sorted.map((author) => (
          <TableRow
            key={author.id}
            className="cursor-pointer hover:bg-accent/50 transition-colors"
            onClick={() =>
              navigate({
                to: "/authors/$authorSlug",
                params: { authorSlug: author.slug || String(author.id) },
              })
            }
          >
            <TableCell>
              <Link
                to="/authors/$authorSlug"
                params={{ authorSlug: author.slug || String(author.id) }}
                className="font-medium hover:underline"
                onClick={(e) => e.stopPropagation()}
              >
                {author.name}
              </Link>
            </TableCell>
            <TableCell>
              <Badge variant="secondary">{author.status}</Badge>
            </TableCell>
            <TableCell>{author.bookCount}</TableCell>
          </TableRow>
        ))}
        {children}
      </TableBody>
    </Table>
  );
}
