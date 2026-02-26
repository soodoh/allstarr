import { useEffect, useMemo, useRef, useState } from "react";
import type { JSX } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  ChevronDown,
  ChevronUp,
  ChevronsUpDown,
  ImageIcon,
  Pencil,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "src/components/ui/table";
import Skeleton from "src/components/ui/skeleton";
import BookDetailContent from "src/components/books/book-detail-content";
import BookForm from "src/components/books/book-form";
import SearchToolbar from "src/components/indexers/search-toolbar";
import ReleaseTable from "src/components/indexers/release-table";
import ConfirmDialog from "src/components/shared/confirm-dialog";
import TablePagination from "src/components/shared/table-pagination";
import {
  bookDetailQuery,
  authorsListQuery,
  hasEnabledIndexersQuery,
  hardcoverBookEditionsQuery,
  hardcoverBookLanguagesQuery,
} from "src/lib/queries";
import type { EditionSortKey } from "src/server/search";
import {
  useUpdateBook,
  useDeleteBook,
  useSearchIndexers,
  useGrabRelease,
} from "src/hooks/mutations";
import type { IndexerRelease } from "src/server/indexers/types";
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

type EditionColumn = {
  key: EditionSortKey | "author";
  label: string;
  sortable: boolean;
};

const EDITION_COLUMNS: EditionColumn[] = [
  { key: "title", label: "Title", sortable: true },
  { key: "author", label: "Author", sortable: false },
  { key: "publisher", label: "Publisher", sortable: true },
  { key: "type", label: "Type", sortable: true },
  { key: "pages", label: "Pages", sortable: true },
  { key: "releaseDate", label: "Release Date", sortable: true },
  { key: "isbn13", label: "ISBN-13", sortable: true },
  { key: "isbn10", label: "ISBN-10", sortable: true },
  { key: "asin", label: "ASIN", sortable: true },
  { key: "language", label: "Language", sortable: true },
  { key: "country", label: "Country", sortable: true },
  { key: "readers", label: "Readers", sortable: true },
  { key: "score", label: "Data Score", sortable: true },
];

// oxlint-disable-next-line complexity -- Rendering edition table with sort, pagination, and loading states
function EditionsTab({
  foreignBookId,
  open,
}: {
  foreignBookId: string | undefined;
  open: boolean;
}): JSX.Element {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [sortBy, setSortBy] = useState<EditionSortKey>("readers");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const bookId = foreignBookId ? Number(foreignBookId) : 0;

  const { data, isLoading } = useQuery({
    ...hardcoverBookEditionsQuery(bookId, { page, pageSize, sortBy, sortDir }),
    enabled: open && bookId > 0,
  });

  const handleSort = (key: EditionSortKey) => {
    if (sortBy === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(key);
      setSortDir("asc");
    }
    setPage(1);
  };

  const handlePageSizeChange = (size: number) => {
    setPageSize(size);
    setPage(1);
  };

  const SortIcon = ({ col }: { col: EditionSortKey }) => {
    if (sortBy !== col) {
      return (
        <ChevronsUpDown className="ml-1 h-3.5 w-3.5 text-muted-foreground/50 inline" />
      );
    }
    return sortDir === "asc" ? (
      <ChevronUp className="ml-1 h-3.5 w-3.5 inline" />
    ) : (
      <ChevronDown className="ml-1 h-3.5 w-3.5 inline" />
    );
  };

  if (!foreignBookId) {
    return (
      <TabsContent value="editions" className="overflow-y-auto flex-1 min-h-0">
        <p className="text-sm text-muted-foreground py-4">
          No Hardcover ID linked to this book.
        </p>
      </TabsContent>
    );
  }

  return (
    <TabsContent
      value="editions"
      className="flex-1 min-h-0 flex flex-col gap-3"
    >
      <div className="overflow-auto flex-1 min-h-0">
        <Table className="min-w-max">
          <colgroup>
            <col className="w-14" />
            {EDITION_COLUMNS.map((col) => (
              <col key={col.key} />
            ))}
          </colgroup>
          <TableHeader>
            <TableRow>
              <TableHead />
              {EDITION_COLUMNS.map(({ key, label, sortable }) =>
                sortable ? (
                  <TableHead
                    key={key}
                    className="cursor-pointer select-none hover:text-foreground whitespace-nowrap"
                    onClick={() => handleSort(key as EditionSortKey)}
                  >
                    {label}
                    <SortIcon col={key as EditionSortKey} />
                  </TableHead>
                ) : (
                  <TableHead key={key} className="whitespace-nowrap">
                    {label}
                  </TableHead>
                ),
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading &&
              Array.from({ length: 5 }).map((_, i) => (
                // oxlint-disable-next-line react/no-array-index-key -- Skeleton rows have no unique identity
                <TableRow key={i}>
                  <TableCell>
                    <Skeleton className="w-10 aspect-[2/3] rounded-sm" />
                  </TableCell>
                  {EDITION_COLUMNS.map((col) => (
                    <TableCell key={col.key}>
                      <Skeleton className="h-4 w-16" />
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            {!isLoading && data && data.editions.length > 0 &&
              data.editions.map((edition) => (
                <TableRow key={edition.id}>
                  <TableCell>
                    {edition.coverUrl ? (
                      <img
                        src={edition.coverUrl}
                        alt={edition.title}
                        className="aspect-[2/3] w-full rounded-sm object-cover"
                      />
                    ) : (
                      <div className="aspect-[2/3] w-full rounded-sm bg-muted flex items-center justify-center">
                        <ImageIcon className="h-4 w-4 text-muted-foreground" />
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="font-medium max-w-48 truncate">
                    {edition.title}
                  </TableCell>
                  <TableCell className="max-w-36 truncate">
                    {edition.author || "—"}
                  </TableCell>
                  <TableCell className="max-w-36 truncate">
                    {edition.publisher || "—"}
                  </TableCell>
                  <TableCell>{edition.type || "—"}</TableCell>
                  <TableCell>{edition.pages ?? "—"}</TableCell>
                  <TableCell className="whitespace-nowrap">
                    {edition.releaseDate || "—"}
                  </TableCell>
                  <TableCell>{edition.isbn13 || "—"}</TableCell>
                  <TableCell>{edition.isbn10 || "—"}</TableCell>
                  <TableCell>{edition.asin || "—"}</TableCell>
                  <TableCell>{edition.language || "—"}</TableCell>
                  <TableCell>{edition.country || "—"}</TableCell>
                  <TableCell>{edition.readers.toLocaleString()}</TableCell>
                  <TableCell>{edition.score.toLocaleString()}</TableCell>
                </TableRow>
              ))}
            {!isLoading && (!data || data.editions.length === 0) && (
              <TableRow>
                <TableCell
                  colSpan={EDITION_COLUMNS.length + 1}
                  className="text-center text-muted-foreground py-8"
                >
                  No editions found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      {data && data.total > 0 && (
        <TablePagination
          page={data.page}
          pageSize={pageSize}
          totalItems={data.total}
          totalPages={data.totalPages}
          onPageChange={setPage}
          onPageSizeChange={handlePageSizeChange}
        />
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
}): JSX.Element {
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
                open={open && activeTab === "editions"}
              />
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
