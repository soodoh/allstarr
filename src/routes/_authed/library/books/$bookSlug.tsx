import { useMemo, useState } from "react";
import type { JSX } from "react";
import {
  createFileRoute,
  Link,
  notFound,
  useNavigate,
  useRouter,
} from "@tanstack/react-router";
import {
  useSuspenseQuery,
  useQuery,
} from "@tanstack/react-query";
import {
  ArrowLeft,
  ExternalLink,
  Pencil,
  Trash2,
} from "lucide-react";
import PageHeader from "src/components/shared/page-header";
import { BookDetailSkeleton } from "src/components/shared/loading-skeleton";
import BookCover from "src/components/books/book-cover";
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
  Tabs,
  TabsList,
  TabsTrigger,
} from "src/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "src/components/ui/dialog";
import {
  bookDetailBySlugQuery,
  authorsListQuery,
  hasEnabledIndexersQuery,
  hardcoverBookLanguagesQuery,
} from "src/lib/queries";
import { getBookBySlugFn } from "src/server/books";
import { useUpdateBook, useDeleteBook } from "src/hooks/mutations";
import NotFound from "src/components/NotFound";

export const Route = createFileRoute("/_authed/library/books/$bookSlug")({
  loader: async ({ params, context }) => {
    const slug = params.bookSlug;
    const book = await getBookBySlugFn({ data: { slug } });
    if (!book) {
      throw notFound();
    }
    await context.queryClient.ensureQueryData(bookDetailBySlugQuery(slug));
  },
  component: BookDetailPage,
  notFoundComponent: NotFound,
  pendingComponent: () => <BookDetailSkeleton />,
});

// oxlint-disable-next-line complexity -- Book detail page with multiple sections, tabs, edit/delete dialogs
function BookDetailPage(): JSX.Element {
  const { bookSlug } = Route.useParams();
  const navigate = useNavigate();
  const router = useRouter();

  const { data: book } = useSuspenseQuery(bookDetailBySlugQuery(bookSlug));

  const [activeTab, setActiveTab] = useState("editions");
  const [editOpen, setEditOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const updateBook = useUpdateBook();
  const deleteBook = useDeleteBook();

  const { data: authors } = useQuery({
    ...authorsListQuery(),
    enabled: editOpen,
  });

  const { data: hasIndexers } = useQuery({
    ...hasEnabledIndexersQuery(),
    enabled: activeTab === "search",
  });

  const foreignBookId = book?.foreignBookId ? Number(book.foreignBookId) : 0;

  const { data: languages } = useQuery({
    ...hardcoverBookLanguagesQuery(foreignBookId),
    enabled: foreignBookId > 0,
  });

  const authorsList = useMemo(() => authors ?? [], [authors]);

  if (!book) {
    return <NotFound />;
  }

  const coverImages = book.images ?? undefined;
  const authorName = book.authorName || "Unknown";
  const hardcoverUrl = book.foreignBookId
    ? `https://hardcover.app/books/${book.slug || book.foreignBookId}`
    : undefined;

  const handleUpdate = (values: {
    title: string;
    authorId: number;
    overview?: string;
    isbn?: string;
    asin?: string;
    releaseDate?: string;
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
        description={authorName}
        actions={
          <div className="flex gap-2">
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
                <a
                  href={hardcoverUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  <ExternalLink className="h-4 w-4 mr-1" />
                  Hardcover
                </a>
              </Button>
            )}
          </div>
        }
      />

      {/* Cover + Details + Overview */}
      <div className="flex flex-col gap-6 xl:flex-row">
        <BookCover
          title={book.title}
          images={coverImages}
          className="w-full xl:w-44 shrink-0"
        />

        <Card className="w-full xl:w-auto xl:shrink-0">
          <CardHeader>
            <CardTitle>Details</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="space-y-3 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Author</dt>
                <dd>
                  {book.authorId ? (
                    <Link
                      to="/library/authors/$authorSlug"
                      params={{
                        authorSlug: book.authorSlug || String(book.authorId),
                      }}
                      className="hover:underline"
                    >
                      {authorName}
                    </Link>
                  ) : (
                    authorName
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
                        s.position
                          ? `${s.title} #${s.position}`
                          : s.title,
                      )
                      .join(", ")}
                  </dd>
                </div>
              )}
              {book.ratings && (
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Rating</dt>
                  <dd>
                    {book.ratings.value.toFixed(1)}/5
                    {book.ratings.votes > 0 && (
                      <span className="text-muted-foreground ml-1">
                        ({book.ratings.votes.toLocaleString()})
                      </span>
                    )}
                  </dd>
                </div>
              )}
              {book.readers !== undefined && book.readers !== null && book.readers > 0 && (
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Readers</dt>
                  <dd>{book.readers.toLocaleString()}</dd>
                </div>
              )}
              {book.language && (
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Language</dt>
                  <dd>{book.language}</dd>
                </div>
              )}
              {languages && languages.length > 0 && (
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground shrink-0">Available</dt>
                  <dd className="text-right break-words min-w-0">{languages.map((l) => l.name).join(", ")}</dd>
                </div>
              )}
              {book.isbn && (
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">ISBN</dt>
                  <dd className="font-mono text-xs">{book.isbn}</dd>
                </div>
              )}
              {book.asin && (
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">ASIN</dt>
                  <dd className="font-mono text-xs">{book.asin}</dd>
                </div>
              )}
            </dl>
          </CardContent>
        </Card>

        <Card className="w-full xl:flex-1">
          <CardHeader>
            <CardTitle>Overview</CardTitle>
          </CardHeader>
          <CardContent>
            {book.overview ? (
              <p className="text-sm leading-relaxed">{book.overview}</p>
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
              <EditionsTab
                foreignBookId={book.foreignBookId ?? undefined}
                enabled={activeTab === "editions"}
              />
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
