import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import type React from "react";
import type { FormEvent, ReactNode } from "react";
import { useMutation } from "@tanstack/react-query";
import { Search, BookOpen, Users } from "lucide-react";
import PageHeader from "~/components/shared/page-header";
import EmptyState from "~/components/shared/empty-state";
import { Button } from "~/components/ui/button";
import Input from "~/components/ui/input";
import { Badge } from "~/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { searchHardcoverFn } from "~/server/search";
import type { HardcoverSearchItem, HardcoverSearchMode } from "~/server/search";
import AuthorPreviewModal from "~/components/hardcover/author-preview-modal";
import BookPreviewModal from "~/components/hardcover/book-preview-modal";

export const Route = createFileRoute("/_authed/search")({
  component: SearchPage,
});

const resultTypeConfig = {
  all: { label: "All", description: "Books + Authors" },
  books: { label: "Books", description: "Only books" },
  authors: { label: "Authors", description: "Only authors" },
} satisfies Record<HardcoverSearchMode, { label: string; description: string }>;

function SearchPage() {
  const [query, setQuery] = useState("");
  const [searchType, setSearchType] = useState<HardcoverSearchMode>("all");
  const [error, setError] = useState<string | undefined>(undefined);
  const [previewAuthor, setPreviewAuthor] = useState<
    HardcoverSearchItem | undefined
  >(undefined);
  const [previewBook, setPreviewBook] = useState<
    HardcoverSearchItem | undefined
  >(undefined);

  const searchMutation = useMutation({
    mutationFn: (params: { query: string; type: HardcoverSearchMode }) =>
      searchHardcoverFn({
        data: { query: params.query, type: params.type, limit: 20 },
      }),
    onError: (err) => {
      const message =
        err instanceof Error ? err.message : "Search request failed.";
      setError(message);
    },
  });

  const results = searchMutation.data?.results ?? [];
  const searchedQuery = searchMutation.data?.query ?? "";

  let searchResultsContent: ReactNode;
  if (searchMutation.isPending) {
    searchResultsContent = (
      <Card>
        <CardContent className="py-8">
          <p className="text-sm text-muted-foreground">
            Searching Hardcover...
          </p>
        </CardContent>
      </Card>
    );
  } else if (!searchMutation.isSuccess) {
    searchResultsContent = (
      <EmptyState
        icon={Search}
        title="Start searching"
        description="Use the search bar to find books or authors from Hardcover."
      />
    );
  } else if (results.length === 0) {
    searchResultsContent = (
      <EmptyState
        icon={Search}
        title="No results"
        description={`No ${searchType === "all" ? "books or authors" : searchType} found for "${searchedQuery}".`}
      />
    );
  } else {
    searchResultsContent = (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Showing {results.length} result{results.length === 1 ? "" : "s"} for
          &ldquo;{searchedQuery}&rdquo;.
        </p>
        <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
          {results.map((result) => (
            <ResultCard
              key={`${result.type}-${result.id}`}
              result={result}
              onAuthorClick={setPreviewAuthor}
              onBookClick={setPreviewBook}
            />
          ))}
        </div>
      </div>
    );
  }

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setError("Enter at least 2 characters.");
      return;
    }
    setError(undefined);
    searchMutation.mutate({ query: trimmed, type: searchType });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Search"
        description="Search Hardcover for books and authors."
      />

      <Card>
        <CardHeader>
          <CardTitle>Catalog Search</CardTitle>
          <CardDescription>
            Pick a result type, then search by book or author name.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Tabs
            value={searchType}
            onValueChange={(value) =>
              setSearchType(value as HardcoverSearchMode)
            }
          >
            <TabsList>
              {Object.entries(resultTypeConfig).map(([value, config]) => (
                <TabsTrigger key={value} value={value}>
                  {config.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>

          <form onSubmit={onSubmit} className="flex flex-col gap-3 sm:flex-row">
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={`Search ${resultTypeConfig[searchType].description.toLowerCase()}`}
              autoComplete="off"
              aria-label="Search query"
            />
            <Button type="submit" disabled={searchMutation.isPending}>
              <Search className="h-4 w-4" />
              {searchMutation.isPending ? "Searching..." : "Search"}
            </Button>
          </form>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </CardContent>
      </Card>

      {searchResultsContent}

      {previewAuthor && (
        <AuthorPreviewModal
          author={previewAuthor}
          open={Boolean(previewAuthor)}
          onOpenChange={(open) => {
            if (!open) {
              setPreviewAuthor(undefined);
            }
          }}
        />
      )}

      {previewBook && (
        <BookPreviewModal
          book={previewBook}
          open={Boolean(previewBook)}
          onOpenChange={(open) => {
            if (!open) {
              setPreviewBook(undefined);
            }
          }}
        />
      )}
    </div>
  );
}

function ResultCard({
  result,
  onAuthorClick,
  onBookClick,
}: {
  result: HardcoverSearchItem;
  onAuthorClick: (author: HardcoverSearchItem) => void;
  onBookClick: (book: HardcoverSearchItem) => void;
}) {
  const ItemIcon = result.type === "book" ? BookOpen : Users;
  const isAuthor = result.type === "author" && Boolean(result.slug);
  const isBook = result.type === "book";
  const isClickable = isAuthor || isBook;

  let actionButton: React.ReactNode = null;
  if (isAuthor) {
    actionButton = (
      <Button variant="outline" size="sm">
        View Author Details
      </Button>
    );
  } else if (isBook) {
    actionButton = (
      <Button variant="outline" size="sm">
        View Book Details
      </Button>
    );
  }

  const content = (
    <Card
      className={`py-0 overflow-hidden${isClickable ? " hover:bg-accent/50 transition-colors cursor-pointer" : ""}`}
    >
      <CardContent className="p-4">
        <div className="flex gap-4">
          <div className="h-24 w-16 shrink-0 overflow-hidden rounded border border-border bg-muted">
            {result.coverUrl ? (
              <img
                src={result.coverUrl}
                alt={`${result.title} cover`}
                className="h-full w-full object-cover"
                loading="lazy"
              />
            ) : (
              <div className="flex h-full items-center justify-center text-muted-foreground">
                <ItemIcon className="h-5 w-5" />
              </div>
            )}
          </div>

          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={result.type === "book" ? "secondary" : "outline"}>
                {result.type === "book" ? "Book" : "Author"}
              </Badge>
              {result.releaseYear && (
                <Badge variant="ghost">{result.releaseYear}</Badge>
              )}
            </div>

            <h3 className="font-semibold leading-tight">{result.title}</h3>
            {result.subtitle && (
              <p className="text-sm text-muted-foreground">{result.subtitle}</p>
            )}
            {result.description && (
              <p className="text-sm text-muted-foreground leading-relaxed line-clamp-3">
                {result.description}
              </p>
            )}

            {actionButton}
          </div>
        </div>
      </CardContent>
    </Card>
  );

  if (isAuthor) {
    return (
      <button
        type="button"
        className="block w-full text-left"
        onClick={() => onAuthorClick(result)}
      >
        {content}
      </button>
    );
  }

  if (isBook) {
    return (
      <button
        type="button"
        className="block w-full text-left"
        onClick={() => onBookClick(result)}
      >
        {content}
      </button>
    );
  }

  return content;
}
