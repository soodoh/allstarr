import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { LayoutGrid, List } from "lucide-react";
import { Button } from "~/components/ui/button";
import { PageHeader } from "~/components/shared/page-header";
import { BookTable } from "~/components/books/book-table";
import { BookCard } from "~/components/books/book-card";
import { getBooksFn, deleteBookFn } from "~/server/books";

export const Route = createFileRoute("/_authed/books/")({
  loader: () => getBooksFn(),
  component: BooksPage,
});

function BooksPage() {
  const books = Route.useLoaderData();
  const router = useRouter();
  const [view, setView] = useState<"table" | "grid">("table");

  const handleDelete = async (id: number) => {
    try {
      await deleteBookFn({ data: { id } });
      toast.success("Book deleted");
      router.invalidate();
    } catch {
      toast.error("Failed to delete book");
    }
  };

  return (
    <div>
      <PageHeader
        title="Books"
        description={`${books.length} books in your library`}
        actions={
          <div className="flex gap-2">
            <div className="flex border border-border rounded-md">
              <Button
                variant={view === "table" ? "secondary" : "ghost"}
                size="icon"
                onClick={() => setView("table")}
              >
                <List className="h-4 w-4" />
              </Button>
              <Button
                variant={view === "grid" ? "secondary" : "ghost"}
                size="icon"
                onClick={() => setView("grid")}
              >
                <LayoutGrid className="h-4 w-4" />
              </Button>
            </div>
            <Button asChild>
              <Link to="/add/book">Add Book</Link>
            </Button>
          </div>
        }
      />

      {view === "table" ? (
        <BookTable books={books} onDelete={handleDelete} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {books.length === 0 ? (
            <div className="col-span-full text-center py-12 text-muted-foreground">
              No books found. Add one to get started.
            </div>
          ) : (
            books.map((book) => <BookCard key={book.id} book={book} />)
          )}
        </div>
      )}
    </div>
  );
}
