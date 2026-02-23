// oxlint-disable react/no-array-index-key -- Skeleton rows in this file have no meaningful identity
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import type React from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronsUpDown,
  ExternalLink,
  Library,
  Plus,
  Search,
  X,
} from "lucide-react";
import { toast } from "sonner";
import PageHeader from "~/components/shared/page-header";
import { HardcoverAuthorSkeleton } from "~/components/shared/loading-skeleton";
import Skeleton from "~/components/ui/skeleton";
import AuthorPhoto from "~/components/authors/author-photo";
import TablePagination from "~/components/shared/table-pagination";
import { Button } from "~/components/ui/button";
import { Badge } from "~/components/ui/badge";
import Input from "~/components/ui/input";
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
import { getHardcoverAuthorFn, getHardcoverAuthorSeriesFn, getHardcoverSeriesBooksFn } from '~/server/search';
import type { HardcoverAuthorBook, HardcoverAuthorSeries, HardcoverSeriesBook } from '~/server/search';
import { checkAuthorExistsFn } from "~/server/authors";
import { checkBooksExistFn } from "~/server/books";
import { getQualityProfilesFn } from "~/server/quality-profiles";
import { getRootFoldersFn } from "~/server/root-folders";
import AddAuthorDialog from "~/components/hardcover/add-author-dialog";
import { BookMonitorToggle, SeriesBookMonitorToggle } from '~/components/hardcover/add-book-button';
import type { AuthorContext } from '~/components/hardcover/add-book-button';

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
  return [...groups.values()];
}

export const Route = createFileRoute("/_authed/hardcover/authors/$authorSlug")({
  loader: async ({ params }) => {
    const [authorData, qualityProfiles, rootFolders] = await Promise.all([
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
      getQualityProfilesFn(),
      getRootFoldersFn(),
    ]);

    const localAuthor = await checkAuthorExistsFn({
      data: { foreignAuthorId: authorData.id },
    });

    return { authorData, qualityProfiles, rootFolders, localAuthor };
  },
  component: HardcoverAuthorPage,
  pendingComponent: HardcoverAuthorSkeleton,
});

// ---------- Books tab ----------

