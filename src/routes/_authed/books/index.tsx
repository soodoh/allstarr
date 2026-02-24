import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { LayoutGrid, List, BookOpen, Search } from "lucide-react";
import { Button } from "~/components/ui/button";
import Input from "~/components/ui/input";
import PageHeader from "~/components/shared/page-header";
import BookTable from "~/components/books/book-table";
import BookCard from "~/components/books/book-card";
import EmptyState from "~/components/shared/empty-state";
import { TableSkeleton } from "~/components/shared/loading-skeleton";
import { booksListQuery } from "~/lib/queries";

export const Route = createFileRoute("/_authed/books/")({
  loader: ({ context }) =>
    context.queryClient.ensureQueryData(booksListQuery()),
  component: BooksPage,
  pendingComponent: TableSkeleton,
});

function BooksPage() {
  const { data: books } = useSuspenseQuery(booksListQuery());

  const [view, setView] = useState<"table" | "grid">("table");
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setSearchQuery(searchInput);
    }, 300);
    return () => clearTimeout(debounceRef.current);
  }, [searchInput]);

  const filteredBooks = useMemo(() => {
    if (!searchQuery) {
      return books;
    }
    const q = searchQuery.toLowerCase();
    return books.filter(
      (b) =>
        b.title.toLowerCase().includes(q) ||
        (b.authorName?.toLowerCase().includes(q) ?? false),
    );
  }, [books, searchQuery]);

  const tableBooks = useMemo(
    () =>
      filteredBooks.map((b) => ({
        ...b,
        authorName: b.authorName ?? undefined,
        releaseDate: b.releaseDate ?? undefined,
      })),
    [filteredBooks],
  );

  if (books.length === 0) {
    return (
      <div>
        <PageHeader title="Books" />
        <EmptyState
          icon={BookOpen}
          title="No books yet"
          description="Search Hardcover to add your first book."
        />
      </div>
    );
  }

  const description = searchQuery
    ? `${filteredBooks.length} of ${books.length} books`
    : `${books.length} books in your library`;

  return (
    <div>
      <PageHeader
        title="Books"
        description={description}
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
          </div>
        }
      />

      <div className="mb-4">
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by title or author..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {view === "table" ? (
        <BookTable books={tableBooks} />
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6">
          {filteredBooks.map((book) => (
            <BookCard
              key={book.id}
              book={{
                ...book,
                authorName: book.authorName ?? undefined,
                releaseDate: book.releaseDate ?? undefined,
                images: book.images ?? undefined,
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
