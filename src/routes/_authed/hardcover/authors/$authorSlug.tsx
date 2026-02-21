import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronsUpDown,
  ExternalLink,
  Search,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "~/components/shared/page-header";
import { HardcoverAuthorSkeleton } from "~/components/shared/loading-skeleton";
import { Skeleton } from "~/components/ui/skeleton";
import { AuthorPhoto } from "~/components/authors/author-photo";
import { TablePagination } from "~/components/shared/table-pagination";
import { Button } from "~/components/ui/button";
import { Badge } from "~/components/ui/badge";
import { Input } from "~/components/ui/input";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import {
  getHardcoverAuthorFn,
  getHardcoverAuthorSeriesFn,
  getHardcoverSeriesBooksFn,
  type HardcoverAuthorBook,
  type HardcoverAuthorSeries,
  type HardcoverSeriesBook,
} from "~/server/search";

const DEFAULT_LANGUAGE = "en";
const DEFAULT_PAGE_SIZE = 25;
const SERIES_PAGE_SIZE = 25;
const SEARCH_ALL_PAGE_SIZE = 500;
const SEARCH_DEBOUNCE_MS = 300;

function groupBooksByLanguage(books: HardcoverAuthorBook[]) {
  const groups = new Map<
    string,
    { key: string; label: string; books: HardcoverAuthorBook[] }
  >();
  for (const book of books) {
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
        sortBy: "year",
        sortDir: "desc",
      },
    }),
  component: HardcoverAuthorPage,
  pendingComponent: HardcoverAuthorSkeleton,
});

// ---------- Books tab ----------

