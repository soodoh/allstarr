import {
  createFileRoute,
  Link,
  useNavigate,
  useRouter,
} from "@tanstack/react-router";
import { useState } from "react";
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
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import PageHeader from "~/components/shared/page-header";
import AuthorForm from "~/components/authors/author-form";
import AuthorPhoto from "~/components/authors/author-photo";
import ConfirmDialog from "~/components/shared/confirm-dialog";
import { DetailSkeleton } from "~/components/shared/loading-skeleton";
import SortableTableHead from "~/components/shared/sortable-table-head";
import TablePagination from "~/components/shared/table-pagination";
import { getAuthorFn, updateAuthorFn, deleteAuthorFn } from "~/server/authors";
import { getQualityProfilesFn } from "~/server/quality-profiles";
import { getRootFoldersFn } from "~/server/root-folders";
import { useTableState } from "~/hooks/use-table-state";

export const Route = createFileRoute("/_authed/authors/$authorId")({
  loader: async ({ params }) => {
    const [author, qualityProfiles, rootFolders] = await Promise.all([
      getAuthorFn({ data: { id: Number.parseInt(params.authorId, 10) } }),
      getQualityProfilesFn(),
      getRootFoldersFn(),
    ]);
    return { author, qualityProfiles, rootFolders };
  },
  component: AuthorDetailPage,
  pendingComponent: DetailSkeleton,
});

type Book = NonNullable<
  Awaited<ReturnType<typeof getAuthorFn>>
>["books"][number];

const bookComparators: Partial<Record<string, (a: Book, b: Book) => number>> = {
  title: (a, b) => (a.title ?? "").localeCompare(b.title ?? ""),
  releaseDate: (a, b) => {
    const da = a.releaseDate ? new Date(a.releaseDate).getTime() : 0;
    const db = b.releaseDate ? new Date(b.releaseDate).getTime() : 0;
    return da - db;
  },
  monitored: (a, b) => Number(a.monitored) - Number(b.monitored),
};

function AuthorDetailPage() {
  const { author, qualityProfiles, rootFolders } = Route.useLoaderData();
  const router = useRouter();
  const navigate = useNavigate();
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const authorImageUrl =
    author.images?.find((image) => image.coverType.toLowerCase() === "poster")
      ?.url ??
    author.images?.find((image) => image.coverType.toLowerCase() === "fanart")
      ?.url ??
    author.images?.[0]?.url ??
    null;

  const {
    page,
    pageSize,
    sortColumn,
    sortDirection,
    handleSort,
    setPage,
    setPageSize,
    paginatedData: paginatedBooks,
    totalPages,
  } = useTableState({
    data: author.books,
    defaultPageSize: 25,
    comparators: bookComparators,
  });

  const handleUpdate = async (values: {
    name: string;
    sortName: string;
    overview?: string;
    status: string;
    monitored: boolean;
    qualityProfileId?: number;
    rootFolderPath?: string;
  }) => {
    setLoading(true);
    try {
      await updateAuthorFn({ data: { ...values, id: author.id } });
      toast.success("Author updated");
      setEditOpen(false);
      router.invalidate();
    } catch {
      toast.error("Failed to update author");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await deleteAuthorFn({ data: { id: author.id } });
      toast.success("Author deleted");
      navigate({ to: "/authors" });
    } catch {
      toast.error("Failed to delete author");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div>
      <div className="mb-4">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/authors">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Authors
          </Link>
        </Button>
      </div>

      <PageHeader
        title={author.name}
        description={author.sortName}
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

      <div className="space-y-6">
        <div className="flex flex-col gap-6 xl:flex-row">
          <div className="w-full xl:w-auto xl:shrink-0">
            <AuthorPhoto
              name={author.name}
              imageUrl={authorImageUrl}
              className="xl:h-full xl:max-w-none xl:w-44 xl:aspect-auto"
            />
          </div>

          <Card className="w-full xl:w-auto xl:shrink-0">
            <CardHeader>
              <CardTitle>Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">Status</span>
                <Badge variant="secondary">{author.status}</Badge>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">Monitored</span>
                <Badge variant={author.monitored ? "default" : "outline"}>
                  {author.monitored ? "Yes" : "No"}
                </Badge>
              </div>
              {author.rootFolderPath && (
                <div className="flex flex-col gap-1 sm:flex-row sm:justify-between sm:gap-4">
                  <span className="text-muted-foreground shrink-0">
                    Root Folder
                  </span>
                  <span className="font-mono text-xs break-all">
                    {author.rootFolderPath}
                  </span>
                </div>
              )}
            </CardContent>
          </Card>

          {author.overview && (
            <Card className="w-full xl:min-w-0 xl:flex-1">
              <CardHeader>
                <CardTitle>Overview</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                  {author.overview}
                </p>
              </CardContent>
            </Card>
          )}
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Books</CardTitle>
            <CardDescription>
              {author.books.length}{" "}
              {author.books.length === 1 ? "book" : "books"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {author.books.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No books found for this author.
              </p>
            ) : (
              <>
                <TablePagination
                  page={page}
                  pageSize={pageSize}
                  totalItems={author.books.length}
                  totalPages={totalPages}
                  onPageChange={setPage}
                  onPageSizeChange={setPageSize}
                />
                <Table>
                  <TableHeader>
                    <TableRow>
                      <SortableTableHead
                        column="title"
                        sortColumn={sortColumn}
                        sortDirection={sortDirection}
                        onSort={handleSort}
                      >
                        Title
                      </SortableTableHead>
                      <SortableTableHead
                        column="releaseDate"
                        sortColumn={sortColumn}
                        sortDirection={sortDirection}
                        onSort={handleSort}
                      >
                        Release Date
                      </SortableTableHead>
                      <SortableTableHead
                        column="monitored"
                        sortColumn={sortColumn}
                        sortDirection={sortDirection}
                        onSort={handleSort}
                      >
                        Monitored
                      </SortableTableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedBooks.map((book) => (
                      <TableRow key={book.id}>
                        <TableCell>
                          <Link
                            to="/books/$bookId"
                            params={{ bookId: String(book.id) }}
                            className="font-medium hover:underline"
                          >
                            {book.title}
                          </Link>
                        </TableCell>
                        <TableCell>{book.releaseDate || "Unknown"}</TableCell>
                        <TableCell>
                          <Badge
                            variant={book.monitored ? "default" : "outline"}
                          >
                            {book.monitored ? "Yes" : "No"}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <TablePagination
                  page={page}
                  pageSize={pageSize}
                  totalItems={author.books.length}
                  totalPages={totalPages}
                  onPageChange={setPage}
                  onPageSizeChange={setPageSize}
                />
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit Author</DialogTitle>
          </DialogHeader>
          <AuthorForm
            initialValues={{
              name: author.name,
              sortName: author.sortName,
              overview: author.overview || undefined,
              status: author.status,
              monitored: author.monitored,
              qualityProfileId: author.qualityProfileId || undefined,
              rootFolderPath: author.rootFolderPath || undefined,
            }}
            qualityProfiles={qualityProfiles}
            rootFolders={rootFolders}
            onSubmit={handleUpdate}
            onCancel={() => setEditOpen(false)}
            loading={loading}
          />
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete Author"
        description="Are you sure you want to delete this author? This will also delete all associated books and cannot be undone."
        onConfirm={handleDelete}
        loading={deleting}
      />
    </div>
  );
}
