import { useEffect, useMemo, useState } from "react";
import type { JSX } from "react";
import { useQuery } from "@tanstack/react-query";
import { Pencil, Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "src/components/ui/dialog";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "src/components/ui/tabs";
import { Button } from "src/components/ui/button";
import Skeleton from "src/components/ui/skeleton";
import BookDetailContent from "src/components/books/book-detail-content";
import BookForm from "src/components/books/book-form";
import EditionsTab from "src/components/books/editions-tab";
import SearchReleasesTab from "src/components/books/search-releases-tab";
import ConfirmDialog from "src/components/shared/confirm-dialog";
import {
  bookDetailQuery,
  authorsListQuery,
  hasEnabledIndexersQuery,
  hardcoverBookLanguagesQuery,
} from "src/lib/queries";
import { useUpdateBook, useDeleteBook } from "src/hooks/mutations";
import type { getBookFn } from "src/server/books";

type BookDetailModalProps = {
  bookId: number | undefined;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

type BookDetail = Awaited<ReturnType<typeof getBookFn>>;

function LoadingSkeleton(): JSX.Element {
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
  open,
  onOpenChange,
}: {
  book: BookDetail;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}): JSX.Element {
  const foreignBookId = book.foreignBookId
    ? Number(book.foreignBookId)
    : 0;

  const { data: languages } = useQuery({
    ...hardcoverBookLanguagesQuery(foreignBookId),
    enabled: open && foreignBookId > 0,
  });

  return (
    <TabsContent value="details" className="overflow-y-auto flex-1 min-h-0 pt-2">
      <BookDetailContent
        book={{
          title: book.title,
          images: book.images ?? undefined,
          author: book.authorId
            ? {
                id: book.authorId,
                slug: book.authorSlug ?? undefined,
                name: book.authorName || "Unknown",
              }
            : undefined,
          authorName: book.authorName || "Unknown",
          releaseDate: book.releaseDate ?? undefined,
          availableLanguages: languages,
          series: book.series ?? undefined,
          rating: book.ratings?.value,
          ratingVotes: book.ratings?.votes,
          readers: book.readers ?? undefined,
          isbn: book.isbn ?? undefined,
          asin: book.asin ?? undefined,
          overview: book.overview ?? undefined,
        }}
        onCloseModal={() => onOpenChange(false)}
      />
    </TabsContent>
  );
}

export default function BookDetailModal({
  bookId,
  open,
  onOpenChange,
}: BookDetailModalProps): JSX.Element {
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
        <DialogContent className="sm:max-w-6xl h-[85vh] flex flex-col">
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
                <TabsTrigger value="editions">Editions</TabsTrigger>
                <TabsTrigger value="search">Search Releases</TabsTrigger>
              </TabsList>

              <DetailsTab book={book} open={open} onOpenChange={onOpenChange} />
              <EditionsTab
                foreignBookId={book.foreignBookId ?? undefined}
                enabled={open && activeTab === "editions"}
              />
              <SearchReleasesTab
                book={book}
                enabled={open}
                hasIndexers={hasIndexers}
                onNavigateAway={() => onOpenChange(false)}
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
