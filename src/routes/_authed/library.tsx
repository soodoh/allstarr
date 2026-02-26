import { createFileRoute, Link } from "@tanstack/react-router";
import { useBookDetailModal } from "src/components/books/book-detail-modal-provider";
import { useSuspenseQuery } from "@tanstack/react-query";
import { BookOpen, Users } from "lucide-react";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
  CardContent,
} from "src/components/ui/card";
import { Badge } from "src/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "src/components/ui/table";
import PageHeader from "src/components/shared/page-header";
import { authorsListQuery, booksListQuery } from "src/lib/queries";

export const Route = createFileRoute("/_authed/library")({
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(authorsListQuery()),
      context.queryClient.ensureQueryData(booksListQuery()),
    ]);
  },
  component: LibraryPage,
});

function LibraryPage() {
  const { openBookModal } = useBookDetailModal();
  const { data: authors } = useSuspenseQuery(authorsListQuery());
  const { data: books } = useSuspenseQuery(booksListQuery());

  return (
    <div>
      <PageHeader
        title="Library"
        description="Overview of your books collection"
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <Link to="/authors">
          <Card className="h-full transition-colors hover:border-primary hover:bg-accent/50 cursor-pointer">
            <CardHeader>
              <div className="flex items-center gap-3">
                <Users className="h-6 w-6 text-primary" />
                <CardTitle>Authors</CardTitle>
              </div>
              <CardDescription>Total authors: {authors.length}</CardDescription>
            </CardHeader>
            <CardContent />
          </Card>
        </Link>
        <Link to="/books">
          <Card className="h-full transition-colors hover:border-primary hover:bg-accent/50 cursor-pointer">
            <CardHeader>
              <div className="flex items-center gap-3">
                <BookOpen className="h-6 w-6 text-primary" />
                <CardTitle>Books</CardTitle>
              </div>
              <CardDescription>Total books: {books.length}</CardDescription>
            </CardHeader>
            <CardContent />
          </Card>
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Authors</CardTitle>
          </CardHeader>
          <CardContent>
            {authors.length === 0 ? (
              <p className="text-sm text-muted-foreground">No authors yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Books</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {authors.slice(0, 10).map((author) => (
                    <TableRow key={author.id}>
                      <TableCell>
                        <Link
                          to="/authors/$authorSlug"
                          params={{
                            authorSlug: author.slug || String(author.id),
                          }}
                          className="hover:underline"
                        >
                          {author.name}
                        </Link>
                      </TableCell>
                      <TableCell>{author.bookCount}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">{author.status}</Badge>
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
            <CardTitle>Recent Books</CardTitle>
          </CardHeader>
          <CardContent>
            {books.length === 0 ? (
              <p className="text-sm text-muted-foreground">No books yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Title</TableHead>
                    <TableHead>Author</TableHead>
                    <TableHead>Monitored</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {books.slice(0, 10).map((book) => (
                    <TableRow key={book.id}>
                      <TableCell>
                        <button
                          type="button"
                          onClick={() => openBookModal(book.id)}
                          className="hover:underline text-left"
                        >
                          {book.title}
                        </button>
                      </TableCell>
                      <TableCell>{book.authorName || "Unknown"}</TableCell>
                      <TableCell>
                        <Badge variant={book.monitored ? "default" : "outline"}>
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
    </div>
  );
}
