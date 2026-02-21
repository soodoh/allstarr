import { Fragment, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "~/components/shared/page-header";
import { DetailSkeleton } from "~/components/shared/loading-skeleton";
import { AuthorPhoto } from "~/components/authors/author-photo";
import { TablePagination } from "~/components/shared/table-pagination";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import {
  getHardcoverAuthorFn,
  type HardcoverAuthorBook,
} from "~/server/search";

const DEFAULT_LANGUAGE = "en";
const DEFAULT_PAGE_SIZE = 25;

function groupBooksByLanguage(books: HardcoverAuthorBook[]) {
  const sortedBooks = [...books].sort((a, b) => {
    const languageCompare = (a.languageName || "Unknown").localeCompare(
      b.languageName || "Unknown"
    );
    if (languageCompare !== 0) return languageCompare;
    return (b.releaseYear || 0) - (a.releaseYear || 0);
  });

  const groups = new Map<
    string,
    { key: string; label: string; books: HardcoverAuthorBook[] }
  >();
  for (const book of sortedBooks) {
    const key = book.languageCode || "unknown";
    const label = book.languageName || "Unknown";
    if (!groups.has(key)) {
      groups.set(key, { key, label, books: [] });
    }
    groups.get(key)!.books.push(book);
  }

  return Array.from(groups.values());
}

export const Route = createFileRoute("/_authed/hardcover/authors/$authorSlug")({
  loader: ({ params }) =>
    getHardcoverAuthorFn({
      data: {
        slug: params.authorSlug,
        page: 1,
        pageSize: DEFAULT_PAGE_SIZE,
        language: DEFAULT_LANGUAGE,
      },
    }),
  component: HardcoverAuthorPage,
  pendingComponent: DetailSkeleton,
});

function HardcoverAuthorPage() {
  const params = Route.useParams();
  const initialAuthor = Route.useLoaderData();
  const [author, setAuthor] = useState(initialAuthor);
  const [loading, setLoading] = useState(false);
  const lifespan =
    author.bornYear || author.deathYear
      ? `${author.bornYear || "?"}-${author.deathYear || "Present"}`
      : null;
  const languageGroups = groupBooksByLanguage(author.books);

  const loadAuthor = async (next: {
    page?: number;
    language?: string;
    pageSize?: number;
  }) => {
    const page = next.page ?? author.page;
    const language = next.language ?? author.selectedLanguage;
    const pageSize = next.pageSize ?? author.pageSize;
    setLoading(true);
    try {
      const data = await getHardcoverAuthorFn({
        data: {
          slug: params.authorSlug,
          page,
          pageSize,
          language,
        },
      });
      setAuthor(data);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to load author data.";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <Button variant="ghost" size="sm" asChild>
          <Link to="/search">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Search
          </Link>
        </Button>
      </div>

      <PageHeader
        title={author.name}
        description={lifespan || "Hardcover author profile"}
        actions={
          author.hardcoverUrl ? (
            <Button asChild variant="outline">
              <a href={author.hardcoverUrl} target="_blank" rel="noreferrer">
                <ExternalLink className="mr-2 h-4 w-4" />
                Open on Hardcover
              </a>
            </Button>
          ) : null
        }
      />

      <div className="space-y-6">
        <div className="flex flex-col gap-6 xl:flex-row">
          <div className="w-full xl:w-auto xl:shrink-0">
            <AuthorPhoto
              name={author.name}
              imageUrl={author.imageUrl}
              className="xl:h-full xl:max-w-none xl:w-44 xl:aspect-auto"
            />
          </div>

          <Card className="w-full xl:w-auto xl:shrink-0">
            <CardHeader>
              <CardTitle>Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex flex-col gap-1 sm:flex-row sm:justify-between sm:gap-4">
                <span className="text-muted-foreground shrink-0">Slug</span>
                <span className="font-mono text-xs break-all">{author.slug}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">Books</span>
                <span>{author.booksCount ?? author.books.length}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">Filter</span>
                <span className="capitalize">
                  {author.languages.find((l) => l.code === author.selectedLanguage)
                    ?.name || author.selectedLanguage}
                </span>
              </div>
              {author.bornYear && (
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">Born</span>
                  <span>{author.bornYear}</span>
                </div>
              )}
              {author.deathYear && (
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">Died</span>
                  <span>{author.deathYear}</span>
                </div>
              )}
            </CardContent>
          </Card>

          {author.bio && (
            <Card className="w-full xl:min-w-0 xl:flex-1">
              <CardHeader>
                <CardTitle>Overview</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                  {author.bio}
                </p>
              </CardContent>
            </Card>
          )}
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Books</CardTitle>
            <CardDescription>
              {author.totalBooks} result{author.totalBooks === 1 ? "" : "s"} •
              page {author.page} of {author.totalPages}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-sm text-muted-foreground">
                Grouped by language
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Language</span>
                <Select
                  value={author.selectedLanguage}
                  onValueChange={(value) =>
                    loadAuthor({
                      language: value,
                      page: 1,
                    })
                  }
                >
                  <SelectTrigger className="w-full sm:w-[220px]" disabled={loading}>
                    <SelectValue placeholder="Select language" />
                  </SelectTrigger>
                  <SelectContent>
                    {author.languages.map((language) => (
                      <SelectItem key={language.code} value={language.code}>
                        {language.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {author.totalBooks > 0 && (
              <TablePagination
                page={author.page}
                pageSize={author.pageSize}
                totalItems={author.totalBooks}
                totalPages={author.totalPages}
                onPageChange={(p) => loadAuthor({ page: p })}
                onPageSizeChange={(size) =>
                  loadAuthor({ page: 1, pageSize: size })
                }
              />
            )}

            {author.books.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No books found for the selected language filter.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Title</TableHead>
                    <TableHead>Year</TableHead>
                    <TableHead>Rating</TableHead>
                    <TableHead>Role</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {languageGroups.map((group) => (
                    <Fragment key={group.key}>
                      <TableRow key={`group-${group.key}`}>
                        <TableCell
                          colSpan={4}
                          className="bg-muted/40 font-medium text-muted-foreground"
                        >
                          {group.label}
                        </TableCell>
                      </TableRow>
                      {group.books.map((book) => (
                        <TableRow key={`${group.key}-${book.id}`}>
                          <TableCell>
                            {book.hardcoverUrl ? (
                              <a
                                href={book.hardcoverUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="font-medium hover:underline"
                              >
                                {book.title}
                              </a>
                            ) : (
                              <span className="font-medium">{book.title}</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {book.releaseYear ||
                              (book.releaseDate
                                ? book.releaseDate.slice(0, 4)
                                : "Unknown")}
                          </TableCell>
                          <TableCell>
                            {book.rating !== null
                              ? book.rating.toFixed(2)
                              : "N/A"}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">
                              {book.contribution || "Contributor"}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </Fragment>
                  ))}
                </TableBody>
              </Table>
            )}

            {author.totalBooks > 0 && (
              <TablePagination
                page={author.page}
                pageSize={author.pageSize}
                totalItems={author.totalBooks}
                totalPages={author.totalPages}
                onPageChange={(p) => loadAuthor({ page: p })}
                onPageSizeChange={(size) =>
                  loadAuthor({ page: 1, pageSize: size })
                }
              />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
