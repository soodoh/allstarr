import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { LayoutGrid, List, BookOpen } from "lucide-react";
import { Button } from "~/components/ui/button";
import { PageHeader } from "~/components/shared/page-header";
import { BookTable } from "~/components/books/book-table";
import { BookCard } from "~/components/books/book-card";
import { ConfirmDialog } from "~/components/shared/confirm-dialog";
import { EmptyState } from "~/components/shared/empty-state";
import { TableSkeleton } from "~/components/shared/loading-skeleton";
import { getBooksFn, deleteBookFn } from "~/server/books";

export const Route = createFileRoute("/_authed/books/")({
  loader: () => getBooksFn(),
  component: BooksPage,
  pendingComponent: TableSkeleton,
});

function BooksPage() {
  const books = Route.useLoaderData();
  const router = useRouter();
  const [view, setView] = useState<"table" | "grid">("table");
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    if (!deleteId) return;
    setDeleting(true);
    try {
      await deleteBookFn({ data: { id: deleteId } });
      toast.success("Book deleted");
      setDeleteId(null);
      router.invalidate();
    } catch {
      toast.error("Failed to delete book");
    } finally {
      setDeleting(false);
    }
  };

  if (books.length === 0) {
    return (
      <div>
        <PageHeader title="Books" />
        <EmptyState
          icon={BookOpen}
          title="No books yet"
          description="Add your first book to start building your library."
          action={
            <Button asChild>
              <Link to="/add/book">Add Book</Link>
            </Button>
          }
        />
      </div>
    );
  }

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
        <BookTable books={books} onDelete={(id) => setDeleteId(id)} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {books.map((book) => (
            <BookCard key={book.id} book={book} />
          ))}
        </div>
      )}

      <ConfirmDialog
        open={deleteId !== null}
        onOpenChange={(open) => !open && setDeleteId(null)}
        title="Delete Book"
        description="Are you sure you want to delete this book? This cannot be undone."
        onConfirm={handleDelete}
        loading={deleting}
      />
    </div>
  );
}
