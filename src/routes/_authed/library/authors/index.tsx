import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { LayoutGrid, List, Users, Search } from "lucide-react";
import { Button } from "src/components/ui/button";
import Input from "src/components/ui/input";
import PageHeader from "src/components/shared/page-header";
import AuthorTable from "src/components/authors/author-table";
import AuthorCard from "src/components/authors/author-card";
import EmptyState from "src/components/shared/empty-state";
import {
  AuthorTableRowsSkeleton,
  AuthorCardsSkeleton,
} from "src/components/shared/loading-skeleton";
import { authorsInfiniteQuery } from "src/lib/queries";

export const Route = createFileRoute("/_authed/library/authors/")({
  loader: ({ context }) =>
    context.queryClient.prefetchInfiniteQuery(authorsInfiniteQuery()),
  component: AuthorsPage,
});

function AuthorsPage() {
  const [view, setView] = useState<"table" | "grid">("table");
  const [search, setSearch] = useState("");
  const sentinelRef = useRef<HTMLDivElement>(null);

  const { data, isLoading, isFetchingNextPage, hasNextPage, fetchNextPage } =
    useInfiniteQuery(authorsInfiniteQuery(search));

  const authors = useMemo(
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

  if (!isLoading && total === 0 && !search) {
    return (
      <div>
        <PageHeader title="Authors" />
        <EmptyState
          icon={Users}
          title="No authors yet"
          description="Search Hardcover to add your first author."
        />
      </div>
    );
  }

  let description: string | undefined;
  if (isLoading) {
    description = undefined;
  } else if (search) {
    description = `${total} matching authors`;
  } else {
    description = `${total} authors in your library`;
  }

  const showLoading = isLoading || isFetchingNextPage;

  return (
    <div>
      <PageHeader
        title="Authors"
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
            placeholder="Search by name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {view === "table" ? (
        <AuthorTable authors={authors}>
          {showLoading && <AuthorTableRowsSkeleton />}
        </AuthorTable>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6">
          {authors.map((author) => (
            <AuthorCard
              key={author.id}
              author={{ ...author, images: author.images ?? undefined }}
            />
          ))}
          {showLoading && <AuthorCardsSkeleton />}
        </div>
      )}

      <div ref={sentinelRef} className="h-1" />
    </div>
  );
}
