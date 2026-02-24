import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Pencil, Search, Trash2 } from "lucide-react";
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
import InteractiveSearchModal from "~/components/books/interactive-search-modal";

type Book = {
  id: number;
  title: string;
  authorName: string | undefined;
  releaseDate: string | undefined;
  monitored: boolean;
};

type BookTableProps = {
  books: Book[];
  onDelete: (id: number) => void;
};

export default function BookTable({
  books,
  onDelete,
}: BookTableProps): React.JSX.Element {
  const [searchBook, setSearchBook] = useState<Book | undefined>(undefined);

  if (books.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        No books found. Add one to get started.
      </div>
    );
  }

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Title</TableHead>
            <TableHead>Author</TableHead>
            <TableHead>Release Date</TableHead>
            <TableHead>Monitored</TableHead>
            <TableHead className="w-32">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {books.map((book) => (
            <TableRow key={book.id}>
              <TableCell>
                <Link
                  to="/books/$bookId"
                  params={{ bookId: String(book.id) }}
                  className="font-medium hover:underline"
                >
                  {book.title}
                </Link>
              </TableCell>
              <TableCell>{book.authorName || "Unknown"}</TableCell>
              <TableCell>{book.releaseDate || "Unknown"}</TableCell>
              <TableCell>
                <Badge variant={book.monitored ? "default" : "outline"}>
                  {book.monitored ? "Yes" : "No"}
                </Badge>
              </TableCell>
              <TableCell>
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setSearchBook(book)}
                    title="Interactive search"
                  >
                    <Search className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" asChild>
                    <Link
                      to="/books/$bookId"
                      params={{ bookId: String(book.id) }}
                    >
                      <Pencil className="h-4 w-4" />
                    </Link>
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => onDelete(book.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {searchBook && (
        <InteractiveSearchModal
          book={searchBook}
          open={Boolean(searchBook)}
          onOpenChange={(open) => {
            if (!open) {setSearchBook(undefined);}
          }}
        />
      )}
    </>
  );
}
