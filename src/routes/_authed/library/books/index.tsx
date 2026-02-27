import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { LayoutGrid, List, BookOpen, Search } from "lucide-react";
import { Button } from "src/components/ui/button";
import Input from "src/components/ui/input";
import PageHeader from "src/components/shared/page-header";
import BookTable from "src/components/books/book-table";
import BookCard from "src/components/books/book-card";
import EmptyState from "src/components/shared/empty-state";
import {
  BookTableRowsSkeleton,
  BookCardsSkeleton,
} from "src/components/shared/loading-skeleton";
import { booksInfiniteQuery } from "src/lib/queries";

export const Route = createFileRoute("/_authed/library/books/")({
  loader: ({ context }) =>
    context.queryClient.prefetchInfiniteQuery(booksInfiniteQuery("", true)),
  component: BooksPage,
});

function BooksPage() {
  const [view, setView] = useState<"table" | "grid">("table");
  const [search, setSearch] = useState("");
  const sentinelRef = useRef<HTMLDivElement>(null);

  const { data, isLoading, isFetchingNextPage, hasNextPage, fetchNextPage } =
    useInfiniteQuery(booksInfiniteQuery(search, true));

  const books = useMemo(
    () => data?.pages.flatMap((p) => p.items) ?? [],
    [data],
  );
  const total = data?.pages[0]?.total ?? 0;

  const handleObserver = useCallback(
    (entries: IntersectionObserverEntry[]) => {
      if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) {
        fetchNextPage();
      }
    },
    [hasNextPage, isFetchingNextPage, fetchNextPage],
  );

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) {return;}
    const observer = new IntersectionObserver(handleObserver, {
      rootMargin: "200px",
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [handleObserver]);

  const tableBooks = useMemo(
    () =>
      books.map((b) =>
        Object.assign(b, {
          authorName: b.authorName ?? undefined,
          releaseDate: b.releaseDate ?? undefined,
          description: b.description ?? undefined,
          images: b.images ?? undefined,
        }),
      ),
    [books],
  );

  if (!isLoading && total === 0 && !search) {
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

  let description: string;
  if (search) {
    description = `${total} matching books`;
  } else {
    description = `${total} books in your library`;
  }

  const showLoading = isLoading || isFetchingNextPage;

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
            placeholder="Search by title, author, or series..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {view === "table" ? (
        <BookTable books={tableBooks}>
          {showLoading && <BookTableRowsSkeleton />}
        </BookTable>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6">
          {tableBooks.map((book) => (
            <BookCard
              key={book.id}
              book={book}
            />
          ))}
          {showLoading && <BookCardsSkeleton />}
        </div>
      )}

      <div ref={sentinelRef} className="h-1" />
    </div>
  );
}
