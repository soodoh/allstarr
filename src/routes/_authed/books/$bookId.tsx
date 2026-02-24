import {
  createFileRoute,
  Link,
  useNavigate,
} from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Pencil, Trash2 } from "lucide-react";
import { Button } from "~/components/ui/button";
import { Badge } from "~/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import PageHeader from "~/components/shared/page-header";
import BookForm from "~/components/books/book-form";
import ConfirmDialog from "~/components/shared/confirm-dialog";
import { DetailSkeleton } from "~/components/shared/loading-skeleton";
import SearchToolbar from "~/components/indexers/search-toolbar";
import ReleaseTable from "~/components/indexers/release-table";
import { bookDetailQuery, authorsListQuery } from "~/lib/queries";
import { useUpdateBook, useDeleteBook, useSearchIndexers, useGrabRelease } from "~/hooks/mutations";
import type { IndexerRelease } from "~/server/indexers/types";

export const Route = createFileRoute("/_authed/books/$bookId")({
  loader: async ({ params, context }) => {
    const id = Number.parseInt(params.bookId, 10);
    await Promise.all([
      context.queryClient.ensureQueryData(bookDetailQuery(id)),
      context.queryClient.ensureQueryData(authorsListQuery()),
    ]);
  },
  component: BookDetailPage,
  pendingComponent: DetailSkeleton,
});

function BookDetailPage() {
  const params = Route.useParams();
  const bookId = Number.parseInt(params.bookId, 10);
  const navigate = useNavigate();

  const { data: book } = useSuspenseQuery(bookDetailQuery(bookId));
  const { data: authors } = useSuspenseQuery(authorsListQuery());

  const updateBook = useUpdateBook();
  const deleteBook = useDeleteBook();
  const searchIndexers = useSearchIndexers();
  const grabRelease = useGrabRelease();

  const releases = useMemo(
    () => searchIndexers.data ?? [],
    [searchIndexers.data],
  );

  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

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
      { onSuccess: () => setEditOpen(false) },
    );
  };

  const handleDelete = () => {
    deleteBook.mutate(book.id, {
      onSuccess: () => navigate({ to: "/books" }),
    });
  };

  const handleSearch = (query: string) => {
    setHasSearched(true);
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
        onSuccess: (result) => toast.success(`Sent to ${result.downloadClientName}`),
      },
    );
  };

  return (
    <div>
      <div className="mb-4">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/books">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Books
          </Link>
        </Button>
      </div>

      <PageHeader
        title={book.title}
        description={book.authorName || undefined}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setEditOpen(true)}>
              <Pencil className="mr-2 h-4 w-4" />
              Edit
            </Button>
            <Button variant="destructive" onClick={() => setDeleteOpen(true)}>
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {book.overview && (
            <Card>
              <CardHeader>
                <CardTitle>Overview</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                  {book.overview}
                </p>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Editions</CardTitle>
              <CardDescription>
                {book.editions.length}{" "}
                {book.editions.length === 1 ? "edition" : "editions"}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {book.editions.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No editions found.
                </p>
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
                    {book.editions.map((edition) => (
                      <TableRow key={edition.id}>
                        <TableCell className="font-medium">
                          {edition.title}
                        </TableCell>
                        <TableCell>{edition.format || "N/A"}</TableCell>
                        <TableCell>{edition.isbn || "N/A"}</TableCell>
                        <TableCell>{edition.publisher || "N/A"}</TableCell>
                        <TableCell>
                          <Badge
                            variant={edition.monitored ? "default" : "outline"}
                          >
                            {edition.monitored ? "Yes" : "No"}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Search Releases</CardTitle>
              <CardDescription>
                Find releases via your configured indexers
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <SearchToolbar
                defaultQuery={`${book.authorName ? `${book.authorName} ` : ""}${book.title}`}
                onSearch={handleSearch}
                searching={searchIndexers.isPending}
              />
              {hasSearched && (
                <ReleaseTable
                  releases={releases}
                  grabbingGuid={grabRelease.isPending ? grabRelease.variables?.guid : undefined}
                  onGrab={handleGrab}
                />
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground shrink-0">Author</span>
                {book.authorName && (
                  <Link
                    to="/authors/$authorId"
                    params={{ authorId: String(book.authorId) }}
                    className="hover:underline text-right"
                  >
                    {book.authorName}
                  </Link>
                )}
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground shrink-0">
                  Release Date
                </span>
                <span>{book.releaseDate || "Unknown"}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground shrink-0">
                  Monitored
                </span>
                <Badge variant={book.monitored ? "default" : "outline"}>
                  {book.monitored ? "Yes" : "No"}
                </Badge>
              </div>
              {book.isbn && (
                <div className="flex flex-col gap-1 sm:flex-row sm:justify-between sm:gap-4">
                  <span className="text-muted-foreground shrink-0">ISBN</span>
                  <span className="font-mono text-xs break-all">
                    {book.isbn}
                  </span>
                </div>
              )}
              {book.asin && (
                <div className="flex flex-col gap-1 sm:flex-row sm:justify-between sm:gap-4">
                  <span className="text-muted-foreground shrink-0">ASIN</span>
                  <span className="font-mono text-xs break-all">
                    {book.asin}
                  </span>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

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
            authors={authors}
            onSubmit={handleUpdate}
            onCancel={() => setEditOpen(false)}
            loading={updateBook.isPending}
          />
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete Book"
        description="Are you sure you want to delete this book? This cannot be undone."
        onConfirm={handleDelete}
        loading={deleteBook.isPending}
      />
    </div>
  );
}