function BooksTab({
  authorSlug,
  author,
  setAuthor,
  onLanguageChange,
  authorContext,
  localAuthorId,
  existingBookIds,
  onBookAdded,
  onAuthorCreated,
}: {
  authorSlug: string;
  author: Awaited<ReturnType<typeof getHardcoverAuthorFn>>;
  setAuthor: (a: typeof author) => void;
  onLanguageChange: (language: string) => void;
  authorContext: AuthorContext;
  localAuthorId: number | undefined;
  existingBookIds: Set<string>;
  onBookAdded: (foreignBookId: string) => void;
  onAuthorCreated: (id: number) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [optimisticPage, setOptimisticPage] = useState(author.page);
  const [optimisticPageSize, setOptimisticPageSize] = useState(author.pageSize);

  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [allBooks, setAllBooks] = useState<HardcoverAuthorBook[] | undefined>(undefined);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchPage, setSearchPage] = useState(1);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const fetchingRef = useRef(false);

  const isSearching = searchQuery !== "";

  let displayPage: number;
  if (isSearching) {
    displayPage = searchPage;
  } else {
    displayPage = loading ? optimisticPage : author.page;
  }
  const displayPageSize = loading ? optimisticPageSize : author.pageSize;

  const filteredBooks = useMemo(() => {
    if (!isSearching || !allBooks) {return null;}
    const q = searchQuery.toLowerCase();
    return allBooks.filter((b) => b.title.toLowerCase().includes(q));
  }, [allBooks, isSearching, searchQuery]);

  const searchTotalBooks = filteredBooks?.length ?? 0;
  const searchTotalPages = Math.max(1, Math.ceil(searchTotalBooks / DEFAULT_PAGE_SIZE));
  const searchPagedBooks = useMemo(() => {
    if (!filteredBooks) {return [];}
    const start = (searchPage - 1) * DEFAULT_PAGE_SIZE;
    return filteredBooks.slice(start, start + DEFAULT_PAGE_SIZE);
  }, [filteredBooks, searchPage]);

  const displayBooks = isSearching ? searchPagedBooks : author.books;
  const languageGroups = groupBooksByLanguage(displayBooks);

  const fetchAllBooks = async (lang: string) => {
    if (fetchingRef.current) {return;}
    fetchingRef.current = true;
    setSearchLoading(true);
    setAllBooks(undefined);
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

  const handleSearchChange = (value: string) => {
    setSearchInput(value);
    setSearchPage(1);
    if (debounceRef.current) {clearTimeout(debounceRef.current);}

    if (value.trim() === "") {
      setSearchQuery("");
      setAllBooks(undefined);
      fetchingRef.current = false;
      return;
    }

    debounceRef.current = setTimeout(() => {
      setSearchQuery(value.trim());
      setAllBooks((prev) => {
        if (prev === undefined) {fetchAllBooks(author.selectedLanguage);}
        return prev;
      });
    }, SEARCH_DEBOUNCE_MS);
  };

  const clearSearch = () => {
    if (debounceRef.current) {clearTimeout(debounceRef.current);}
    setSearchInput("");
    setSearchQuery("");
    setAllBooks(undefined);
    setSearchPage(1);
  };

  const handleSort = (key: "title" | "year" | "rating") => {
    let newDir: "asc" | "desc";
    if (author.sortBy === key) {
      newDir = author.sortDir === "asc" ? "desc" : "asc";
    } else {
      newDir = "asc";
    }
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
    if (next.page !== undefined) {setOptimisticPage(next.page);}
    if (next.pageSize !== undefined) {setOptimisticPageSize(next.pageSize);}
    if (next.language !== undefined || next.sortBy !== undefined || next.sortDir !== undefined) {
      fetchingRef.current = false;
      setAllBooks(undefined);
      if (isSearching) {fetchAllBooks(language);}
    }
    setLoading(true);
    try {
      const data = await getHardcoverAuthorFn({
        data: { slug: authorSlug, page, pageSize, language, sortBy, sortDir },
      });
      setAuthor(data);
      if (next.language !== undefined) {onLanguageChange(next.language);}
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

  // toggle column + title + year = 3 columns always
  const colCount = 3;

  let booksTableBody: React.ReactNode;
  if (isLoadingDisplay) {
    // oxlint-disable-next-line react/no-array-index-key -- Skeleton rows have no meaningful identity
    booksTableBody = Array.from({ length: displayPageSize }).map((_, i) => (
      <TableRow key={i}>
        <TableCell><Skeleton className="h-6 w-6 rounded" /></TableCell>
        <TableCell><Skeleton className="h-4 w-[55%]" /></TableCell>
        <TableCell><Skeleton className="h-4 w-10" /></TableCell>
        <TableCell><Skeleton className="h-5 w-20 rounded-full" /></TableCell>
      </TableRow>
    ));
  } else if (isSearching && filteredBooks?.length === 0) {
    booksTableBody = (
      <TableRow>
        <TableCell colSpan={colCount} className="text-sm text-muted-foreground">
          No books match &ldquo;{searchQuery}&rdquo;.
        </TableCell>
      </TableRow>
    );
  } else if (!isSearching && author.books.length === 0) {
    booksTableBody = (
      <TableRow>
        <TableCell colSpan={colCount} className="text-sm text-muted-foreground">
          No books found for the selected language filter.
        </TableCell>
      </TableRow>
    );
  } else {
    booksTableBody = languageGroups.map((group) => (
      <Fragment key={group.key}>
        {author.selectedLanguage === "all" && (
          <TableRow>
            <TableCell
              colSpan={colCount}
              className="bg-muted/40 font-medium text-muted-foreground"
            >
              {group.label}
            </TableCell>
          </TableRow>
        )}
        {group.books.map((book) => (
          <TableRow key={`${group.key}-${book.id}`}>
            <TableCell>
              <BookMonitorToggle
                book={book}
                authorContext={authorContext}
                localAuthorId={localAuthorId}
                inLibrary={existingBookIds.has(book.id)}
                onAdded={onBookAdded}
                onAuthorCreated={onAuthorCreated}
              />
            </TableCell>
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

          </TableRow>
        ))}
      </Fragment>
    ));
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
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
              type="button"
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
            {/* Toggle column — always present */}
            <TableHead className="w-10" />
            {(
              [
                { key: "title", label: "Title" },
                { key: "year", label: "Year" },
              ] as Array<{ key: "title" | "year" | "rating"; label: string }>
            ).map(({ key, label }) => {
              let SortIcon = ChevronsUpDown;
              if (author.sortBy === key) {
                SortIcon = author.sortDir === "asc" ? ChevronUp : ChevronDown;
              }
              return (
              <TableHead
                key={key}
                className="cursor-pointer select-none hover:text-foreground"
                onClick={() => !loading && handleSort(key)}
              >
                {label}
                <SortIcon className="ml-1 h-3.5 w-3.5 text-muted-foreground/50 inline" />
              </TableHead>
              );
            })}

          </TableRow>
        </TableHeader>
        <TableBody>
          {booksTableBody}
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

function SeriesRow({
  series,
  language,
  authorContext,
  localAuthorId,
  existingBookIds,
  onBookAdded,
  onAuthorCreated,
}: {
  series: HardcoverAuthorSeries;
  language: string;
  authorContext: AuthorContext;
  localAuthorId: number | undefined;
  existingBookIds: Set<string>;
  onBookAdded: (foreignBookId: string) => void;
  onAuthorCreated: (id: number) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [books, setBooks] = useState<HardcoverSeriesBook[] | undefined>(undefined);
  const [loadingBooks, setLoadingBooks] = useState(false);
  const [visibleCount, setVisibleCount] = useState(SERIES_BOOKS_PAGE_SIZE);

  useEffect(() => {
    setExpanded(false);
    setBooks(undefined);
    setVisibleCount(SERIES_BOOKS_PAGE_SIZE);
  }, [language]);

  const handleToggle = async () => {
    if (!expanded && books === undefined) {
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
  const hasMore = books !== undefined && visibleCount < books.length;

  let SeriesExpandIcon: typeof ChevronUp | typeof ChevronDown | typeof Skeleton;
  if (loadingBooks) {
    SeriesExpandIcon = Skeleton;
  } else if (expanded) {
    SeriesExpandIcon = ChevronUp;
  } else {
    SeriesExpandIcon = ChevronDown;
  }

  // toggle + series name + book count = 3 columns always
  const seriesColCount = 3;
  // expanded sub-table: toggle + title + author + year = 4 columns
  const bookColCount = 4;

  return (
    <>
      <TableRow
        className="cursor-pointer hover:bg-muted/50"
        onClick={handleToggle}
      >
        {/* Spacer to align with toggle column in expanded book rows */}
        <TableCell className="w-10" />
        <TableCell>
          <div className="flex items-center gap-2">
            <SeriesExpandIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="font-medium">{series.name}</span>
          </div>
        </TableCell>
        <TableCell>{series.booksCount}</TableCell>
      </TableRow>

      {expanded && books !== undefined && (
        books.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={seriesColCount}
                className="pl-10 text-sm text-muted-foreground bg-muted/20"
              >
                No books found in this series.
              </TableCell>
            </TableRow>
          ) : (
            <>
              <TableRow className="bg-muted/30 hover:bg-muted/30">
                <TableHead className="w-10" />
                <TableHead className="pl-4">Title</TableHead>
                <TableHead>Author</TableHead>
                <TableHead>Year</TableHead>
              </TableRow>
              {visibleBooks.map((book) => (
                <TableRow key={book.id} className="bg-muted/20 hover:bg-muted/30">
                  <TableCell className="w-10">
                    <SeriesBookMonitorToggle
                      bookId={book.id}
                      title={book.title}
                      coverUrl={book.coverUrl}
                      releaseYear={book.releaseYear}
                      rating={book.rating}
                      authorContext={authorContext}
                      localAuthorId={localAuthorId}
                      inLibrary={existingBookIds.has(book.id)}
                      onAdded={onBookAdded}
                      onAuthorCreated={onAuthorCreated}
                    />
                  </TableCell>
                  <TableCell className="pl-4">
                    <div className="flex items-baseline gap-2">
                      {book.position !== undefined && (
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
                    {book.authorName ?? "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {book.releaseYear ?? "—"}
                  </TableCell>
                </TableRow>
              ))}
              {hasMore && (
                <TableRow className="bg-muted/20">
                  <TableCell colSpan={bookColCount} className="pl-10 py-2">
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
          )
      )}
    </>
  );
}

function SeriesTab({
  authorSlug,
  active,
  language,
  languages,
  authorContext,
  localAuthorId,
  existingBookIds,
  onBookAdded,
  onAuthorCreated,
}: {
  authorSlug: string;
  active: boolean;
  language: string;
  languages: Array<{ code: string; name: string }>;
  authorContext: AuthorContext;
  localAuthorId: number | undefined;
  existingBookIds: Set<string>;
  onBookAdded: (foreignBookId: string) => void;
  onAuthorCreated: (id: number) => void;
}) {
  const [allSeries, setAllSeries] = useState<HardcoverAuthorSeries[] | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [selectedLanguage, setSelectedLanguage] = useState(language);
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState("");

  useEffect(() => {
    setSelectedLanguage(language);
  }, [language]);

  const loadSeries = async (lang: string) => {
    setLoading(true);
    setAllSeries(undefined);
    setPage(1);
    setSearchInput("");
    try {
      const data = await getHardcoverAuthorSeriesFn({ data: { slug: authorSlug, language: lang } });
      setAllSeries(data);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load series.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!active) {return;}
    loadSeries(selectedLanguage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, selectedLanguage, authorSlug]);

  const filteredSeries = useMemo(() => {
    if (!allSeries) {return [];}
    const q = searchInput.trim().toLowerCase();
    if (!q) {return allSeries;}
    return allSeries.filter((s) => s.name.toLowerCase().includes(q));
  }, [allSeries, searchInput]);

  const totalSeries = filteredSeries.length;
  const totalPages = Math.max(1, Math.ceil(totalSeries / SERIES_PAGE_SIZE));

  useEffect(() => {
    setPage(1);
  }, [searchInput]);

  const pagedSeries = useMemo(() => {
    const start = (page - 1) * SERIES_PAGE_SIZE;
    return filteredSeries.slice(start, start + SERIES_PAGE_SIZE);
  }, [filteredSeries, page]);

  const loaded = !loading && allSeries !== undefined;

  // toggle + series + books = 3 columns always
  const colCount = 3;

  let seriesTableBody: React.ReactNode;
  if (loading) {
    // oxlint-disable-next-line react/no-array-index-key -- Skeleton rows have no meaningful identity
    seriesTableBody = Array.from({ length: 10 }).map((_, i) => (
      <TableRow key={i}>
        <TableCell><Skeleton className="h-6 w-6 rounded" /></TableCell>
        <TableCell><Skeleton className="h-4 w-48" /></TableCell>
        <TableCell><Skeleton className="h-4 w-10" /></TableCell>
      </TableRow>
    ));
  } else if (loaded && filteredSeries.length === 0) {
    seriesTableBody = (
      <TableRow>
        <TableCell colSpan={colCount} className="text-sm text-muted-foreground">
          {searchInput.trim()
            ? `No series match "${searchInput.trim()}".`
            : "No series found for the selected language."}
        </TableCell>
      </TableRow>
    );
  } else {
    seriesTableBody = pagedSeries.map((s) => (
      <SeriesRow
        key={s.id}
        series={s}
        language={selectedLanguage}
        authorContext={authorContext}
        localAuthorId={localAuthorId}
        existingBookIds={existingBookIds}
        onBookAdded={onBookAdded}
        onAuthorCreated={onAuthorCreated}
      />
    ));
  }

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
              type="button"
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
            {/* Toggle column — always present */}
            <TableHead className="w-10" />
            <TableHead>Series</TableHead>
            <TableHead>Books</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {seriesTableBody}
        </TableBody>
      </Table>

      {loaded && <SeriesPagination />}
    </div>
  );
}

// ---------- Page ----------

// oxlint-disable-next-line complexity -- Page component manages multiple state variables
function HardcoverAuthorPage() {
  const params = Route.useParams();
  const {
    authorData: initialAuthor,
    qualityProfiles,
    rootFolders,
    localAuthor: initialLocalAuthor,
  } = Route.useLoaderData();
  const [author, setAuthor] = useState(initialAuthor);
  const [activeTab, setActiveTab] = useState<"books" | "series">("books");
  const [selectedLanguage, setSelectedLanguage] = useState(initialAuthor.selectedLanguage);
  const [localAuthor, setLocalAuthor] = useState(initialLocalAuthor);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [existingBookIds, setExistingBookIds] = useState<Set<string>>(new Set());

  // Build author context for toggles — pick first quality profile / root folder as defaults
  const authorContext: AuthorContext = {
    name: author.name,
    foreignAuthorId: author.id,
    imageUrl: author.imageUrl,
    bio: author.bio,
    deathYear: author.deathYear,
    qualityProfileId: qualityProfiles[0]?.id ?? undefined,
    rootFolderPath: rootFolders[0]?.path ?? undefined,
  };

  // Populate existingBookIds for visible books when author is in library
  useEffect(() => {
    if (!localAuthor) {return;}
    const visibleIds = author.books.map((b) => b.id);
    if (visibleIds.length === 0) {return;}

    const updateExisting = async () => {
      try {
        const found = await checkBooksExistFn({ data: { foreignBookIds: visibleIds } });
        setExistingBookIds((prev) => {
          const next = new Set(prev);
          for (const b of found) {
            if (b.foreignBookId) {next.add(b.foreignBookId);}
          }
          return next;
        });
      } catch {
        // Silently ignore errors checking existing books
      }
    };
    void updateExisting();
  }, [localAuthor, author.books]);

  const handleBookAdded = (foreignBookId: string) => {
    setExistingBookIds((prev) => new Set([...prev, foreignBookId]));
  };

  const handleAuthorCreated = (authorId: number) => {
    setLocalAuthor({ id: authorId, name: author.name });
  };

  const handleAuthorImported = (authorId: number) => {
    setLocalAuthor({ id: authorId, name: author.name });
  };

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
          <div className="flex items-center gap-2">
            {localAuthor ? (
              <Button variant="outline" asChild>
                <Link to="/authors/$authorId" params={{ authorId: String(localAuthor.id) }}>
                  <Library className="mr-2 h-4 w-4" />
                  In Library
                </Link>
              </Button>
            ) : (
              <Button onClick={() => setAddDialogOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Add to Library
              </Button>
            )}
            {author.hardcoverUrl && (
              <Button asChild variant="outline">
                <a href={author.hardcoverUrl} target="_blank" rel="noreferrer">
                  <ExternalLink className="mr-2 h-4 w-4" />
                  Open on Hardcover
                </a>
              </Button>
            )}
          </div>
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
                  authorContext={authorContext}
                  localAuthorId={localAuthor?.id}
                  existingBookIds={existingBookIds}
                  onBookAdded={handleBookAdded}
                  onAuthorCreated={handleAuthorCreated}
                />
              </TabsContent>
              <TabsContent value="series" className="mt-0">
                <SeriesTab
                  authorSlug={params.authorSlug}
                  active={activeTab === "series"}
                  language={selectedLanguage}
                  languages={author.languages}
                  authorContext={authorContext}
                  localAuthorId={localAuthor?.id}
                  existingBookIds={existingBookIds}
                  onBookAdded={handleBookAdded}
                  onAuthorCreated={handleAuthorCreated}
                />
              </TabsContent>
            </CardContent>
          </Card>
        </Tabs>
      </div>

      <AddAuthorDialog
        open={addDialogOpen}
        onOpenChange={setAddDialogOpen}
        author={author}
        qualityProfiles={qualityProfiles}
        rootFolders={rootFolders}
        onSuccess={handleAuthorImported}
      />
    </div>
  );
}
