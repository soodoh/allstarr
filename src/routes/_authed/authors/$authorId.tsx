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
import { AuthorForm } from "~/components/authors/author-form";
import { getAuthorFn, updateAuthorFn, deleteAuthorFn } from "~/server/authors";
import { getQualityProfilesFn } from "~/server/quality-profiles";
import { getRootFoldersFn } from "~/server/root-folders";

export const Route = createFileRoute("/_authed/authors/$authorId")({
  loader: async ({ params }) => {
    const [author, qualityProfiles, rootFolders] = await Promise.all([
      getAuthorFn({ data: { id: parseInt(params.authorId) } }),
      getQualityProfilesFn(),
      getRootFoldersFn(),
    ]);
    return { author, qualityProfiles, rootFolders };
  },
  component: AuthorDetailPage,
});

function AuthorDetailPage() {
  const { author, qualityProfiles, rootFolders } = Route.useLoaderData();
  const router = useRouter();
  const navigate = useNavigate();
  const [editOpen, setEditOpen] = useState(false);
  const [loading, setLoading] = useState(false);

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
    try {
      await deleteAuthorFn({ data: { id: author.id } });
      toast.success("Author deleted");
      navigate({ to: "/authors" });
    } catch {
      toast.error("Failed to delete author");
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
            <Button variant="destructive" onClick={handleDelete}>
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {author.overview && (
            <Card>
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

          <Card>
            <CardHeader>
              <CardTitle>Books</CardTitle>
              <CardDescription>
                {author.books.length}{" "}
                {author.books.length === 1 ? "book" : "books"}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {author.books.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No books found for this author.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Title</TableHead>
                      <TableHead>Release Date</TableHead>
                      <TableHead>Monitored</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {author.books.map((book) => (
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
                        <TableCell>
                          {book.releaseDate || "Unknown"}
                        </TableCell>
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
                <span className="text-muted-foreground">Status</span>
                <Badge variant="secondary">{author.status}</Badge>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Monitored</span>
                <Badge variant={author.monitored ? "default" : "outline"}>
                  {author.monitored ? "Yes" : "No"}
                </Badge>
              </div>
              {author.rootFolderPath && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Root Folder</span>
                  <span className="font-mono text-xs">
                    {author.rootFolderPath}
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
    </div>
  );
}