function BooksTab({
  authorSlug,
  author,
  setAuthor,
  onLanguageChange,
}: {
  authorSlug: string;
  author: Awaited<ReturnType<typeof getHardcoverAuthorFn>>;
  setAuthor: (a: typeof author) => void;
  onLanguageChange: (language: string) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [optimisticPage, setOptimisticPage] = useState(author.page);
  const [optimisticPageSize, setOptimisticPageSize] = useState(author.pageSize);

  // Search state
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [allBooks, setAllBooks] = useState<HardcoverAuthorBook[] | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchPage, setSearchPage] = useState(1);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fetchingRef = useRef(false);

  const isSearching = searchQuery !== "";

  const displayPage = isSearching ? searchPage : (loading ? optimisticPage : author.page);
  const displayPageSize = loading ? optimisticPageSize : author.pageSize;

  // Filtered + paginated books when in search mode
  const filteredBooks = useMemo(() => {
    if (!isSearching || !allBooks) return null;
    const q = searchQuery.toLowerCase();
    return allBooks.filter((b) => b.title.toLowerCase().includes(q));
  }, [allBooks, isSearching, searchQuery]);

  const searchTotalBooks = filteredBooks?.length ?? 0;
  const searchTotalPages = Math.max(1, Math.ceil(searchTotalBooks / DEFAULT_PAGE_SIZE));
  const searchPagedBooks = useMemo(() => {
    if (!filteredBooks) return [];
    const start = (searchPage - 1) * DEFAULT_PAGE_SIZE;
    return filteredBooks.slice(start, start + DEFAULT_PAGE_SIZE);
  }, [filteredBooks, searchPage]);

  // Groups for display — either search results or normal server page
  const displayBooks = isSearching ? searchPagedBooks : author.books;
  const languageGroups = groupBooksByLanguage(displayBooks);

  // Fetch all books for search mode
  const fetchAllBooks = async (lang: string) => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    setSearchLoading(true);
    setAllBooks(null);
    try {
      const data = await getHardcoverAuthorFn({
        data: {
          slug: authorSlug,
          page: 1,
          pageSize: SEARCH_ALL_PAGE_SIZE,
          language: lang,
          sortBy: author.sortBy,
          sortDir: author.sortDir,
        },
      });
      setAllBooks(data.books);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to search books.");
      setSearchInput("");
      setSearchQuery("");
    } finally {
      setSearchLoading(false);
      fetchingRef.current = false;
    }
  };

  // Debounced search input handler
  const handleSearchChange = (value: string) => {
    setSearchInput(value);
    setSearchPage(1);
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (value.trim() === "") {
      setSearchQuery("");
      setAllBooks(null);
      fetchingRef.current = false;
      return;
    }

    debounceRef.current = setTimeout(() => {
      setSearchQuery(value.trim());
      // Only fetch all books if we don't have them cached
      setAllBooks((prev) => {
        if (prev === null) fetchAllBooks(author.selectedLanguage);
        return prev;
      });
    }, SEARCH_DEBOUNCE_MS);
  };

  const clearSearch = () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setSearchInput("");
    setSearchQuery("");
    setAllBooks(null);
    setSearchPage(1);
  };

  // Clear search cache when language changes
  const handleSort = (key: "title" | "year" | "rating") => {
    const newDir =
      author.sortBy === key
        ? author.sortDir === "asc" ? "desc" : "asc"
        : "asc";
    loadAuthor({ sortBy: key, sortDir: newDir, page: 1 });
  };

  const loadAuthor = async (next: {
    page?: number;
    language?: string;
    pageSize?: number;
    sortBy?: "title" | "year" | "rating";
    sortDir?: "asc" | "desc";
  }) => {
    const page = next.page ?? author.page;
    const language = next.language ?? author.selectedLanguage;
    const pageSize = next.pageSize ?? author.pageSize;
    const sortBy = next.sortBy ?? author.sortBy;
    const sortDir = next.sortDir ?? author.sortDir;
    if (next.page !== undefined) setOptimisticPage(next.page);
    if (next.pageSize !== undefined) setOptimisticPageSize(next.pageSize);
    // Invalidate search cache when language or sort changes
    if (next.language !== undefined || next.sortBy !== undefined || next.sortDir !== undefined) {
      fetchingRef.current = false;
      setAllBooks(null);
      if (isSearching) fetchAllBooks(language);
    }
    setLoading(true);
    try {
      const data = await getHardcoverAuthorFn({
        data: { slug: authorSlug, page, pageSize, language, sortBy, sortDir },
      });
      setAuthor(data);
      if (next.language !== undefined) onLanguageChange(next.language);
    } catch (error) {
      setOptimisticPage(author.page);
      setOptimisticPageSize(author.pageSize);
      toast.error(error instanceof Error ? error.message : "Failed to load author data.");
    } finally {
      setLoading(false);
    }
  };

  const totalItems = isSearching ? searchTotalBooks : author.totalBooks;
  const totalPages = isSearching ? searchTotalPages : author.totalPages;
  const isLoadingDisplay = isSearching ? searchLoading : loading;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {/* Search bar */}
        <div className="relative w-full sm:max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <Input
            className="pl-8 pr-8 h-9 text-sm"
            placeholder="Filter books…"
            value={searchInput}
            onChange={(e) => handleSearchChange(e.target.value)}
          />
          {searchInput && (
            <button
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              onClick={clearSearch}
              aria-label="Clear search"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Language</span>
          <Select
            value={author.selectedLanguage}
            onValueChange={(value) => {
              clearSearch();
              loadAuthor({ language: value, page: 1 });
            }}
            disabled={loading}
          >
            <SelectTrigger className="w-full sm:w-[220px]">
              <SelectValue placeholder="Select language" />
            </SelectTrigger>
            <SelectContent>
              {author.languages.map((lang) => (
                <SelectItem key={lang.code} value={lang.code}>
                  {lang.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {totalItems > 0 && (
        <TablePagination
          page={displayPage}
          pageSize={displayPageSize}
          totalItems={totalItems}
          totalPages={totalPages}
          onPageChange={(p) => isSearching ? setSearchPage(p) : loadAuthor({ page: p })}
          onPageSizeChange={(size) => loadAuthor({ page: 1, pageSize: size })}
        />
      )}

      <Table>
        <TableHeader>
          <TableRow>
            {(
              [
                { key: "title", label: "Title" },
                { key: "year", label: "Year" },
              ] as { key: "title" | "year" | "rating"; label: string }[]
            ).map(({ key, label }) => (
              <TableHead
                key={key}
                className="cursor-pointer select-none hover:text-foreground"
                onClick={() => !loading && handleSort(key)}
              >
                {label}
                {author.sortBy !== key ? (
                  <ChevronsUpDown className="ml-1 h-3.5 w-3.5 text-muted-foreground/50 inline" />
                ) : author.sortDir === "asc" ? (
                  <ChevronUp className="ml-1 h-3.5 w-3.5 inline" />
                ) : (
                  <ChevronDown className="ml-1 h-3.5 w-3.5 inline" />
                )}
              </TableHead>
            ))}
            <TableHead>Role</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoadingDisplay ? (
            Array.from({ length: displayPageSize }).map((_, i) => (
              <TableRow key={i}>
                <TableCell><Skeleton className="h-4 w-[55%]" /></TableCell>
                <TableCell><Skeleton className="h-4 w-10" /></TableCell>
                <TableCell><Skeleton className="h-5 w-20 rounded-full" /></TableCell>
              </TableRow>
            ))
          ) : isSearching && filteredBooks?.length === 0 ? (
            <TableRow>
              <TableCell colSpan={3} className="text-sm text-muted-foreground">
                No books match &ldquo;{searchQuery}&rdquo;.
              </TableCell>
            </TableRow>
          ) : !isSearching && author.books.length === 0 ? (
            <TableRow>
              <TableCell colSpan={3} className="text-sm text-muted-foreground">
                No books found for the selected language filter.
              </TableCell>
            </TableRow>
          ) : (
            languageGroups.map((group) => (
              <Fragment key={group.key}>
                {author.selectedLanguage === "all" && (
                  <TableRow>
                    <TableCell
                      colSpan={3}
                      className="bg-muted/40 font-medium text-muted-foreground"
                    >
                      {group.label}
                    </TableCell>
                  </TableRow>
                )}
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
                        (book.releaseDate ? book.releaseDate.slice(0, 4) : "Unknown")}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {book.contribution || "Contributor"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </Fragment>
            ))
          )}
        </TableBody>
      </Table>

      {totalItems > 0 && (
        <TablePagination
          page={displayPage}
          pageSize={displayPageSize}
          totalItems={totalItems}
          totalPages={totalPages}
          onPageChange={(p) => isSearching ? setSearchPage(p) : loadAuthor({ page: p })}
          onPageSizeChange={(size) => loadAuthor({ page: 1, pageSize: size })}
        />
      )}
    </div>
  );
}

// ---------- Series tab ----------

const SERIES_BOOKS_PAGE_SIZE = 10;

function SeriesRow({ series, language }: { series: HardcoverAuthorSeries; language: string }) {
  const [expanded, setExpanded] = useState(false);
  const [books, setBooks] = useState<HardcoverSeriesBook[] | null>(null);
  const [loadingBooks, setLoadingBooks] = useState(false);
  const [visibleCount, setVisibleCount] = useState(SERIES_BOOKS_PAGE_SIZE);

  // When language changes, collapse and clear cached books
  useEffect(() => {
    setExpanded(false);
    setBooks(null);
    setVisibleCount(SERIES_BOOKS_PAGE_SIZE);
  }, [language]);

  const handleToggle = async () => {
    if (!expanded && books === null) {
      setLoadingBooks(true);
      try {
        const result = await getHardcoverSeriesBooksFn({
          data: { seriesId: Number(series.id), language },
        });
        setBooks(result.books);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to load series books.");
        return;
      } finally {
        setLoadingBooks(false);
      }
    }
    setExpanded((v) => !v);
  };

  const visibleBooks = books?.slice(0, visibleCount) ?? [];
  const hasMore = books !== null && visibleCount < books.length;

  return (
    <Fragment>
      <TableRow
        className="cursor-pointer hover:bg-muted/50"
        onClick={handleToggle}
      >
        <TableCell>
          <div className="flex items-center gap-2">
            {loadingBooks ? (
              <Skeleton className="h-4 w-4 shrink-0 rounded" />
            ) : expanded ? (
              <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
            )}
            <span className="font-medium">{series.name}</span>
          </div>
        </TableCell>
        <TableCell>{series.booksCount}</TableCell>
        <TableCell>
          {series.isCompleted === true ? (
            <Badge variant="outline">Completed</Badge>
          ) : series.isCompleted === false ? (
            <Badge variant="outline">Ongoing</Badge>
          ) : (
            <span className="text-muted-foreground text-sm">—</span>
          )}
        </TableCell>
      </TableRow>

      {expanded && books !== null && (
        <>
          {books.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={3}
                className="pl-10 text-sm text-muted-foreground bg-muted/20"
              >
                No books found in this series.
              </TableCell>
            </TableRow>
          ) : (
            <>
              {visibleBooks.map((book) => (
                <TableRow key={book.id} className="bg-muted/20 hover:bg-muted/30">
                  <TableCell className="pl-10">
                    <div className="flex items-baseline gap-2">
                      {book.position !== null && (
                        <span className="text-xs text-muted-foreground tabular-nums w-6 shrink-0">
                          {book.position}
                        </span>
                      )}
                      {book.hardcoverUrl ? (
                        <a
                          href={book.hardcoverUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="hover:underline"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {book.title}
                        </a>
                      ) : (
                        <span>{book.title}</span>
                      )}
                      {book.isCompilation && (
                        <Badge variant="secondary" className="text-xs shrink-0">
                          Boxed Set
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {book.releaseYear ?? "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {book.rating !== null ? book.rating.toFixed(2) : "—"}
                  </TableCell>
                </TableRow>
              ))}
              {hasMore && (
                <TableRow className="bg-muted/20">
                  <TableCell colSpan={3} className="pl-10 py-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        setVisibleCount((c) => c + SERIES_BOOKS_PAGE_SIZE);
                      }}
                    >
                      Load more ({books.length - visibleCount} remaining)
                    </Button>
                  </TableCell>
                </TableRow>
              )}
            </>
          )}
        </>
      )}
    </Fragment>
  );
}

function SeriesTab({
  authorSlug,
  active,
  language,
  languages,
}: {
  authorSlug: string;
  active: boolean;
  language: string;
  languages: { code: string; name: string }[];
}) {
  const [allSeries, setAllSeries] = useState<HardcoverAuthorSeries[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedLanguage, setSelectedLanguage] = useState(language);
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState("");

  // Sync language prop → local state (when Books tab language changes)
  useEffect(() => {
    setSelectedLanguage(language);
  }, [language]);

  const loadSeries = (lang: string) => {
    setLoading(true);
    setAllSeries(null);
    setPage(1);
    setSearchInput("");
    getHardcoverAuthorSeriesFn({ data: { slug: authorSlug, language: lang } })
      .then((data) => { setAllSeries(data); })
      .catch((error) => {
        toast.error(error instanceof Error ? error.message : "Failed to load series.");
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (!active) return;
    loadSeries(selectedLanguage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, selectedLanguage, authorSlug]);

  // Client-side search filter
  const filteredSeries = useMemo(() => {
    if (!allSeries) return [];
    const q = searchInput.trim().toLowerCase();
    if (!q) return allSeries;
    return allSeries.filter((s) => s.name.toLowerCase().includes(q));
  }, [allSeries, searchInput]);

  const totalSeries = filteredSeries.length;
  const totalPages = Math.max(1, Math.ceil(totalSeries / SERIES_PAGE_SIZE));

  // Reset to page 1 when search changes
  useEffect(() => {
    setPage(1);
  }, [searchInput]);

  const pagedSeries = useMemo(() => {
    const start = (page - 1) * SERIES_PAGE_SIZE;
    return filteredSeries.slice(start, start + SERIES_PAGE_SIZE);
  }, [filteredSeries, page]);

  const loaded = !loading && allSeries !== null;

  const SeriesPagination = () =>
    totalSeries > SERIES_PAGE_SIZE ? (
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">
          Showing {(page - 1) * SERIES_PAGE_SIZE + 1}–
          {Math.min(page * SERIES_PAGE_SIZE, totalSeries)} of {totalSeries}
        </span>
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon-sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
            aria-label="Previous page"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="px-2">
            {page} / {totalPages}
          </span>
          <Button
            variant="outline"
            size="icon-sm"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
            aria-label="Next page"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    ) : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {/* Search bar */}
        <div className="relative w-full sm:max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <Input
            className="pl-8 pr-8 h-9 text-sm"
            placeholder="Filter series…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            disabled={loading}
          />
          {searchInput && (
            <button
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              onClick={() => setSearchInput("")}
              aria-label="Clear search"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Language</span>
          <Select
            value={selectedLanguage}
            onValueChange={(value) => {
              setSelectedLanguage(value);
            }}
            disabled={loading}
          >
            <SelectTrigger className="w-full sm:w-[220px]">
              <SelectValue placeholder="Select language" />
            </SelectTrigger>
            <SelectContent>
              {languages.map((lang) => (
                <SelectItem key={lang.code} value={lang.code}>
                  {lang.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {loaded && <SeriesPagination />}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Series</TableHead>
            <TableHead>Books</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
            Array.from({ length: 10 }).map((_, i) => (
              <TableRow key={i}>
                <TableCell><Skeleton className="h-4 w-48" /></TableCell>
                <TableCell><Skeleton className="h-4 w-10" /></TableCell>
                <TableCell><Skeleton className="h-5 w-20 rounded-full" /></TableCell>
              </TableRow>
            ))
          ) : loaded && filteredSeries.length === 0 ? (
            <TableRow>
              <TableCell colSpan={3} className="text-sm text-muted-foreground">
                {searchInput.trim()
                  ? `No series match "${searchInput.trim()}".`
                  : "No series found for the selected language."}
              </TableCell>
            </TableRow>
          ) : (
            pagedSeries.map((s) => <SeriesRow key={s.id} series={s} language={selectedLanguage} />)
          )}
        </TableBody>
      </Table>

      {loaded && <SeriesPagination />}
    </div>
  );
}

// ---------- Page ----------

function HardcoverAuthorPage() {
  const params = Route.useParams();
  const initialAuthor = Route.useLoaderData();
  const [author, setAuthor] = useState(initialAuthor);
  const [activeTab, setActiveTab] = useState<"books" | "series">("books");
  const [selectedLanguage, setSelectedLanguage] = useState(initialAuthor.selectedLanguage);

  const lifespan =
    author.bornYear || author.deathYear
      ? `${author.bornYear || "?"}-${author.deathYear || "Present"}`
      : null;

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
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">Total books</span>
                <span>{author.booksCount ?? author.totalBooks}</span>
              </div>
              {author.selectedLanguage !== "all" && (
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">
                    In{" "}
                    {author.languages.find((l) => l.code === author.selectedLanguage)?.name ??
                      author.selectedLanguage}
                  </span>
                  <span>{author.totalBooks}</span>
                </div>
              )}
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
                <p className="text-sm text-muted-foreground whitespace-pre-wrap max-h-48 overflow-y-auto">
                  {author.bio}
                </p>
              </CardContent>
            </Card>
          )}
        </div>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "books" | "series")}>
          <Card>
            <CardHeader className="pb-0">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <CardTitle>Library</CardTitle>
                  <CardDescription className="mt-1">
                    {author.totalBooks} book{author.totalBooks === 1 ? "" : "s"}
                  </CardDescription>
                </div>
                <TabsList>
                  <TabsTrigger value="books">Books</TabsTrigger>
                  <TabsTrigger value="series">Series</TabsTrigger>
                </TabsList>
              </div>
            </CardHeader>
            <CardContent className="pt-4">
              <TabsContent value="books" className="mt-0">
                <BooksTab
                  authorSlug={params.authorSlug}
                  author={author}
                  setAuthor={setAuthor}
                  onLanguageChange={setSelectedLanguage}
                />
              </TabsContent>
              <TabsContent value="series" className="mt-0">
                <SeriesTab
                  authorSlug={params.authorSlug}
                  active={activeTab === "series"}
                  language={selectedLanguage}
                  languages={author.languages}
                />
              </TabsContent>
            </CardContent>
          </Card>
        </Tabs>
      </div>
    </div>
  );
}
