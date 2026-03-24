import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { BookOpen, ImageIcon, Users } from "lucide-react";
import AdditionalAuthors from "src/components/bookshelf/books/additional-authors";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
  CardContent,
} from "src/components/ui/card";
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

export const Route = createFileRoute("/_authed/bookshelf/")({
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(authorsListQuery()),
      context.queryClient.ensureQueryData(booksListQuery()),
    ]);
  },
  component: BookshelfPage,
});

function BookshelfPage() {
  const navigate = useNavigate();
  const { data: authors } = useSuspenseQuery(authorsListQuery());
  const { data: books } = useSuspenseQuery(booksListQuery());

  return (
    <div>
      <PageHeader
        title="Bookshelf"
        description="Overview of your books collection"
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <Link to="/bookshelf/authors">
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
        <Link to="/bookshelf/books">
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
                <colgroup>
                  <col className="w-14" />
                  <col />
                  <col />
                </colgroup>
                <TableHeader>
                  <TableRow>
                    <TableHead />
                    <TableHead>Name</TableHead>
                    <TableHead>Books</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {authors.slice(0, 10).map((author) => {
                    const authorImage = author.images?.[0]?.url;
                    return (
                      <TableRow
                        key={author.id}
                        className="cursor-pointer hover:bg-accent/50 transition-colors"
                        onClick={() =>
                          navigate({
                            to: "/bookshelf/authors/$authorId",
                            params: {
                              authorId: String(author.id),
                            },
                          })
                        }
                      >
                        <TableCell>
                          {authorImage ? (
                            <img
                              src={authorImage}
                              alt={author.name}
                              className="aspect-square w-full rounded-full object-cover"
                            />
                          ) : (
                            <div className="aspect-square w-full rounded-full bg-muted flex items-center justify-center">
                              <ImageIcon className="h-5 w-5 text-muted-foreground" />
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          <Link
                            to="/bookshelf/authors/$authorId"
                            params={{
                              authorId: String(author.id),
                            }}
                            className="font-medium hover:underline"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {author.name}
                          </Link>
                        </TableCell>
                        <TableCell>{author.bookCount}</TableCell>
                      </TableRow>
                    );
                  })}
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
                <colgroup>
                  <col className="w-14" />
                  <col />
                  <col />
                </colgroup>
                <TableHeader>
                  <TableRow>
                    <TableHead />
                    <TableHead>Title</TableHead>
                    <TableHead>Author</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {books.slice(0, 10).map((book) => {
                    const bookImage = book.images?.[0]?.url;
                    return (
                      <TableRow
                        key={book.id}
                        className="cursor-pointer hover:bg-accent/50 transition-colors"
                        onClick={() =>
                          navigate({
                            to: "/bookshelf/books/$bookId",
                            params: { bookId: String(book.id) },
                          })
                        }
                      >
                        <TableCell>
                          {bookImage ? (
                            <img
                              src={bookImage}
                              alt={book.title}
                              className="aspect-[2/3] w-full rounded-sm object-cover"
                            />
                          ) : (
                            <div className="aspect-[2/3] w-full rounded-sm bg-muted flex items-center justify-center">
                              <ImageIcon className="h-4 w-4 text-muted-foreground" />
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="font-medium">
                          {book.title}
                        </TableCell>
                        <TableCell>
                          {book.bookAuthors.length > 0 ? (
                            <AdditionalAuthors bookAuthors={book.bookAuthors} />
                          ) : (
                            book.authorName || "Unknown"
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
