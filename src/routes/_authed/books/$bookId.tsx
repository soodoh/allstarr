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
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import { PageHeader } from "~/components/shared/page-header";
import { BookForm } from "~/components/books/book-form";
import { ConfirmDialog } from "~/components/shared/confirm-dialog";
import { DetailSkeleton } from "~/components/shared/loading-skeleton";
import { getBookFn, updateBookFn, deleteBookFn } from "~/server/books";
import { getAuthorsFn } from "~/server/authors";

export const Route = createFileRoute("/_authed/books/$bookId")({
  loader: async ({ params }) => {
    const [book, authors] = await Promise.all([
      getBookFn({ data: { id: parseInt(params.bookId) } }),
      getAuthorsFn(),
    ]);
    return { book, authors };
  },
  component: BookDetailPage,
  pendingComponent: DetailSkeleton,
});

function BookDetailPage() {
  const { book, authors } = Route.useLoaderData();
  const router = useRouter();
  const navigate = useNavigate();
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleUpdate = async (values: {
    title: string;
    authorId: number;
    overview?: string;
    isbn?: string;
    asin?: string;
    releaseDate?: string;
    monitored: boolean;
  }) => {
    setLoading(true);
    try {
      await updateBookFn({ data: { ...values, id: book.id } });
      toast.success("Book updated");
      setEditOpen(false);
      router.invalidate();
    } catch {
      toast.error("Failed to update book");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await deleteBookFn({ data: { id: book.id } });
      toast.success("Book deleted");
      navigate({ to: "/books" });
    } catch {
      toast.error("Failed to delete book");
    } finally {
      setDeleting(false);
    }
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
                        <TableCell>
                          {edition.publisher || "N/A"}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              edition.monitored ? "default" : "outline"
                            }
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
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Author</span>
                {book.authorName && (
                  <Link
                    to="/authors/$authorId"
                    params={{ authorId: String(book.authorId) }}
                    className="hover:underline"
                  >
                    {book.authorName}
                  </Link>
                )}
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Release Date</span>
                <span>{book.releaseDate || "Unknown"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Monitored</span>
                <Badge variant={book.monitored ? "default" : "outline"}>
                  {book.monitored ? "Yes" : "No"}
                </Badge>
              </div>
              {book.isbn && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">ISBN</span>
                  <span className="font-mono text-xs">{book.isbn}</span>
                </div>
              )}
              {book.asin && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">ASIN</span>
                  <span className="font-mono text-xs">{book.asin}</span>
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
            loading={loading}
          />
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete Book"
        description="Are you sure you want to delete this book? This cannot be undone."
        onConfirm={handleDelete}
        loading={deleting}
      />
    </div>
  );
}
