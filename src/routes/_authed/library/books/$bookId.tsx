import { useMemo, useState } from "react";
import type { JSX } from "react";
import {
  createFileRoute,
  Link,
  notFound,
  useNavigate,
  useRouter,
} from "@tanstack/react-router";
import { useSuspenseQuery, useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  ChevronDown,
  ExternalLink,
  Loader2,
  Pencil,
  RefreshCw,
  Trash2,
} from "lucide-react";
import PageHeader from "src/components/shared/page-header";
import { BookDetailSkeleton } from "src/components/shared/loading-skeleton";
import BookCover from "src/components/books/book-cover";
import AdditionalAuthors from "src/components/books/additional-authors";
import BookForm from "src/components/books/book-form";
import EditionsTab from "src/components/books/editions-tab";
import SearchReleasesTab from "src/components/books/search-releases-tab";
import ConfirmDialog from "src/components/shared/confirm-dialog";
import { Button } from "src/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "src/components/ui/card";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "src/components/ui/popover";
import { Tabs, TabsList, TabsTrigger } from "src/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "src/components/ui/dialog";
import {
  bookDetailQuery,
  authorsListQuery,
  hasEnabledIndexersQuery,
} from "src/lib/queries";
import {
  useUpdateBook,
  useDeleteBook,
  useRefreshBookMetadata,
} from "src/hooks/mutations";
import NotFound from "src/components/NotFound";

export const Route = createFileRoute("/_authed/library/books/$bookId")({
  loader: async ({ params, context }) => {
    const id = Number(params.bookId);
    if (!Number.isFinite(id) || id <= 0) {
      throw notFound();
    }
    await context.queryClient.ensureQueryData(bookDetailQuery(id));
  },
  component: BookDetailPage,
  notFoundComponent: NotFound,
  pendingComponent: () => <BookDetailSkeleton />,
});

