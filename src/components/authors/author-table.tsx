import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { ChevronDown, ChevronUp, ChevronsUpDown, Pencil, Trash2 } from "lucide-react";
import { Button } from "~/components/ui/button";
import { Badge } from "~/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";

type Author = {
  id: number;
  name: string;
  sortName: string;
  status: string;
  monitored: boolean;
  bookCount: number;
}

type AuthorTableProps = {
  authors: Author[];
  onDelete: (id: number) => void;
}

export default function AuthorTable({ authors, onDelete }: AuthorTableProps): React.JSX.Element {
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

  if (sorted.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        No authors found. Add one to get started.
      </div>
    );
  }

  const SortIcon = ({ col }: { col: keyof Author }) => {
    if (sortKey !== col)
      {return <ChevronsUpDown className="ml-1 h-3.5 w-3.5 text-muted-foreground/50 inline" />;}
    return sortDir === "asc"
      ? <ChevronUp className="ml-1 h-3.5 w-3.5 inline" />
      : <ChevronDown className="ml-1 h-3.5 w-3.5 inline" />;
  };

  return (
    <Table>
      <TableHeader>
        <TableRow>
          {(
            [
              { key: "name", label: "Name" },
              { key: "status", label: "Status" },
              { key: "monitored", label: "Monitored" },
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
          <TableHead className="w-24">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {sorted.map((author) => (
          <TableRow key={author.id}>
            <TableCell>
              <Link
                to="/authors/$authorId"
                params={{ authorId: String(author.id) }}
                className="font-medium hover:underline"
              >
                {author.name}
              </Link>
            </TableCell>
            <TableCell>
              <Badge variant="secondary">{author.status}</Badge>
            </TableCell>
            <TableCell>
              <Badge variant={author.monitored ? "default" : "outline"}>
                {author.monitored ? "Yes" : "No"}
              </Badge>
            </TableCell>
            <TableCell>{author.bookCount}</TableCell>
            <TableCell>
              <div className="flex gap-1">
                <Button variant="ghost" size="icon" asChild>
                  <Link
                    to="/authors/$authorId"
                    params={{ authorId: String(author.id) }}
                  >
                    <Pencil className="h-4 w-4" />
                  </Link>
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => onDelete(author.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
