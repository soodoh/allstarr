// oxlint-disable react/no-array-index-key -- Skeleton rows in this file have no meaningful identity
import { Fragment, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  createFileRoute,
  Link,
  notFound,
  useNavigate,
} from "@tanstack/react-router";
import {
  ArrowLeft,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronsUpDown,
  ExternalLink,
  ImageIcon,
  Pencil,
  Plus,
  Search,
  Star,
  Trash2,
  X,
} from "lucide-react";
import {
  useQuery,
  useSuspenseQuery,
  keepPreviousData,
} from "@tanstack/react-query";
import { z } from "zod";
import PageHeader from "src/components/shared/page-header";
import { HardcoverAuthorSkeleton } from "src/components/shared/loading-skeleton";
import Skeleton from "src/components/ui/skeleton";
import AuthorPhoto from "src/components/authors/author-photo";
import TablePagination from "src/components/shared/table-pagination";
import { Button } from "src/components/ui/button";
import { Badge } from "src/components/ui/badge";
import Input from "src/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "src/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "src/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "src/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "src/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "src/components/ui/tabs";
import type {
  HardcoverAuthorBook,
  HardcoverAuthorSeries,
} from "src/server/search";
import { useBookDetailModal } from "src/components/books/book-detail-modal-provider";
import AddAuthorDialog from "src/components/hardcover/add-author-dialog";
import {
  BookMonitorToggle,
  SeriesBookMonitorToggle,
} from "src/components/hardcover/add-book-button";
import type { AuthorContext } from "src/components/hardcover/add-book-button";
import AuthorForm from "src/components/authors/author-form";
import ConfirmDialog from "src/components/shared/confirm-dialog";
import {
  hardcoverAuthorQuery,
  hardcoverAuthorSeriesQuery,
  hardcoverSeriesBooksQuery,
  qualityProfilesListQuery,
  rootFoldersListQuery,
  authorExistsQuery,
  booksExistQuery,
  authorDetailQuery,
} from "src/lib/queries";
import { useUpdateAuthor, useDeleteAuthor } from "src/hooks/mutations";
import NotFound from "src/components/NotFound";
import { checkAuthorExistsBySlugFn } from "src/server/authors";

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

export const Route = createFileRoute("/_authed/library/authors/$authorSlug")({
  validateSearch: z.object({
    from: z.enum(["search"]).optional(),
  }),
  loader: async ({ params, context }) => {
    const slug = params.authorSlug;

    // Verify the author exists locally before fetching from Hardcover
    const localAuthor = await checkAuthorExistsBySlugFn({ data: { slug } });
    if (!localAuthor) {
      throw notFound();
    }

    await Promise.all([
      context.queryClient.ensureQueryData(
        hardcoverAuthorQuery(slug, {
          page: 1,
          pageSize: DEFAULT_PAGE_SIZE,
          language: DEFAULT_LANGUAGE,
          sortBy: "year",
          sortDir: "desc",
        }),
      ),
      context.queryClient.ensureQueryData(qualityProfilesListQuery()),
      context.queryClient.ensureQueryData(rootFoldersListQuery()),
    ]);
  },
  component: AuthorPage,
  notFoundComponent: NotFound,
  pendingComponent: () => <HardcoverAuthorSkeleton />,
});

// ---------- Hardcover Books tab ----------

type AuthorParams = {
  page: number;
  pageSize: number;
  language: string;
  sortBy: "title" | "year" | "rating";
  sortDir: "asc" | "desc";
};

