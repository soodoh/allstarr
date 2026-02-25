import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "src/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "src/components/ui/tabs";
import { Button } from "src/components/ui/button";
import { Badge } from "src/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "src/components/ui/table";
import Skeleton from "src/components/ui/skeleton";
import BookCover from "src/components/books/book-cover";
import BookForm from "src/components/books/book-form";
import SearchToolbar from "src/components/indexers/search-toolbar";
import ReleaseTable from "src/components/indexers/release-table";
import ConfirmDialog from "src/components/shared/confirm-dialog";
import {
  bookDetailQuery,
  authorsListQuery,
  hasEnabledIndexersQuery,
} from "src/lib/queries";
import {
  useUpdateBook,
  useDeleteBook,
  useSearchIndexers,
  useGrabRelease,
} from "src/hooks/mutations";
import type { IndexerRelease } from "src/server/indexers/types";

type BookDetailModalProps = {
  bookId: number | undefined;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

type BookDetail = NonNullable<
  ReturnType<
    typeof useQuery<Awaited<ReturnType<typeof bookDetailQuery>["queryFn"]>>
  >["data"]
>;

function LoadingSkeleton(): React.JSX.Element {
  return (
    <div className="space-y-4 py-4">
      <div className="grid grid-cols-[auto_1fr] gap-6">
        <Skeleton className="w-40 aspect-[2/3] rounded-xl" />
        <div className="space-y-3">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-16 w-full" />
        </div>
      </div>
    </div>
  );
}

function DetailsTab({
  book,
  onOpenChange,
}: {
  book: BookDetail;
  onOpenChange: (open: boolean) => void;
}): React.JSX.Element {
  return (
    <TabsContent value="details" className="overflow-y-auto flex-1 min-h-0">
      <div className="grid grid-cols-[auto_1fr] gap-6 pt-2">
        <BookCover
          title={book.title}
          images={book.images ?? undefined}
          className="w-40"
        />
        <div className="space-y-3 text-sm">
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">Author: </span>
            {book.authorId ? (
              <Link
                to="/authors/$authorSlug"
                params={{
                  authorSlug: book.authorSlug || String(book.authorId),
                }}
                className="hover:underline"
                onClick={() => onOpenChange(false)}
              >
                {book.authorName || "Unknown"}
              </Link>
            ) : (
              <span>{book.authorName || "Unknown"}</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">Monitored: </span>
            <Badge variant={book.monitored ? "default" : "outline"}>
              {book.monitored ? "Yes" : "No"}
            </Badge>
          </div>
          {book.releaseDate && (
            <div>
              <span className="text-muted-foreground">Release Date: </span>
              {book.releaseDate}
            </div>
          )}
          {book.isbn && (
            <div>
              <span className="text-muted-foreground">ISBN: </span>
              <span className="font-mono text-xs">{book.isbn}</span>
            </div>
          )}
          {book.asin && (
            <div>
              <span className="text-muted-foreground">ASIN: </span>
              <span className="font-mono text-xs">{book.asin}</span>
            </div>
          )}
          {book.overview && (
            <p className="text-muted-foreground leading-relaxed pt-1">
              {book.overview}
            </p>
          )}
        </div>
      </div>
    </TabsContent>
  );
}

function EditionsTab({
  editions,
}: {
  editions: BookDetail["editions"];
}): React.JSX.Element {
  return (
    <TabsContent value="editions" className="overflow-y-auto flex-1 min-h-0">
      {editions.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4">No editions found.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Title</TableHead>
              <TableHead>Format</TableHead>
              <TableHead>ISBN</TableHead>
              <TableHead>Publisher</TableHead>
              <TableHead>Monitored</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {editions.map((edition) => (
              <TableRow key={edition.id}>
                <TableCell className="font-medium">{edition.title}</TableCell>
                <TableCell>{edition.format || "N/A"}</TableCell>
                <TableCell>{edition.isbn || "N/A"}</TableCell>
                <TableCell>{edition.publisher || "N/A"}</TableCell>
                <TableCell>
                  <Badge variant={edition.monitored ? "default" : "outline"}>
                    {edition.monitored ? "Yes" : "No"}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </TabsContent>
  );
}

function getDefaultQuery(book: BookDetail | undefined): string {
  if (!book) {
    return "";
  }
  if (book.authorName) {
    return `${book.authorName} ${book.title}`;
  }
  return book.title;
}

function SearchTab({
  book,
  open,
  hasIndexers,
  onOpenChange,
}: {
  book: BookDetail;
  open: boolean;
  hasIndexers: boolean | undefined;
  onOpenChange: (open: boolean) => void;
}): React.JSX.Element {
  const searchIndexers = useSearchIndexers();
  const grabRelease = useGrabRelease();
  const hasSearched = useRef(false);
  const defaultQuery = getDefaultQuery(book);

  const releases = useMemo(
    () => searchIndexers.data ?? [],
    [searchIndexers.data],
  );

  // Auto-search when the tab first mounts (if indexers are available)
  useEffect(() => {
    if (!hasSearched.current && hasIndexers === true) {
      hasSearched.current = true;
      searchIndexers.mutate({ query: defaultQuery, bookId: book.id });
    }
  }, [hasIndexers]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reset when modal closes
  useEffect(() => {
    if (!open) {
      hasSearched.current = false;
      searchIndexers.reset();
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSearch = (query: string) => {
    searchIndexers.mutate({ query, bookId: book.id });
  };

  const handleGrab = (release: IndexerRelease) => {
    grabRelease.mutate(
      {
        guid: release.guid,
        indexerId: release.allstarrIndexerId,
        title: release.title,
        downloadUrl: release.downloadUrl,
        protocol: release.protocol,
        size: release.size,
        bookId: book.id,
      },
      {
        onSuccess: (result) =>
          toast.success(`Sent to ${result.downloadClientName}`),
      },
    );
  };

  return (
    <TabsContent
      value="search"
      className="overflow-y-auto flex-1 min-h-0 space-y-4"
    >
      <SearchToolbar
        defaultQuery={defaultQuery}
        onSearch={handleSearch}
        searching={searchIndexers.isPending}
        disabled={hasIndexers === false}
      />
      {hasIndexers === false ? (
        <div className="text-center py-8 text-muted-foreground">
          <p>No indexers configured or enabled.</p>
          <p className="text-sm mt-1">
            Add indexers in{" "}
            <Link
              to="/settings/indexers"
              className="underline hover:text-foreground"
              onClick={() => onOpenChange(false)}
            >
              Settings
            </Link>{" "}
            to search for releases.
          </p>
        </div>
      ) : (
        (searchIndexers.data || searchIndexers.isPending) && (
          <ReleaseTable
            releases={releases}
            loading={searchIndexers.isPending}
            grabbingGuid={
              grabRelease.isPending ? grabRelease.variables?.guid : undefined
            }
            onGrab={handleGrab}
          />
        )
      )}
    </TabsContent>
  );
}

export default function BookDetailModal({
  bookId,
  open,
  onOpenChange,
}: BookDetailModalProps): React.JSX.Element {
  const [activeTab, setActiveTab] = useState("details");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const updateBook = useUpdateBook();
  const deleteBook = useDeleteBook();

  const { data: book, isLoading } = useQuery({
    ...bookDetailQuery(bookId ?? 0),
    enabled: bookId !== undefined && open,
  });

  const { data: authors } = useQuery({
    ...authorsListQuery(),
    enabled: editOpen,
  });

  const { data: hasIndexers } = useQuery({
    ...hasEnabledIndexersQuery(),
    enabled: open && activeTab === "search",
  });

  // Reset state when modal closes
  useEffect(() => {
    if (!open) {
      setActiveTab("details");
      setEditOpen(false);
    }
  }, [open]);

  const authorsList = useMemo(() => authors ?? [], [authors]);

  const handleUpdate = (values: {
    title: string;
    authorId: number;
    overview?: string;
    isbn?: string;
    asin?: string;
    releaseDate?: string;
    monitored: boolean;
  }) => {
    if (!book) {
      return;
    }
    updateBook.mutate(
      { ...values, id: book.id },
      { onSuccess: () => setEditOpen(false) },
    );
  };

  const handleDelete = () => {
    if (!book) {
      return;
    }
    deleteBook.mutate(book.id, {
      onSuccess: () => {
        setConfirmDelete(false);
        onOpenChange(false);
      },
    });
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>
              {isLoading ? (
                <Skeleton className="h-6 w-48" />
              ) : (
                (book?.title ?? "Book")
              )}
            </DialogTitle>
          </DialogHeader>

          {isLoading || !book ? (
            <LoadingSkeleton />
          ) : (
            <Tabs
              value={activeTab}
              onValueChange={setActiveTab}
              className="flex-1 min-h-0 flex flex-col"
            >
              <TabsList>
                <TabsTrigger value="details">Details</TabsTrigger>
                <TabsTrigger value="editions">
                  Editions ({book.editions.length})
                </TabsTrigger>
                <TabsTrigger value="search">Search Releases</TabsTrigger>
              </TabsList>

              <DetailsTab book={book} onOpenChange={onOpenChange} />
              <EditionsTab editions={book.editions} />
              <SearchTab
                book={book}
                open={open}
                hasIndexers={hasIndexers}
                onOpenChange={onOpenChange}
              />
            </Tabs>
          )}

          {book && !isLoading && (
            <DialogFooter className="sm:justify-between">
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setConfirmDelete(true)}
              >
                <Trash2 className="h-4 w-4 mr-1" />
                Delete
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setEditOpen(true)}
              >
                <Pencil className="h-4 w-4 mr-1" />
                Edit
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>

      {book && (
        <Dialog open={editOpen} onOpenChange={setEditOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Edit Book</DialogTitle>
            </DialogHeader>
            <BookForm
              initialValues={{
                title: book.title,
                authorId: book.authorId,
                overview: book.overview || undefined,
                isbn: book.isbn || undefined,
                asin: book.asin || undefined,
                releaseDate: book.releaseDate || undefined,
                monitored: book.monitored,
              }}
              authors={authorsList}
              onSubmit={handleUpdate}
              onCancel={() => setEditOpen(false)}
              loading={updateBook.isPending}
            />
          </DialogContent>
        </Dialog>
      )}

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete Book"
        description="Are you sure you want to delete this book? This cannot be undone."
        onConfirm={handleDelete}
        loading={deleteBook.isPending}
      />
    </>
  );
}
