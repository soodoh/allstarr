// oxlint-disable react/no-array-index-key -- Skeleton rows in this file have no meaningful identity
import { Fragment, useMemo, useRef, useState } from "react";
import type React from "react";
import {
  createFileRoute,
  Link,
  redirect,
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
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import {
  useQuery,
  useSuspenseQuery,
  keepPreviousData,
} from "@tanstack/react-query";
import { z } from "zod";
import PageHeader from "~/components/shared/page-header";
import { HardcoverAuthorSkeleton } from "~/components/shared/loading-skeleton";
import Skeleton from "~/components/ui/skeleton";
import AuthorPhoto from "~/components/authors/author-photo";
import TablePagination from "~/components/shared/table-pagination";
import SortableTableHead from "~/components/shared/sortable-table-head";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import type {
  HardcoverAuthorBook,
  HardcoverAuthorSeries,
} from "~/server/search";
import AddAuthorDialog from "~/components/hardcover/add-author-dialog";
import {
  BookMonitorToggle,
  SeriesBookMonitorToggle,
} from "~/components/hardcover/add-book-button";
import type { AuthorContext } from "~/components/hardcover/add-book-button";
import AuthorForm from "~/components/authors/author-form";
import ConfirmDialog from "~/components/shared/confirm-dialog";
import {
  hardcoverAuthorQuery,
  hardcoverAuthorSeriesQuery,
  hardcoverSeriesBooksQuery,
  qualityProfilesListQuery,
  rootFoldersListQuery,
  authorExistsQuery,
  booksExistQuery,
  authorDetailQuery,
} from "~/lib/queries";
import { useUpdateAuthor, useDeleteAuthor } from "~/hooks/mutations";
import { useTableState } from "~/hooks/use-table-state";
import type { getAuthorFn as GetAuthorFnType } from "~/server/authors";

const DEFAULT_LANGUAGE = "en";
const DEFAULT_PAGE_SIZE = 25;
const SERIES_PAGE_SIZE = 25;
const SEARCH_ALL_PAGE_SIZE = 500;
const SEARCH_DEBOUNCE_MS = 300;

function isNumericId(param: string): boolean {
  return /^\d+$/.test(param);
}

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

export const Route = createFileRoute("/_authed/authors/$authorSlug")({
  validateSearch: z.object({
    from: z.enum(["search"]).optional(),
  }),
  loader: async ({ params, context }) => {
    const param = params.authorSlug;

    if (isNumericId(param)) {
      // Numeric ID: look up local author and redirect to slug if available
      const id = Number.parseInt(param, 10);
      const author = await context.queryClient.fetchQuery(authorDetailQuery(id));
      if (author.slug) {
        throw redirect({
          to: "/authors/$authorSlug",
          params: { authorSlug: author.slug },
        });
      }
      // Local-only author (no slug) — load detail data for fallback view
      await Promise.all([
        context.queryClient.ensureQueryData(authorDetailQuery(id)),
        context.queryClient.ensureQueryData(qualityProfilesListQuery()),
        context.queryClient.ensureQueryData(rootFoldersListQuery()),
      ]);
      return { mode: "local" as const, localId: id };
    }

    // Slug-based: fetch from Hardcover
    await Promise.all([
      context.queryClient.ensureQueryData(
        hardcoverAuthorQuery(param, {
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
    return { mode: "hardcover" as const };
  },
  component: AuthorPage,
  pendingComponent: () => {
    // We can't know which skeleton to show before the loader resolves,
    // so default to the richer Hardcover skeleton.
    return <HardcoverAuthorSkeleton />;
  },
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
  existingBookIds,
  onBookAdded,
  onAuthorCreated,
}: {
  authorSlug: string;
  authorParams: AuthorParams;
  setAuthorParams: (p: AuthorParams | ((prev: AuthorParams) => AuthorParams)) => void;
  authorContext: AuthorContext;
  localAuthorId: number | undefined;
  existingBookIds: Set<string>;
  onBookAdded: (foreignBookId: string) => void;
  onAuthorCreated: (id: number) => void;
}) {
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchPage, setSearchPage] = useState(1);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const isSearching = searchQuery !== "";

  const { data: author, isFetching } = useSuspenseQuery({
    ...hardcoverAuthorQuery(authorSlug, authorParams),
    placeholderData: keepPreviousData,
  });

  const { data: allBooksData, isFetching: searchLoading } = useQuery({
    ...hardcoverAuthorQuery(authorSlug, {
      ...authorParams,
      page: 1,
      pageSize: SEARCH_ALL_PAGE_SIZE,
    }),
    enabled: isSearching,
  });

  const loading = isFetching;
  const allBooks = allBooksData?.books;

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

  const displayPage = isSearching ? searchPage : authorParams.page;
  const displayPageSize = authorParams.pageSize;
  const totalItems = isSearching ? searchTotalBooks : author.totalBooks;
  const totalPages = isSearching ? searchTotalPages : author.totalPages;
  const isLoadingDisplay = isSearching ? searchLoading : loading;

  const handleSearchChange = (value: string) => {
    setSearchInput(value);
    setSearchPage(1);
    if (debounceRef.current) {clearTimeout(debounceRef.current);}

    if (value.trim() === "") {
      setSearchQuery("");
      return;
    }

    debounceRef.current = setTimeout(() => {
      setSearchQuery(value.trim());
    }, SEARCH_DEBOUNCE_MS);
  };

  const clearSearch = () => {
    if (debounceRef.current) {clearTimeout(debounceRef.current);}
    setSearchInput("");
    setSearchQuery("");
    setSearchPage(1);
  };

  const handleSort = (key: "title" | "year" | "rating") => {
    let newDir: "asc" | "desc" = "asc";
    if (authorParams.sortBy === key && authorParams.sortDir === "asc") {
      newDir = "desc";
    }
    setAuthorParams((prev) => ({ ...prev, sortBy: key, sortDir: newDir, page: 1 }));
  };

  const colCount = 3;

  let booksTableBody: React.ReactNode;
  if (isLoadingDisplay) {
    // oxlint-disable-next-line react/no-array-index-key -- Skeleton rows have no meaningful identity
    booksTableBody = Array.from({ length: displayPageSize }).map((_, i) => (
      <TableRow key={i}>
        <TableCell><Skeleton className="h-6 w-6 rounded" /></TableCell>
        <TableCell><Skeleton className="h-4 w-[55%]" /></TableCell>
        <TableCell><Skeleton className="h-4 w-10" /></TableCell>
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
            value={authorParams.language}
            onValueChange={(value) => {
              clearSearch();
              setAuthorParams((prev) => ({ ...prev, language: value, page: 1 }));
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
            isSearching
              ? setSearchPage(p)
              : setAuthorParams((prev) => ({ ...prev, page: p }))
          }
          onPageSizeChange={(size) =>
            setAuthorParams((prev) => ({ ...prev, page: 1, pageSize: size }))
          }
        />
      )}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10" />
            {(
              [
                { key: "title", label: "Title" },
                { key: "year", label: "Year" },
              ] as Array<{ key: "title" | "year" | "rating"; label: string }>
            ).map(({ key, label }) => {
              let SortIcon = ChevronsUpDown;
              if (authorParams.sortBy === key) {
                SortIcon = authorParams.sortDir === "asc" ? ChevronUp : ChevronDown;
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
            isSearching
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
  const [selectedLanguage, setSelectedLanguage] = useState(language);
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState("");

  const { data: seriesData, isFetching: loading } = useQuery({
    ...hardcoverAuthorSeriesQuery(authorSlug, selectedLanguage),
    enabled: active,
  });

  const allSeries = seriesData ?? undefined;

  const filteredSeries = useMemo(() => {
    if (!allSeries) {return [];}
    const q = searchInput.trim().toLowerCase();
    if (!q) {return allSeries;}
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
  const [localAuthorIdOverride, setLocalAuthorIdOverride] = useState<number | undefined>(undefined);
  const [addedBookIds, setAddedBookIds] = useState<Set<string>>(new Set());

  const navigate = useNavigate();

  const { data: author } = useSuspenseQuery(hardcoverAuthorQuery(authorSlug, authorParams));
  const { data: qualityProfiles } = useSuspenseQuery(qualityProfilesListQuery());
  const { data: rootFolders } = useSuspenseQuery(rootFoldersListQuery());

  const { data: localAuthorData } = useQuery({
    ...authorExistsQuery(author.id),
    enabled: Boolean(author.id),
  });

  const localAuthor = localAuthorIdOverride
    ? { id: localAuthorIdOverride, name: author.name }
    : localAuthorData ?? null;

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

  const existingBookIds = useMemo(() => {
    const ids = new Set<string>(addedBookIds);
    if (existingBooksData) {
      for (const b of existingBooksData) {
        if (b.foreignBookId) {ids.add(b.foreignBookId);}
      }
    }
    return ids;
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

  const handleBookAdded = (foreignBookId: string) => {
    setAddedBookIds((prev) => new Set([...prev, foreignBookId]));
  };

  const handleAuthorCreated = (authorId: number) => {
    setLocalAuthorIdOverride(authorId);
  };

  const handleUpdate = (values: {
    name: string;
    sortName: string;
    overview?: string;
    status: string;
    monitored: boolean;
    qualityProfileId?: number;
    rootFolderPath?: string;
  }) => {
    if (!localAuthor) {return;}
    updateAuthor.mutate(
      { ...values, id: localAuthor.id },
      { onSuccess: () => setEditOpen(false) },
    );
  };

  const handleDelete = () => {
    if (!localAuthor) {return;}
    deleteAuthor.mutate(localAuthor.id, {
      onSuccess: () => navigate({ to: "/authors" }),
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
            <Link to="/search">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Search
            </Link>
          ) : (
            <Link to="/authors">
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
                <Button variant="destructive" onClick={() => setDeleteOpen(true)}>
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
                  existingBookIds={existingBookIds}
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
                  overview: localAuthorDetail.overview || undefined,
                  status: localAuthorDetail.status,
                  monitored: localAuthorDetail.monitored,
                  qualityProfileId: localAuthorDetail.qualityProfileId || undefined,
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

// ---------- Local-only fallback page ----------

type LocalAuthorDetail = Awaited<ReturnType<typeof GetAuthorFnType>>;
type LocalBook = LocalAuthorDetail["books"][number];

const bookComparators: Partial<Record<string, (a: LocalBook, b: LocalBook) => number>> = {
  title: (a, b) => (a.title ?? "").localeCompare(b.title ?? ""),
  releaseDate: (a, b) => {
    const da = a.releaseDate ? new Date(a.releaseDate).getTime() : 0;
    const db = b.releaseDate ? new Date(b.releaseDate).getTime() : 0;
    return da - db;
  },
  monitored: (a, b) => Number(a.monitored) - Number(b.monitored),
};

function LocalAuthorPage({ localId }: { localId: number }) {
  const navigate = useNavigate();

  const { data: author } = useSuspenseQuery(authorDetailQuery(localId));
  const { data: qualityProfiles } = useSuspenseQuery(qualityProfilesListQuery());
  const { data: rootFolders } = useSuspenseQuery(rootFoldersListQuery());

  const updateAuthor = useUpdateAuthor();
  const deleteAuthor = useDeleteAuthor();

  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const authorImageUrl =
    author.images?.find((image) => image.coverType.toLowerCase() === "poster")
      ?.url ??
    author.images?.find((image) => image.coverType.toLowerCase() === "fanart")
      ?.url ??
    author.images?.[0]?.url ??
    null;

  const {
    page,
    pageSize,
    sortColumn,
    sortDirection,
    handleSort,
    setPage,
    setPageSize,
    paginatedData: paginatedBooks,
    totalPages,
  } = useTableState({
    data: author.books,
    defaultPageSize: 25,
    comparators: bookComparators,
  });

  const handleUpdate = (values: {
    name: string;
    sortName: string;
    overview?: string;
    status: string;
    monitored: boolean;
    qualityProfileId?: number;
    rootFolderPath?: string;
  }) => {
    updateAuthor.mutate(
      { ...values, id: author.id },
      { onSuccess: () => setEditOpen(false) },
    );
  };

  const handleDelete = () => {
    deleteAuthor.mutate(author.id, {
      onSuccess: () => navigate({ to: "/authors" }),
    });
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
            <Button variant="destructive" onClick={() => setDeleteOpen(true)}>
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </Button>
          </div>
        }
      />

      <div className="space-y-6">
        <div className="flex flex-col gap-6 xl:flex-row">
          <div className="w-full xl:w-auto xl:shrink-0">
            <AuthorPhoto
              name={author.name}
              imageUrl={authorImageUrl ?? undefined}
              className="xl:h-full xl:max-w-none xl:w-44 xl:aspect-auto"
            />
          </div>

          <Card className="w-full xl:w-auto xl:shrink-0">
            <CardHeader>
              <CardTitle>Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">Status</span>
                <Badge variant="secondary">{author.status}</Badge>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">Monitored</span>
                <Badge variant={author.monitored ? "default" : "outline"}>
                  {author.monitored ? "Yes" : "No"}
                </Badge>
              </div>
              {author.rootFolderPath && (
                <div className="flex flex-col gap-1 sm:flex-row sm:justify-between sm:gap-4">
                  <span className="text-muted-foreground shrink-0">
                    Root Folder
                  </span>
                  <span className="font-mono text-xs break-all">
                    {author.rootFolderPath}
                  </span>
                </div>
              )}
            </CardContent>
          </Card>

          {author.overview && (
            <Card className="w-full xl:min-w-0 xl:flex-1">
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
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Books</CardTitle>
            <CardDescription>
              {author.books.length}{" "}
              {author.books.length === 1 ? "book" : "books"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {author.books.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No books found for this author.
              </p>
            ) : (
              <>
                <TablePagination
                  page={page}
                  pageSize={pageSize}
                  totalItems={author.books.length}
                  totalPages={totalPages}
                  onPageChange={setPage}
                  onPageSizeChange={setPageSize}
                />
                <Table>
                  <TableHeader>
                    <TableRow>
                      <SortableTableHead
                        column="title"
                        sortColumn={sortColumn}
                        sortDirection={sortDirection}
                        onSort={handleSort}
                      >
                        Title
                      </SortableTableHead>
                      <SortableTableHead
                        column="releaseDate"
                        sortColumn={sortColumn}
                        sortDirection={sortDirection}
                        onSort={handleSort}
                      >
                        Release Date
                      </SortableTableHead>
                      <SortableTableHead
                        column="monitored"
                        sortColumn={sortColumn}
                        sortDirection={sortDirection}
                        onSort={handleSort}
                      >
                        Monitored
                      </SortableTableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedBooks.map((book) => (
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
                        <TableCell>{book.releaseDate || "Unknown"}</TableCell>
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
                <TablePagination
                  page={page}
                  pageSize={pageSize}
                  totalItems={author.books.length}
                  totalPages={totalPages}
                  onPageChange={setPage}
                  onPageSizeChange={setPageSize}
                />
              </>
            )}
          </CardContent>
        </Card>
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
    </div>
  );
}

// ---------- Root component (dispatches based on loader mode) ----------

function AuthorPage() {
  const loaderData = Route.useLoaderData();
  const params = Route.useParams();

  if (loaderData.mode === "local") {
    return <LocalAuthorPage localId={loaderData.localId} />;
  }

  return <HardcoverAuthorPage authorSlug={params.authorSlug} />;
}