function BooksTab({
  authorSlug,
  authorParams,
  setAuthorParams,
  authorContext,
  localAuthorId,
  existingBookMap,
  onBookAdded,
  onAuthorCreated,
}: {
  authorSlug: string;
  authorParams: AuthorParams;
  setAuthorParams: (
    p: AuthorParams | ((prev: AuthorParams) => AuthorParams),
  ) => void;
  authorContext: AuthorContext;
  localAuthorId: number | undefined;
  existingBookMap: Map<string, number>;
  onBookAdded: (foreignBookId: string, localBookId: number) => void;
  onAuthorCreated: (id: number) => void;
}) {
  type BooksTabSortKey = "title" | "year" | "series" | "language" | "rating";
  const apiSortKeys = new Set<BooksTabSortKey>(["title", "year", "rating"]);

  const { openBookModal } = useBookDetailModal();
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchPage, setSearchPage] = useState(1);
  const [activeSortKey, setActiveSortKey] = useState<BooksTabSortKey>("year");
  const [activeSortDir, setActiveSortDir] = useState<"asc" | "desc">("desc");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );

  const isSearching = searchQuery !== "";
  const isClientSort = !apiSortKeys.has(activeSortKey);
  const needsAllBooks = isSearching || isClientSort;

  const { data: author, isFetching } = useSuspenseQuery({
    ...hardcoverAuthorQuery(authorSlug, authorParams),
    placeholderData: keepPreviousData,
  });

  const { data: allBooksData, isFetching: allBooksLoading } = useQuery({
    ...hardcoverAuthorQuery(authorSlug, {
      ...authorParams,
      page: 1,
      pageSize: SEARCH_ALL_PAGE_SIZE,
    }),
    enabled: needsAllBooks,
  });

  const loading = isFetching;
  const allBooks = allBooksData?.books;

  // When we need all books (searching or client-side sorting), filter/sort/paginate locally
  const processedBooks = useMemo(() => {
    if (!needsAllBooks || !allBooks) {return null;}

    let books = allBooks;

    // Apply search filter
    if (isSearching) {
      const q = searchQuery.toLowerCase();
      books = books.filter(
        (b) =>
          b.title.toLowerCase().includes(q) ||
          b.series.some((s) => s.title.toLowerCase().includes(q)),
      );
    }

    // Apply client-side sort
    if (isClientSort) {
      books = [...books].toSorted((a, b) => {
        let cmp = 0;
        if (activeSortKey === "series") {
          const av = a.series[0]?.title ?? "";
          const bv = b.series[0]?.title ?? "";
          cmp = av.localeCompare(bv);
          if (cmp === 0) {
            const ap = Number.parseFloat(a.series[0]?.position ?? "") || Number.POSITIVE_INFINITY;
            const bp = Number.parseFloat(b.series[0]?.position ?? "") || Number.POSITIVE_INFINITY;
            return ap - bp;
          }
        } else if (activeSortKey === "language") {
          const av = a.languageName ?? "";
          const bv = b.languageName ?? "";
          cmp = av.localeCompare(bv);
        }
        return activeSortDir === "asc" ? cmp : -cmp;
      });
    }

    return books;
  }, [allBooks, needsAllBooks, isSearching, searchQuery, isClientSort, activeSortKey, activeSortDir]);

  const localTotal = processedBooks?.length ?? 0;
  const localTotalPages = Math.max(1, Math.ceil(localTotal / DEFAULT_PAGE_SIZE));
  const localPage = needsAllBooks ? searchPage : authorParams.page;

  const localPagedBooks = useMemo(() => {
    if (!processedBooks) {return [];}
    const start = (localPage - 1) * DEFAULT_PAGE_SIZE;
    return processedBooks.slice(start, start + DEFAULT_PAGE_SIZE);
  }, [processedBooks, localPage]);

  const displayBooks = needsAllBooks ? localPagedBooks : author.books;
  const languageGroups = groupBooksByLanguage(displayBooks);

  const displayPage = needsAllBooks ? localPage : authorParams.page;
  const displayPageSize = authorParams.pageSize;
  const totalItems = needsAllBooks ? localTotal : author.totalBooks;
  const totalPages = needsAllBooks ? localTotalPages : author.totalPages;
  const isLoadingDisplay = needsAllBooks ? allBooksLoading : loading;

  const handleSearchChange = (value: string) => {
    setSearchInput(value);
    setSearchPage(1);
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    if (value.trim() === "") {
      setSearchQuery("");
      return;
    }

    debounceRef.current = setTimeout(() => {
      setSearchQuery(value.trim());
    }, SEARCH_DEBOUNCE_MS);
  };

  const clearSearch = () => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    setSearchInput("");
    setSearchQuery("");
    setSearchPage(1);
  };

  const handleSort = (key: BooksTabSortKey) => {
    const newDir: "asc" | "desc" =
      activeSortKey === key && activeSortDir === "asc" ? "desc" : "asc";
    setActiveSortKey(key);
    setActiveSortDir(newDir);
    setSearchPage(1);
    if (apiSortKeys.has(key)) {
      setAuthorParams((prev) => ({
        ...prev,
        sortBy: key as "title" | "year" | "rating",
        sortDir: newDir,
        page: 1,
      }));
    }
  };

  const colCount = 7;

  let booksTableBody: ReactNode;
  if (isLoadingDisplay) {
    // oxlint-disable-next-line react/no-array-index-key -- Skeleton rows have no meaningful identity
    booksTableBody = Array.from({ length: displayPageSize }).map((_, i) => (
      <TableRow key={i}>
        <TableCell>
          <Skeleton className="h-6 w-6 rounded" />
        </TableCell>
        <TableCell>
          <Skeleton className="aspect-[2/3] w-full rounded-sm" />
        </TableCell>
        <TableCell>
          <Skeleton className="h-4 w-[55%]" />
        </TableCell>
        <TableCell>
          <Skeleton className="h-4 w-16" />
        </TableCell>
        <TableCell>
          <Skeleton className="h-4 w-24" />
        </TableCell>
        <TableCell>
          <Skeleton className="h-4 w-14" />
        </TableCell>
        <TableCell>
          <Skeleton className="h-4 w-10" />
        </TableCell>
      </TableRow>
    ));
  } else if (isSearching && processedBooks?.length === 0) {
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
        {authorParams.language === "all" && (
          <TableRow>
            <TableCell
              colSpan={colCount}
              className="bg-muted/40 font-medium text-muted-foreground"
            >
              {group.label}
            </TableCell>
          </TableRow>
        )}
        {group.books.map((book) => {
          const localBookId = existingBookMap.get(book.id);
          return (
            <TableRow
              key={`${group.key}-${book.id}`}
              className={localBookId === undefined ? undefined : "cursor-pointer"}
              onClick={localBookId === undefined ? undefined : () => openBookModal(localBookId)}
            >
              <TableCell>
                <BookMonitorToggle
                  book={book}
                  authorContext={authorContext}
                  localAuthorId={localAuthorId}
                  inLibrary={existingBookMap.has(book.id)}
                  onAdded={onBookAdded}
                  onAuthorCreated={onAuthorCreated}
                />
              </TableCell>
              <TableCell>
                {book.coverUrl ? (
                  <img
                    src={book.coverUrl}
                    alt={book.title}
                    className="aspect-[2/3] w-full rounded-sm object-cover"
                  />
                ) : (
                  <div className="aspect-[2/3] w-full rounded-sm bg-muted flex items-center justify-center">
                    <ImageIcon className="h-4 w-4 text-muted-foreground" />
                  </div>
                )}
              </TableCell>
              <TableCell>
                {book.hardcoverUrl ? (
                  <a
                    href={book.hardcoverUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="font-medium hover:underline"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {book.title}
                  </a>
                ) : (
                  <span className="font-medium">{book.title}</span>
                )}
              </TableCell>
              <TableCell>
                {book.releaseDate || (book.releaseYear ? String(book.releaseYear) : "Unknown")}
              </TableCell>
              <TableCell>
                {book.series.length > 0
                  ? book.series
                      .map((s) =>
                        s.position ? `${s.title} (#${s.position})` : s.title,
                      )
                      .join(", ")
                  : "—"}
              </TableCell>
              <TableCell>{book.languageName || "—"}</TableCell>
              <TableCell>
                {book.rating === undefined ? (
                  "—"
                ) : (
                  <span className="inline-flex items-center gap-1">
                    <Star className="h-3.5 w-3.5 fill-yellow-500 text-yellow-500" />
                    {book.rating.toFixed(1)}
                    {book.usersCount !== undefined && (
                      <span className="text-muted-foreground">
                        ({book.usersCount.toLocaleString()})
                      </span>
                    )}
                  </span>
                )}
              </TableCell>
            </TableRow>
          );
        })}
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
            placeholder="Filter by title or series…"
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
            value={authorParams.language}
            onValueChange={(value) => {
              clearSearch();
              setAuthorParams((prev) => ({
                ...prev,
                language: value,
                page: 1,
              }));
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
          onPageChange={(p) =>
            needsAllBooks
              ? setSearchPage(p)
              : setAuthorParams((prev) => ({ ...prev, page: p }))
          }
          onPageSizeChange={(size) =>
            setAuthorParams((prev) => ({ ...prev, page: 1, pageSize: size }))
          }
        />
      )}

      <Table>
        <colgroup>
          <col className="w-10" />
          <col className="w-14" />
          <col />
          <col />
          <col />
          <col />
          <col />
        </colgroup>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10" />
            <TableHead />
            {(
              [
                { key: "title", label: "Title" },
                { key: "year", label: "Release Date" },
                { key: "series", label: "Series" },
                { key: "language", label: "Language" },
                { key: "rating", label: "Rating" },
              ] as Array<{ key: BooksTabSortKey; label: string }>
            ).map(({ key, label }) => {
              let SortIcon = ChevronsUpDown;
              if (activeSortKey === key) {
                SortIcon =
                  activeSortDir === "asc" ? ChevronUp : ChevronDown;
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
        <TableBody>{booksTableBody}</TableBody>
      </Table>

      {totalItems > 0 && (
        <TablePagination
          page={displayPage}
          pageSize={displayPageSize}
          totalItems={totalItems}
          totalPages={totalPages}
          onPageChange={(p) =>
            needsAllBooks
              ? setSearchPage(p)
              : setAuthorParams((prev) => ({ ...prev, page: p }))
          }
          onPageSizeChange={(size) =>
            setAuthorParams((prev) => ({ ...prev, page: 1, pageSize: size }))
          }
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
  existingBookMap,
  onBookAdded,
  onAuthorCreated,
}: {
  series: HardcoverAuthorSeries;
  language: string;
  authorContext: AuthorContext;
  localAuthorId: number | undefined;
  existingBookMap: Map<string, number>;
  onBookAdded: (foreignBookId: string, localBookId: number) => void;
  onAuthorCreated: (id: number) => void;
}) {
  const { openBookModal } = useBookDetailModal();
  const [expanded, setExpanded] = useState(false);
  const [visibleCount, setVisibleCount] = useState(SERIES_BOOKS_PAGE_SIZE);

  const { data, isFetching: loadingBooks } = useQuery({
    ...hardcoverSeriesBooksQuery(Number(series.id), language),
    enabled: expanded,
  });

  const books = data?.books;

  const handleToggle = () => {
    setExpanded((v) => !v);
    setVisibleCount(SERIES_BOOKS_PAGE_SIZE);
  };

  const visibleBooks = books?.slice(0, visibleCount) ?? [];
  const hasMore = books !== undefined && visibleCount < books.length;

  let SeriesExpandIcon: typeof ChevronUp | typeof ChevronDown;
  if (expanded) {
    SeriesExpandIcon = ChevronUp;
  } else {
    SeriesExpandIcon = ChevronDown;
  }

  const seriesColCount = 3;
  const bookColCount = 4;

  return (
    <>
      <TableRow
        className="cursor-pointer hover:bg-muted/50"
        onClick={handleToggle}
      >
        <TableCell className="w-10" />
        <TableCell>
          <div className="flex items-center gap-2">
            {loadingBooks ? (
              <Skeleton className="h-4 w-4 rounded" />
            ) : (
              <SeriesExpandIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
            )}
            <span className="font-medium">{series.name}</span>
          </div>
        </TableCell>
        <TableCell>{series.booksCount}</TableCell>
      </TableRow>

      {expanded &&
        books !== undefined &&
        (books.length === 0 ? (
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
            {visibleBooks.map((book) => {
              const localBookId = existingBookMap.get(book.id);
              return (
                <TableRow
                  key={book.id}
                  className={`bg-muted/20 hover:bg-muted/30${localBookId === undefined ? "" : " cursor-pointer"}`}
                  onClick={localBookId === undefined ? undefined : (e) => { e.stopPropagation(); openBookModal(localBookId); }}
                >
                  <TableCell className="w-10">
                    <SeriesBookMonitorToggle
                      bookId={book.id}
                      title={book.title}
                      description={book.description}
                      coverUrl={book.coverUrl}
                      releaseDate={book.releaseDate}
                      releaseYear={book.releaseYear}
                      rating={book.rating}
                      languageName={book.languageName}
                      seriesInfo={{
                        foreignSeriesId: series.id,
                        title: series.name,
                        position: book.position === undefined ? undefined : String(book.position),
                      }}
                      authorContext={authorContext}
                      localAuthorId={localAuthorId}
                      inLibrary={existingBookMap.has(book.id)}
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
              );
            })}
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
        ))}
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
  existingBookMap,
  onBookAdded,
  onAuthorCreated,
}: {
  authorSlug: string;
  active: boolean;
  language: string;
  languages: Array<{ code: string; name: string }>;
  authorContext: AuthorContext;
  localAuthorId: number | undefined;
  existingBookMap: Map<string, number>;
  onBookAdded: (foreignBookId: string, localBookId: number) => void;
  onAuthorCreated: (id: number) => void;
}) {
  const [selectedLanguage, setSelectedLanguage] = useState(language);
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState("");

  const { data: seriesData, isFetching: loading } = useQuery({
    ...hardcoverAuthorSeriesQuery(authorSlug, selectedLanguage),
    enabled: active,
  });

  const allSeries = seriesData ?? undefined;

  const filteredSeries = useMemo(() => {
    if (!allSeries) {
      return [];
    }
    const q = searchInput.trim().toLowerCase();
    if (!q) {
      return allSeries;
    }
    return allSeries.filter((s) => s.name.toLowerCase().includes(q));
  }, [allSeries, searchInput]);

  const totalSeries = filteredSeries.length;
  const totalPages = Math.max(1, Math.ceil(totalSeries / SERIES_PAGE_SIZE));

  const pagedSeries = useMemo(() => {
    const start = (page - 1) * SERIES_PAGE_SIZE;
    return filteredSeries.slice(start, start + SERIES_PAGE_SIZE);
  }, [filteredSeries, page]);

  const loaded = !loading && allSeries !== undefined;

  const colCount = 3;

  let seriesTableBody: ReactNode;
  if (loading) {
    // oxlint-disable-next-line react/no-array-index-key -- Skeleton rows have no meaningful identity
    seriesTableBody = Array.from({ length: 10 }).map((_, i) => (
      <TableRow key={i}>
        <TableCell>
          <Skeleton className="h-6 w-6 rounded" />
        </TableCell>
        <TableCell>
          <Skeleton className="h-4 w-48" />
        </TableCell>
        <TableCell>
          <Skeleton className="h-4 w-10" />
        </TableCell>
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
        existingBookMap={existingBookMap}
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
              setPage(1);
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
            <TableHead className="w-10" />
            <TableHead>Series</TableHead>
            <TableHead>Books</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>{seriesTableBody}</TableBody>
      </Table>

      {loaded && <SeriesPagination />}
    </div>
  );
}

// ---------- Hardcover-mode page ----------

// oxlint-disable-next-line complexity -- Page component manages multiple state variables
function HardcoverAuthorPage({ authorSlug }: { authorSlug: string }) {
  const search = Route.useSearch();
  const fromSearch = search.from === "search";

  const [authorParams, setAuthorParams] = useState<AuthorParams>({
    page: 1,
    pageSize: DEFAULT_PAGE_SIZE,
    language: DEFAULT_LANGUAGE,
    sortBy: "year",
    sortDir: "desc",
  });

  const [activeTab, setActiveTab] = useState<"books" | "series">("books");
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [localAuthorIdOverride, setLocalAuthorIdOverride] = useState<
    number | undefined
  >(undefined);
  const [addedBookIds, setAddedBookIds] = useState<Map<string, number>>(new Map());

  const navigate = useNavigate();

  const { data: author } = useSuspenseQuery(
    hardcoverAuthorQuery(authorSlug, authorParams),
  );
  const { data: qualityProfiles } = useSuspenseQuery(
    qualityProfilesListQuery(),
  );
  const { data: rootFolders } = useSuspenseQuery(rootFoldersListQuery());

  const { data: localAuthorData } = useQuery({
    ...authorExistsQuery(author.id),
    enabled: Boolean(author.id),
  });

  const localAuthor = localAuthorIdOverride
    ? { id: localAuthorIdOverride, name: author.name }
    : (localAuthorData ?? null);

  // Fetch local author detail when in-library (for edit form)
  const { data: localAuthorDetail } = useQuery({
    ...authorDetailQuery(localAuthor?.id ?? 0),
    enabled: Boolean(localAuthor?.id),
  });

  const visibleBookIds = author.books.map((b) => b.id);
  const { data: existingBooksData } = useQuery({
    ...booksExistQuery(visibleBookIds),
    enabled: Boolean(localAuthor) && visibleBookIds.length > 0,
  });

  const existingBookMap = useMemo(() => {
    const map = new Map<string, number>(addedBookIds);
    if (existingBooksData) {
      for (const b of existingBooksData) {
        if (b.foreignBookId) {
          map.set(b.foreignBookId, b.id);
        }
      }
    }
    return map;
  }, [existingBooksData, addedBookIds]);

  const authorContext: AuthorContext = {
    name: author.name,
    foreignAuthorId: author.id,
    slug: author.slug,
    imageUrl: author.imageUrl,
    bio: author.bio,
    deathYear: author.deathYear,
    qualityProfileId: qualityProfiles[0]?.id ?? undefined,
    rootFolderPath: rootFolders[0]?.path ?? undefined,
  };

  const updateAuthor = useUpdateAuthor();
  const deleteAuthor = useDeleteAuthor();

  const handleBookAdded = (foreignBookId: string, localBookId: number) => {
    setAddedBookIds((prev) => new Map([...prev, [foreignBookId, localBookId]]));
  };

  const handleAuthorCreated = (authorId: number) => {
    setLocalAuthorIdOverride(authorId);
  };

  const handleUpdate = (values: {
    name: string;
    sortName: string;
    status: string;
    qualityProfileId?: number;
    rootFolderPath?: string;
  }) => {
    if (!localAuthor) {
      return;
    }
    updateAuthor.mutate(
      { ...values, id: localAuthor.id },
      { onSuccess: () => setEditOpen(false) },
    );
  };

  const handleDelete = () => {
    if (!localAuthor) {
      return;
    }
    deleteAuthor.mutate(localAuthor.id, {
      onSuccess: () => navigate({ to: "/library/authors" }),
    });
  };

  const lifespan =
    author.bornYear || author.deathYear
      ? `${author.bornYear || "?"}-${author.deathYear || "Present"}`
      : null;

  return (
    <div className="space-y-6">
      <div>
        <Button variant="ghost" size="sm" asChild>
          {fromSearch ? (
            <Link to="/library/add">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Add
            </Link>
          ) : (
            <Link to="/library/authors">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Authors
            </Link>
          )}
        </Button>
      </div>

      <PageHeader
        title={author.name}
        description={lifespan || "Hardcover author profile"}
        actions={
          <div className="flex items-center gap-2">
            {localAuthor ? (
              <>
                <Button variant="outline" onClick={() => setEditOpen(true)}>
                  <Pencil className="mr-2 h-4 w-4" />
                  Edit
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => setDeleteOpen(true)}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete
                </Button>
              </>
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
              {authorParams.language !== "all" && (
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">
                    In{" "}
                    {author.languages.find(
                      (l) => l.code === authorParams.language,
                    )?.name ?? authorParams.language}
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

        <Tabs
          value={activeTab}
          onValueChange={(v) => setActiveTab(v as "books" | "series")}
        >
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
                  authorSlug={authorSlug}
                  authorParams={authorParams}
                  setAuthorParams={setAuthorParams}
                  authorContext={authorContext}
                  localAuthorId={localAuthor?.id}
                  existingBookMap={existingBookMap}
                  onBookAdded={handleBookAdded}
                  onAuthorCreated={handleAuthorCreated}
                />
              </TabsContent>
              <TabsContent value="series" className="mt-0">
                <SeriesTab
                  authorSlug={authorSlug}
                  active={activeTab === "series"}
                  language={authorParams.language}
                  languages={author.languages}
                  authorContext={authorContext}
                  localAuthorId={localAuthor?.id}
                  existingBookMap={existingBookMap}
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
        onSuccess={handleAuthorCreated}
      />

      {localAuthor && localAuthorDetail && (
        <>
          <Dialog open={editOpen} onOpenChange={setEditOpen}>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Edit Author</DialogTitle>
              </DialogHeader>
              <AuthorForm
                initialValues={{
                  name: localAuthorDetail.name,
                  sortName: localAuthorDetail.sortName,
                  status: localAuthorDetail.status,
                  qualityProfileId:
                    localAuthorDetail.qualityProfileId || undefined,
                  rootFolderPath: localAuthorDetail.rootFolderPath || undefined,
                }}
                qualityProfiles={qualityProfiles}
                rootFolders={rootFolders}
                onSubmit={handleUpdate}
                onCancel={() => setEditOpen(false)}
                loading={updateAuthor.isPending}
              />
            </DialogContent>
          </Dialog>

          <ConfirmDialog
            open={deleteOpen}
            onOpenChange={setDeleteOpen}
            title="Delete Author"
            description="Are you sure you want to delete this author? This will also delete all associated books and cannot be undone."
            onConfirm={handleDelete}
            loading={deleteAuthor.isPending}
          />
        </>
      )}
    </div>
  );
}

// ---------- Root component ----------

function AuthorPage() {
  const params = Route.useParams();
  return <HardcoverAuthorPage authorSlug={params.authorSlug} />;
}
