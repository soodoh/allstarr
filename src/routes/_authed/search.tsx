import { Link, createFileRoute } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Search, BookOpen, Users, ExternalLink } from "lucide-react";
import { PageHeader } from "~/components/shared/page-header";
import { EmptyState } from "~/components/shared/empty-state";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Badge } from "~/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "~/components/ui/tabs";
import {
  searchHardcoverFn,
  type HardcoverSearchItem,
  type HardcoverSearchMode,
} from "~/server/search";

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
  const [results, setResults] = useState<HardcoverSearchItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchedQuery, setSearchedQuery] = useState("");
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setError("Enter at least 2 characters.");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const response = await searchHardcoverFn({
        data: {
          query: trimmed,
          type: searchType,
          limit: 20,
        },
      });
      setSearchedQuery(response.query);
      setResults(response.results);
    } catch (submitError) {
      const message =
        submitError instanceof Error
          ? submitError.message
          : "Search request failed.";
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
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
            onValueChange={(value) => setSearchType(value as HardcoverSearchMode)}
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
            <Button type="submit" disabled={loading}>
              <Search className="h-4 w-4" />
              {loading ? "Searching..." : "Search"}
            </Button>
          </form>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </CardContent>
      </Card>

      {loading ? (
        <Card>
          <CardContent className="py-8">
            <p className="text-sm text-muted-foreground">Searching Hardcover...</p>
          </CardContent>
        </Card>
      ) : searchedQuery.length === 0 ? (
        <EmptyState
          icon={Search}
          title="Start searching"
          description="Use the search bar to find books or authors from Hardcover."
        />
      ) : results.length === 0 ? (
        <EmptyState
          icon={Search}
          title="No results"
          description={`No ${searchType === "all" ? "books or authors" : searchType} found for "${searchedQuery}".`}
        />
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Showing {results.length} result{results.length === 1 ? "" : "s"} for "
            {searchedQuery}".
          </p>
          <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
            {results.map((result) => (
              <ResultCard key={`${result.type}-${result.id}`} result={result} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ResultCard({ result }: { result: HardcoverSearchItem }) {
  const ItemIcon = result.type === "book" ? BookOpen : Users;
  const authorDetailsLink =
    result.type === "author" && result.slug
      ? {
          to: "/hardcover/authors/$authorSlug" as const,
          params: { authorSlug: result.slug },
        }
      : null;

  const content = (
    <Card
      className={`py-0 overflow-hidden ${authorDetailsLink ? "hover:bg-accent/50 transition-colors" : ""}`}
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

            {authorDetailsLink ? (
              <Button asChild variant="outline" size="sm">
                <span>View Author Details</span>
              </Button>
            ) : result.hardcoverUrl ? (
              <Button asChild variant="outline" size="sm">
                <a href={result.hardcoverUrl} target="_blank" rel="noreferrer">
                  <ExternalLink className="h-4 w-4" />
                  View on Hardcover
                </a>
              </Button>
            ) : null}
          </div>
        </div>
      </CardContent>
    </Card>
  );

  if (authorDetailsLink) {
    return (
      <Link
        to={authorDetailsLink.to}
        params={authorDetailsLink.params}
        className="block"
      >
        {content}
      </Link>
    );
  }

  return content;
}