// oxlint-disable-next-line complexity -- Book detail page with multiple sections, tabs, edit/delete dialogs
function BookDetailPage(): JSX.Element {
  const { bookId } = Route.useParams();
  const navigate = useNavigate();
  const router = useRouter();

  const { data: book } = useSuspenseQuery(bookDetailQuery(Number(bookId)));

  const [activeTab, setActiveTab] = useState("editions");
  const [editOpen, setEditOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const updateBook = useUpdateBook();
  const deleteBook = useDeleteBook();
  const refreshMetadata = useRefreshBookMetadata();

  const { data: authors } = useQuery({
    ...authorsListQuery(),
    enabled: editOpen,
  });

  const { data: hasIndexers } = useQuery({
    ...hasEnabledIndexersQuery(),
    enabled: activeTab === "search",
  });

  const authorsList = useMemo(() => authors ?? [], [authors]);
  const editionsList = useMemo(() => book?.editions ?? [], [book?.editions]);

  if (!book) {
    return <NotFound />;
  }

  const coverImages = book.images;
  const authorName = book.authorName || "Unknown";
  const hardcoverUrl = book.slug
    ? `https://hardcover.app/books/${book.slug}`
    : null;

  const handleUpdate = (values: {
    title: string;
    authorId: number;
    description: string | null;
    releaseDate: string | null;
    monitored: boolean;
  }) => {
    updateBook.mutate(
      { ...values, id: book.id },
      {
        onSuccess: () => {
          setEditOpen(false);
          router.invalidate();
        },
      },
    );
  };

  const handleDelete = () => {
    deleteBook.mutate(book.id, {
      onSuccess: () => {
        setConfirmDelete(false);
        navigate({ to: "/library/books" });
      },
    });
  };

  const handleRefreshMetadata = () => {
    refreshMetadata.mutate(book.id, {
      onSuccess: () => router.invalidate(),
    });
  };

  return (
    <div className="space-y-6">
      {/* Back button */}
      <Link
        to="/library/books"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Books
      </Link>

      {/* Page header */}
      <PageHeader
        title={book.title}
        description={
          <Link
            to="/library/authors/$authorId"
            params={{ authorId: String(book.authorId) }}
            className="hover:underline"
          >
            {authorName}
          </Link>
        }
        actions={
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefreshMetadata}
              disabled={refreshMetadata.isPending}
            >
              {refreshMetadata.isPending ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-1" />
              )}
              Update Metadata
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setEditOpen(true)}
            >
              <Pencil className="h-4 w-4 mr-1" />
              Edit
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setConfirmDelete(true)}
            >
              <Trash2 className="h-4 w-4 mr-1" />
              Delete
            </Button>
            {hardcoverUrl && (
              <Button variant="outline" size="sm" asChild>
                <a href={hardcoverUrl} target="_blank" rel="noreferrer">
                  <ExternalLink className="h-4 w-4 mr-1" />
                  Hardcover
                </a>
              </Button>
            )}
          </div>
        }
      />

      {/* Cover + Details + Description */}
      <div className="flex flex-col gap-6 xl:flex-row">
        <BookCover
          title={book.title}
          images={coverImages}
          className="w-full xl:w-44 shrink-0"
        />

        <Card className="w-full xl:w-72 xl:shrink-0">
          <CardHeader>
            <CardTitle>Details</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="space-y-3 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Author</dt>
                <dd className="text-right">
                  {book.authorId ? (
                    <Link
                      to="/library/authors/$authorId"
                      params={{
                        authorId: String(book.authorId),
                      }}
                      className="hover:underline"
                    >
                      {authorName}
                    </Link>
                  ) : (
                    authorName
                  )}
                  {book.foreignAuthorIds &&
                    book.foreignAuthorIds.length > 0 && (
                      <>
                        ,{" "}
                        <AdditionalAuthors
                          foreignAuthorIds={book.foreignAuthorIds}
                          resolvedAuthors={book.resolvedAuthors ?? {}}
                        />
                      </>
                    )}
                </dd>
              </div>
              {book.releaseDate && (
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Release Date</dt>
                  <dd>{book.releaseDate}</dd>
                </div>
              )}
              {book.series && book.series.length > 0 && (
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Series</dt>
                  <dd>
                    {book.series
                      .map((s) =>
                        s.position ? `${s.title} #${s.position}` : s.title,
                      )
                      .join(", ")}
                  </dd>
                </div>
              )}
              {book.rating !== null && (
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Rating</dt>
                  <dd>
                    {book.rating.toFixed(1)}/5
                    {book.ratingsCount !== null && book.ratingsCount > 0 && (
                      <span className="text-muted-foreground ml-1">
                        ({book.ratingsCount.toLocaleString()})
                      </span>
                    )}
                  </dd>
                </div>
              )}
              {book.usersCount !== null && book.usersCount > 0 && (
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Readers</dt>
                  <dd>{book.usersCount.toLocaleString()}</dd>
                </div>
              )}
              {book.languages && book.languages.length > 0 && (
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Languages</dt>
                  <dd>
                    <Popover>
                      <PopoverTrigger className="inline-flex items-center gap-1 hover:text-foreground transition-colors cursor-pointer">
                        {book.languages.length === 1
                          ? book.languages[0].language
                          : `${book.languages[0].language} and ${book.languages.length - 1} other${book.languages.length - 1 === 1 ? "" : "s"}`}
                        {book.languages.length > 1 && (
                          <ChevronDown className="h-3 w-3" />
                        )}
                      </PopoverTrigger>
                      {book.languages.length > 1 && (
                        <PopoverContent align="end" className="w-48 p-0">
                          <ul className="max-h-64 overflow-y-auto py-1">
                            {book.languages.map((l) => (
                              <li
                                key={l.languageCode}
                                className="px-3 py-1.5 text-sm"
                              >
                                {l.language}
                              </li>
                            ))}
                          </ul>
                        </PopoverContent>
                      )}
                    </Popover>
                  </dd>
                </div>
              )}
            </dl>
          </CardContent>
        </Card>

        <Card className="w-full xl:flex-1">
          <CardHeader>
            <CardTitle>Description</CardTitle>
          </CardHeader>
          <CardContent>
            {book.description ? (
              <p className="text-sm leading-relaxed">{book.description}</p>
            ) : (
              <p className="text-sm text-muted-foreground">
                No description available.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Card>
        <CardContent className="p-0">
          <Tabs
            value={activeTab}
            onValueChange={setActiveTab}
            className="flex flex-col"
          >
            <TabsList className="m-4 mb-0">
              <TabsTrigger value="editions">Editions</TabsTrigger>
              <TabsTrigger value="search">Search Releases</TabsTrigger>
            </TabsList>

            <div className="p-4">
              <EditionsTab editions={editionsList} />
              <SearchReleasesTab
                book={book}
                enabled={activeTab === "search"}
                hasIndexers={hasIndexers}
              />
            </div>
          </Tabs>
        </CardContent>
      </Card>

      {/* Edit dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit Book</DialogTitle>
          </DialogHeader>
          <BookForm
            initialValues={{
              title: book.title,
              authorId: book.authorId,
              description: book.description || null,
              releaseDate: book.releaseDate || null,
              monitored: book.monitored,
            }}
            authors={authorsList}
            onSubmit={handleUpdate}
            onCancel={() => setEditOpen(false)}
            loading={updateBook.isPending}
          />
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete Book"
        description="Are you sure you want to delete this book? This cannot be undone."
        onConfirm={handleDelete}
        loading={deleteBook.isPending}
      />
    </div>
  );
}
