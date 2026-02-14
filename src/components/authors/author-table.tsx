import { Link } from "@tanstack/react-router";
import { Pencil, Trash2 } from "lucide-react";
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

interface Author {
  id: number;
  name: string;
  sortName: string;
  status: string;
  monitored: boolean;
  bookCount: number;
}

interface AuthorTableProps {
  authors: Author[];
  onDelete: (id: number) => void;
}

export function AuthorTable({ authors, onDelete }: AuthorTableProps) {
  if (authors.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        No authors found. Add one to get started.
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Monitored</TableHead>
          <TableHead>Books</TableHead>
          <TableHead className="w-24">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {authors.map((author) => (
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
