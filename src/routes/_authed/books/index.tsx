import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useInfiniteQuery, useSuspenseQuery } from "@tanstack/react-query";
import { LayoutGrid, List, BookOpen, Search } from "lucide-react";
import { Button } from "src/components/ui/button";
import Input from "src/components/ui/input";
import PageHeader from "src/components/shared/page-header";
import BookTable from "src/components/bookshelf/books/book-table";
import BookCard from "src/components/bookshelf/books/book-card";
import EmptyState from "src/components/shared/empty-state";
import ColumnSettingsPopover from "src/components/shared/column-settings-popover";
import {
  BookTableRowsSkeleton,
  BookCardsSkeleton,
} from "src/components/shared/loading-skeleton";
import { booksInfiniteQuery, downloadProfilesListQuery } from "src/lib/queries";
import {
  useMonitorBookProfile,
  useUnmonitorBookProfile,
} from "src/hooks/mutations";
import UnmonitorDialog from "src/components/bookshelf/books/unmonitor-dialog";

export const Route = createFileRoute("/_authed/books/")({
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.prefetchInfiniteQuery(booksInfiniteQuery("", true)),
      context.queryClient.ensureQueryData(downloadProfilesListQuery()),
    ]);
  },
  component: BooksPage,
});

function BooksPage() {
  const [view, setView] = useState<"table" | "grid">("table");
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<string>("readers");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const sentinelRef = useRef<HTMLDivElement>(null);

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const { data, isLoading, isFetchingNextPage, hasNextPage, fetchNextPage } =
    useInfiniteQuery(booksInfiniteQuery(search, true, sortKey, sortDir));

  const { data: downloadProfiles } = useSuspenseQuery(
    downloadProfilesListQuery(),
  );

  const monitorBookProfile = useMonitorBookProfile();
  const unmonitorBookProfile = useUnmonitorBookProfile();

  const [unmonitorTarget, setUnmonitorTarget] = useState<{
    bookId: number;
    downloadProfileId: number;
    bookTitle: string;
    profileName: string;
  } | null>(null);

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
    if (!el) {
      return;
    }
    const observer = new IntersectionObserver(handleObserver, {
      rootMargin: "200px",
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [handleObserver]);

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
    description = `${total} books on your bookshelf`;
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

      <div className="mb-4 flex items-center gap-2">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by title, author, or series..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        {view === "table" && <ColumnSettingsPopover tableId="books" />}
      </div>

      {view === "table" ? (
        <BookTable
          books={books}
          sortKey={sortKey}
          sortDir={sortDir}
          onSort={handleSort}
          downloadProfiles={downloadProfiles}
          onToggleProfile={(bookId, profileId) => {
            const book = books.find((b) => b.id === bookId);
            const isActive = book?.downloadProfileIds?.includes(profileId);
            if (isActive) {
              const profile = downloadProfiles.find((p) => p.id === profileId);
              setUnmonitorTarget({
                bookId,
                downloadProfileId: profileId,
                bookTitle: book?.title ?? "Unknown",
                profileName: profile?.name ?? "Unknown",
              });
            } else {
              monitorBookProfile.mutate({
                bookId,
                downloadProfileId: profileId,
              });
            }
          }}
        >
          {showLoading && <BookTableRowsSkeleton columns={6} />}
        </BookTable>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6">
          {books.map((book) => (
            <BookCard key={book.id} book={book} />
          ))}
          {showLoading && <BookCardsSkeleton />}
        </div>
      )}

      <div ref={sentinelRef} className="h-1" />

      <UnmonitorDialog
        open={unmonitorTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setUnmonitorTarget(null);
          }
        }}
        profileName={unmonitorTarget?.profileName ?? ""}
        itemTitle={unmonitorTarget?.bookTitle ?? ""}
        itemType="book"
        fileCount={0}
        onConfirm={(deleteFiles) => {
          if (unmonitorTarget) {
            unmonitorBookProfile.mutate(
              {
                bookId: unmonitorTarget.bookId,
                downloadProfileId: unmonitorTarget.downloadProfileId,
                deleteFiles,
              },
              { onSuccess: () => setUnmonitorTarget(null) },
            );
          }
        }}
        isPending={unmonitorBookProfile.isPending}
      />
    </div>
  );
}
