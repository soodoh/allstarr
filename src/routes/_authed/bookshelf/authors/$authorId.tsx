import { useMemo, useRef, useState } from "react";
import {
  createFileRoute,
  Link,
  notFound,
  useNavigate,
  useRouter,
} from "@tanstack/react-router";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  ChevronsUpDown,
  ChevronRight,
  ExternalLink,
  ImageIcon,
  Library,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Star,
  Trash2,
  X,
} from "lucide-react";
import PageHeader from "src/components/shared/page-header";
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
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "src/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "src/components/ui/select";
import ProfileToggleIcons from "src/components/shared/profile-toggle-icons";
import MetadataWarning from "src/components/shared/metadata-warning";
import AuthorForm from "src/components/authors/author-form";
import ConfirmDialog from "src/components/shared/confirm-dialog";
import AdditionalAuthors from "src/components/books/additional-authors";
import BookPreviewModal from "src/components/hardcover/book-preview-modal";
import type { HardcoverSearchItem } from "src/server/search";
import {
  authorDetailQuery,
  hardcoverSeriesCompleteQuery,
  metadataProfileQuery,
  qualityProfilesListQuery,
} from "src/lib/queries";
import {
  useUpdateAuthor,
  useDeleteAuthor,
  useRefreshAuthorMetadata,
  useToggleBookProfile,
} from "src/hooks/mutations";
import NotFound from "src/components/NotFound";
import { pickBestEdition } from "src/lib/editions";
import type { HardcoverRawSeriesBookEdition } from "src/server/hardcover/types";

const DEFAULT_PAGE_SIZE = 25;
const SEARCH_DEBOUNCE_MS = 300;

export const Route = createFileRoute("/_authed/bookshelf/authors/$authorId")({
  loader: async ({ params, context }) => {
    const id = Number(params.authorId);
    if (!Number.isFinite(id) || id <= 0) {
      throw notFound();
    }

    await Promise.all([
      context.queryClient.ensureQueryData(authorDetailQuery(id)),
      context.queryClient.ensureQueryData(qualityProfilesListQuery()),
      context.queryClient.ensureQueryData(metadataProfileQuery()),
    ]);
  },
  component: AuthorPage,
  notFoundComponent: NotFound,
  pendingComponent: () => (
    <div className="space-y-6">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-64 w-full" />
    </div>
  ),
});

// ---------- Types ----------

type EditionInfo = {
  id: number;
  bookId: number;
  title: string;
  releaseDate: string | null;
  format: string | null;
  pageCount: number | null;
  isbn10: string | null;
  isbn13: string | null;
  asin: string | null;
  publisher: string | null;
  country: string | null;
  usersCount: number | null;
  score: number | null;
  languageCode: string | null;
  images: Array<{ url: string; coverType: string }> | null;
  isDefaultCover: boolean;
  qualityProfileIds: number[];
  metadataSourceMissingSince: Date | null;
};

type BookAuthorEntry = {
  authorId: number | null;
  foreignAuthorId: string;
  authorName: string;
  isPrimary: boolean;
};

type LocalBook = {
  id: number;
  title: string;
  slug: string | null;
  authorName: string | null;
  authorForeignId: string | null;
  bookAuthors: BookAuthorEntry[];
  description: string | null;
  releaseDate: string | null;
  releaseYear: number | null;
  qualityProfileIds: number[];
  foreignBookId: string | null;
  images: Array<{ url: string; coverType: string }> | null;
  rating: number | null;
  ratingsCount: number | null;
  usersCount: number | null;
  tags: number[] | null;
  languageCodes: string[];
  editions: EditionInfo[];
  metadataSourceMissingSince: Date | null;
  fileCount: number;
  missingEditionsCount: number;
};

type LanguageOption = {
  languageCode: string;
  language: string;
};

type AuthorSeries = {
  id: number;
  title: string;
  slug: string | null;
  foreignSeriesId: string | null;
  isCompleted: boolean | null;
  books: Array<{ bookId: number; position: string }>;
};

type BooksTabSortKey = "title" | "year" | "readers" | "rating";

// ---------- Helpers ----------

// ---------- Books tab ----------

// oxlint-disable-next-line complexity -- Tab component with search, sort, pagination, and table rendering
type QualityProfileInfo = { id: number; name: string; icon: string };

function BooksTab({
  books,
  currentAuthorId,
  availableLanguages,
  authorQualityProfiles,
}: {
  books: LocalBook[];
  currentAuthorId: number;
  availableLanguages: LanguageOption[];
  authorQualityProfiles: QualityProfileInfo[];
}) {
  const toggleBookProfile = useToggleBookProfile();
  const navigate = useNavigate();
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [language, setLanguage] = useState(
    availableLanguages.length > 0 ? availableLanguages[0].languageCode : "all",
  );
  const [page, setPage] = useState(1);
  const [sortKey, setSortKey] = useState<BooksTabSortKey>("readers");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );

  const handleSearchChange = (value: string) => {
    setSearchInput(value);
    setPage(1);
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
    setPage(1);
  };

  const handleSort = (key: BooksTabSortKey) => {
    const newDir: "asc" | "desc" =
      sortKey === key && sortDir === "asc" ? "desc" : "asc";
    setSortKey(key);
    setSortDir(newDir);
    setPage(1);
  };

  const processedBooks = useMemo(() => {
    let result = books;

    // Language filter
    if (language !== "all") {
      result = result.filter((b) => b.languageCodes.includes(language));
    }

    // Search filter
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter((b) => b.title.toLowerCase().includes(q));
    }

    // Sort
    result = [...result].toSorted((a, b) => {
      let cmp = 0;
      if (sortKey === "title") {
        cmp = a.title.localeCompare(b.title);
      } else if (sortKey === "year") {
        cmp = (a.releaseDate ?? "").localeCompare(b.releaseDate ?? "");
      } else if (sortKey === "readers") {
        cmp = (a.usersCount ?? -1) - (b.usersCount ?? -1);
      } else if (sortKey === "rating") {
        cmp = (a.rating ?? -1) - (b.rating ?? -1);
      }
      const directed = sortDir === "asc" ? cmp : -cmp;
      if (directed !== 0 || sortKey === "readers") {
        return directed;
      }
      // Tiebreaker: higher readers first
      return (b.usersCount ?? 0) - (a.usersCount ?? 0);
    });

    return result;
  }, [books, language, searchQuery, sortKey, sortDir]);

  const totalItems = processedBooks.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / DEFAULT_PAGE_SIZE));
  const pagedBooks = processedBooks.slice(
    (page - 1) * DEFAULT_PAGE_SIZE,
    page * DEFAULT_PAGE_SIZE,
  );

  const colCount = 14;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="relative w-full sm:max-w-xs">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            <Input
              className="pl-8 pr-8 h-9 text-sm"
              placeholder="Filter by title…"
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
          {availableLanguages.length > 1 && (
            <Select
              value={language}
              onValueChange={(v) => {
                setLanguage(v);
                setPage(1);
              }}
            >
              <SelectTrigger className="h-9 w-[160px] text-sm">
                <SelectValue placeholder="Language" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Languages</SelectItem>
                {availableLanguages.map((l) => (
                  <SelectItem key={l.languageCode} value={l.languageCode}>
                    {l.language}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <span className="text-sm text-muted-foreground whitespace-nowrap">
            {totalItems} book{totalItems === 1 ? "" : "s"}
          </span>
        </div>
      </div>

      {totalItems > 0 && (
        <TablePagination
          page={page}
          pageSize={DEFAULT_PAGE_SIZE}
          totalItems={totalItems}
          totalPages={totalPages}
          onPageChange={setPage}
          onPageSizeChange={() => {
            /* noop */
          }}
        />
      )}

      <div className="overflow-x-auto">
        <Table>
          <colgroup>
            <col className="w-10" />
            <col className="w-14" />
            <col />
            <col />
            <col />
            <col />
            <col />
            <col />
            <col />
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
                  { key: "readers", label: "Readers" },
                  { key: "rating", label: "Rating" },
                ] as Array<{ key: BooksTabSortKey; label: string }>
              ).map(({ key, label }) => {
                let SortIcon = ChevronsUpDown;
                if (sortKey === key) {
                  SortIcon = sortDir === "asc" ? ChevronUp : ChevronDown;
                }
                return (
                  <TableHead
                    key={key}
                    className="cursor-pointer select-none hover:text-foreground"
                    onClick={() => handleSort(key)}
                  >
                    {label}
                    <SortIcon className="ml-1 h-3.5 w-3.5 text-muted-foreground/50 inline" />
                  </TableHead>
                );
              })}
              <TableHead>Type</TableHead>
              <TableHead>Pages</TableHead>
              <TableHead>ISBN 10</TableHead>
              <TableHead>ISBN 13</TableHead>
              <TableHead>ASIN</TableHead>
              <TableHead>Data Score</TableHead>
              <TableHead>Author</TableHead>
              <TableHead>Monitored</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {searchQuery && processedBooks.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={colCount}
                  className="text-sm text-muted-foreground"
                >
                  No books match &ldquo;{searchQuery}&rdquo;.
                </TableCell>
              </TableRow>
            )}
            {!searchQuery && books.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={colCount}
                  className="text-sm text-muted-foreground"
                >
                  No books found for this author.
                </TableCell>
              </TableRow>
            )}
            {
              // oxlint-disable-next-line complexity -- Table row render with many conditional cells
              pagedBooks.map((book) => {
                const edition = pickBestEdition(book.editions, language);
                const coverUrl =
                  edition?.images?.[0]?.url ?? book.images?.[0]?.url;
                const displayTitle =
                  !edition || edition.isDefaultCover
                    ? book.title
                    : edition.title;
                const displayDate =
                  edition?.releaseDate ??
                  book.releaseDate ??
                  (book.releaseYear ? String(book.releaseYear) : "Unknown");
                return (
                  <TableRow
                    key={book.id}
                    className="cursor-pointer"
                    onClick={() =>
                      navigate({
                        to: "/bookshelf/books/$bookId",
                        params: { bookId: String(book.id) },
                      })
                    }
                  >
                    <TableCell>
                      {(() => {
                        if (book.metadataSourceMissingSince) {
                          return (
                            <MetadataWarning
                              type="book"
                              missingSince={book.metadataSourceMissingSince}
                              itemId={book.id}
                              itemTitle={book.title}
                              fileCount={book.fileCount}
                              onDeleted={() => router.invalidate()}
                            />
                          );
                        }
                        if (book.missingEditionsCount > 0) {
                          return (
                            <MetadataWarning
                              type="book-editions"
                              missingSince={new Date()}
                              missingEditionsCount={book.missingEditionsCount}
                              itemId={book.id}
                              itemTitle={book.title}
                            />
                          );
                        }
                        return (
                          <ProfileToggleIcons
                            profiles={authorQualityProfiles}
                            activeProfileIds={book.qualityProfileIds}
                            onToggle={(profileId) =>
                              toggleBookProfile.mutate({
                                bookId: book.id,
                                qualityProfileId: profileId,
                              })
                            }
                            isPending={toggleBookProfile.isPending}
                          />
                        );
                      })()}
                    </TableCell>
                    <TableCell>
                      {coverUrl ? (
                        <img
                          src={coverUrl}
                          alt={displayTitle}
                          className="aspect-[2/3] w-full rounded-sm object-cover"
                        />
                      ) : (
                        <div className="aspect-[2/3] w-full rounded-sm bg-muted flex items-center justify-center">
                          <ImageIcon className="h-4 w-4 text-muted-foreground" />
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <span className="font-medium">{displayTitle}</span>
                    </TableCell>
                    <TableCell>{displayDate}</TableCell>
                    <TableCell>
                      {book.usersCount === null
                        ? "—"
                        : book.usersCount.toLocaleString()}
                    </TableCell>
                    <TableCell>
                      {book.rating === null ? (
                        "—"
                      ) : (
                        <span className="inline-flex items-center gap-1">
                          <Star className="h-3.5 w-3.5 fill-yellow-500 text-yellow-500" />
                          {book.rating.toFixed(1)}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {edition?.format ?? "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {edition?.pageCount ?? "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {edition?.isbn10 ?? "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {edition?.isbn13 ?? "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {edition?.asin ?? "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {edition?.score ?? "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      <AdditionalAuthors
                        bookAuthors={book.bookAuthors}
                        currentAuthorId={currentAuthorId}
                      />
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          book.qualityProfileIds.length > 0
                            ? "default"
                            : "secondary"
                        }
                      >
                        {book.qualityProfileIds.length > 0 ? "Yes" : "No"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                );
              })
            }
          </TableBody>
        </Table>
      </div>

      {totalItems > 0 && (
        <TablePagination
          page={page}
          pageSize={DEFAULT_PAGE_SIZE}
          totalItems={totalItems}
          totalPages={totalPages}
          onPageChange={setPage}
          onPageSizeChange={() => {
            /* noop */
          }}
        />
      )}
    </div>
  );
}

// ---------- Series tab ----------

type MergedSeriesEntry =
  | { kind: "local"; book: LocalBook; position: string | null }
  | {
      kind: "external";
      foreignBookId: number;
      title: string;
      slug: string | null;
      position: string | null;
      releaseDate: string | null;
      releaseYear: number | null;
      rating: number | null;
      usersCount: number | null;
      coverUrl: string | null;
      authorName: string | null;
      editions: HardcoverRawSeriesBookEdition[];
    };

/** Deduplicate entries sharing the same series position, keeping the one with the highest usersCount. */
function dedupeByPosition(entries: MergedSeriesEntry[]): MergedSeriesEntry[] {
  const byPosition = new Map<string, MergedSeriesEntry>();
  const noPosition: MergedSeriesEntry[] = [];
  for (const entry of entries) {
    if (!entry.position) {
      noPosition.push(entry);
      continue;
    }
    const existing = byPosition.get(entry.position);
    if (!existing) {
      byPosition.set(entry.position, entry);
      continue;
    }
    // Always prefer local entries over external ones at the same position
    if (existing.kind === "local" && entry.kind === "external") {
      continue;
    }
    if (entry.kind === "local" && existing.kind === "external") {
      byPosition.set(entry.position, entry);
      continue;
    }
    // Same kind — keep the one with more usersCount
    const existingUsers =
      existing.kind === "local"
        ? (existing.book.usersCount ?? 0)
        : (existing.usersCount ?? 0);
    const entryUsers =
      entry.kind === "local"
        ? (entry.book.usersCount ?? 0)
        : (entry.usersCount ?? 0);
    if (entryUsers > existingUsers) {
      byPosition.set(entry.position, entry);
    }
  }
  const deduped = [...byPosition.values(), ...noPosition];
  deduped.sort((a, b) => {
    const posA = a.position
      ? Number.parseFloat(a.position)
      : Number.POSITIVE_INFINITY;
    const posB = b.position
      ? Number.parseFloat(b.position)
      : Number.POSITIVE_INFINITY;
    if (posA !== posB) {
      return posA - posB;
    }
    const titleA = a.kind === "local" ? a.book.title : a.title;
    const titleB = b.kind === "local" ? b.book.title : b.title;
    return titleA.localeCompare(titleB);
  });
  return deduped;
}

// oxlint-disable-next-line complexity -- Series tab merges local/external data with expand/collapse UI
function SeriesTab({
  seriesList,
  books,
  currentAuthorId,
  availableLanguages,
  enabled,
  authorQualityProfiles,
}: {
  seriesList: AuthorSeries[];
  books: LocalBook[];
  currentAuthorId: number;
  availableLanguages: LanguageOption[];
  enabled: boolean;
  authorQualityProfiles: QualityProfileInfo[];
}) {
  const toggleBookProfile = useToggleBookProfile();
  const navigate = useNavigate();
  const [expandedId, setExpandedId] = useState<number | undefined>(undefined);
  const [language, setLanguage] = useState(
    availableLanguages.length > 0 ? availableLanguages[0].languageCode : "all",
  );
  const [previewBook, setPreviewBook] = useState<
    HardcoverSearchItem | undefined
  >(undefined);
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );

  const handleSearchChange = (value: string) => {
    setSearchInput(value);
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
  };

  const bookMap = useMemo(() => {
    const map = new Map<number, LocalBook>();
    for (const b of books) {
      map.set(b.id, b);
    }
    return map;
  }, [books]);

  const localForeignBookIds = useMemo(() => {
    const set = new Set<number>();
    for (const b of books) {
      if (b.foreignBookId) {
        set.add(Number(b.foreignBookId));
      }
    }
    return set;
  }, [books]);

  const foreignSeriesIds = useMemo(
    () =>
      seriesList
        .map((s) => (s.foreignSeriesId ? Number(s.foreignSeriesId) : null))
        .filter((id): id is number => id !== null && Number.isFinite(id)),
    [seriesList],
  );

  const { data: hardcoverSeries, isLoading: isLoadingSeries } = useQuery({
    ...hardcoverSeriesCompleteQuery(foreignSeriesIds),
    enabled: enabled && foreignSeriesIds.length > 0,
  });

  const hardcoverSeriesMap = useMemo(() => {
    const map = new Map<
      number,
      Array<{
        foreignBookId: number;
        title: string;
        slug: string | null;
        position: string | null;
        releaseDate: string | null;
        releaseYear: number | null;
        rating: number | null;
        usersCount: number | null;
        coverUrl: string | null;
        authorName: string | null;
        editions: HardcoverRawSeriesBookEdition[];
      }>
    >();
    if (!hardcoverSeries) {
      return map;
    }
    for (const s of hardcoverSeries) {
      map.set(s.foreignSeriesId, s.books);
    }
    return map;
  }, [hardcoverSeries]);

  const getSeriesEntries = (s: AuthorSeries): MergedSeriesEntry[] => {
    const entries: MergedSeriesEntry[] = [];

    for (const sb of s.books) {
      const book = bookMap.get(sb.bookId);
      if (!book) {
        continue;
      }
      if (
        language !== "all" &&
        book.languageCodes.length > 0 &&
        !book.languageCodes.includes(language)
      ) {
        continue;
      }
      entries.push({ kind: "local", book, position: sb.position });
    }

    const foreignId = s.foreignSeriesId ? Number(s.foreignSeriesId) : null;
    if (foreignId !== null) {
      const hcBooks = hardcoverSeriesMap.get(foreignId) ?? [];
      for (const hcBook of hcBooks) {
        if (localForeignBookIds.has(hcBook.foreignBookId)) {
          continue;
        }
        // Filter by language: skip external books that don't have an
        // edition in the selected language. Unlike local books, if we
        // can't confirm the language (no editions), we exclude them.
        if (
          language !== "all" &&
          !hcBook.editions.some((e) => e.languageCode === language)
        ) {
          continue;
        }
        entries.push({ kind: "external", ...hcBook });
      }
    }

    return dedupeByPosition(entries);
  };

  // Precompute entry counts per series so we can filter out empty ones and show counts.
  const seriesWithCounts = useMemo(
    () => {
      const q = searchQuery.toLowerCase();
      const result: Array<{ series: AuthorSeries; entryCount: number }> = [];
      for (const s of seriesList) {
        if (q && !s.title.toLowerCase().includes(q)) {
          continue;
        }
        const count = getSeriesEntries(s).length;
        if (count > 0) {
          result.push({ series: s, entryCount: count });
        }
      }
      // Sort by aggregate readers descending
      result.sort((a, b) => {
        const aEntries = getSeriesEntries(a.series);
        const bEntries = getSeriesEntries(b.series);
        let aReaders = 0;
        for (const e of aEntries) {
          aReaders +=
            e.kind === "local" ? (e.book.usersCount ?? 0) : (e.usersCount ?? 0);
        }
        let bReaders = 0;
        for (const e of bEntries) {
          bReaders +=
            e.kind === "local" ? (e.book.usersCount ?? 0) : (e.usersCount ?? 0);
        }
        return bReaders - aReaders;
      });
      return result;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- getSeriesEntries depends on language, bookMap, hardcoverSeriesMap, localForeignBookIds
    [
      seriesList,
      language,
      bookMap,
      hardcoverSeriesMap,
      localForeignBookIds,
      searchQuery,
    ],
  );

  const openPreview = (
    entry: MergedSeriesEntry & { kind: "external" },
    displayTitle: string,
    displayCover: string | null,
  ) => {
    setPreviewBook({
      id: String(entry.foreignBookId),
      type: "book",
      slug: entry.slug || null,
      title: displayTitle,
      subtitle: entry.authorName,
      description: null,
      releaseYear: entry.releaseYear ?? null,
      readers: entry.usersCount ?? null,
      coverUrl: displayCover ?? entry.coverUrl ?? null,
      hardcoverUrl: entry.slug
        ? `https://hardcover.app/books/${entry.slug}`
        : null,
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="relative w-full sm:max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <Input
            className="pl-8 pr-8 h-9 text-sm"
            placeholder="Filter by series name…"
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
        {availableLanguages.length > 1 && (
          <Select value={language} onValueChange={setLanguage}>
            <SelectTrigger className="h-9 w-[160px] text-sm">
              <SelectValue placeholder="Language" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Languages</SelectItem>
              {availableLanguages.map((l) => (
                <SelectItem key={l.languageCode} value={l.languageCode}>
                  {l.language}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <span className="text-sm text-muted-foreground">
          {seriesWithCounts.length} series
        </span>
      </div>

      {isLoadingSeries && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading series data from Hardcover…
        </div>
      )}

      {seriesWithCounts.length === 0 ? (
        <div className="py-8 text-center text-sm text-muted-foreground">
          {searchQuery
            ? `No series match \u201C${searchQuery}\u201D.`
            : "No series found for this author."}
        </div>
      ) : null}

      {seriesWithCounts.map(({ series: s, entryCount }) => {
        const isExpanded = expandedId === s.id;
        const entries = isExpanded ? getSeriesEntries(s) : [];
        const monitoredCount = s.books.filter(
          (sb) => (bookMap.get(sb.bookId)?.qualityProfileIds?.length ?? 0) > 0,
        ).length;

        return (
          <div key={s.id} className="border rounded-lg">
            <button
              type="button"
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/50 transition-colors cursor-pointer"
              onClick={() => setExpandedId(isExpanded ? undefined : s.id)}
            >
              <div className="flex items-center gap-3">
                <Library className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="font-medium text-sm">{s.title}</span>
                <Badge variant="secondary" className="text-xs">
                  {entryCount} book{entryCount === 1 ? "" : "s"}
                </Badge>
                {monitoredCount > 0 && (
                  <Badge variant="default" className="text-xs">
                    {monitoredCount} monitored
                  </Badge>
                )}
                {s.isCompleted && (
                  <Badge variant="outline" className="text-xs">
                    Complete
                  </Badge>
                )}
              </div>
              <ChevronRight
                className={`h-4 w-4 text-muted-foreground transition-transform ${isExpanded ? "rotate-90" : ""}`}
              />
            </button>

            {isExpanded && (
              <div className="border-t overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10" />
                      <TableHead className="w-12">#</TableHead>
                      <TableHead className="w-14" />
                      <TableHead>Title</TableHead>
                      <TableHead>Release Date</TableHead>
                      <TableHead>Rating</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Pages</TableHead>
                      <TableHead>ISBN 10</TableHead>
                      <TableHead>ISBN 13</TableHead>
                      <TableHead>ASIN</TableHead>
                      <TableHead>Data Score</TableHead>
                      <TableHead>Author</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {/* oxlint-disable-next-line complexity -- Series table row render with local/external variants */}
                    {entries.map((entry) => {
                      if (entry.kind === "local") {
                        const { book, position } = entry;
                        const edition = pickBestEdition(
                          book.editions,
                          language,
                        );
                        const coverUrl =
                          edition?.images?.[0]?.url ?? book.images?.[0]?.url;
                        const displayTitle =
                          !edition || edition.isDefaultCover
                            ? book.title
                            : edition.title;
                        const displayDate =
                          edition?.releaseDate ??
                          book.releaseDate ??
                          (book.releaseYear ? String(book.releaseYear) : "—");
                        return (
                          <TableRow
                            key={`local-${book.id}`}
                            className="cursor-pointer"
                            onClick={() =>
                              navigate({
                                to: "/bookshelf/books/$bookId",
                                params: { bookId: String(book.id) },
                              })
                            }
                          >
                            <TableCell>
                              {(() => {
                                if (book.metadataSourceMissingSince) {
                                  return (
                                    <MetadataWarning
                                      type="book"
                                      missingSince={
                                        book.metadataSourceMissingSince
                                      }
                                      itemId={book.id}
                                      itemTitle={book.title}
                                      fileCount={book.fileCount}
                                      onDeleted={() => router.invalidate()}
                                    />
                                  );
                                }
                                if (book.missingEditionsCount > 0) {
                                  return (
                                    <MetadataWarning
                                      type="book-editions"
                                      missingSince={new Date()}
                                      missingEditionsCount={
                                        book.missingEditionsCount
                                      }
                                      itemId={book.id}
                                      itemTitle={book.title}
                                    />
                                  );
                                }
                                return (
                                  <ProfileToggleIcons
                                    profiles={authorQualityProfiles}
                                    activeProfileIds={book.qualityProfileIds}
                                    onToggle={(profileId) =>
                                      toggleBookProfile.mutate({
                                        bookId: book.id,
                                        qualityProfileId: profileId,
                                      })
                                    }
                                    isPending={toggleBookProfile.isPending}
                                  />
                                );
                              })()}
                            </TableCell>
                            <TableCell className="text-muted-foreground text-xs">
                              {position ?? "—"}
                            </TableCell>
                            <TableCell>
                              {coverUrl ? (
                                <img
                                  src={coverUrl}
                                  alt={displayTitle}
                                  className="aspect-[2/3] w-full rounded-sm object-cover"
                                />
                              ) : (
                                <div className="aspect-[2/3] w-full rounded-sm bg-muted flex items-center justify-center">
                                  <ImageIcon className="h-4 w-4 text-muted-foreground" />
                                </div>
                              )}
                            </TableCell>
                            <TableCell>
                              <span className="font-medium">
                                {displayTitle}
                              </span>
                            </TableCell>
                            <TableCell>{displayDate}</TableCell>
                            <TableCell>
                              {book.rating === null ? (
                                "—"
                              ) : (
                                <span className="inline-flex items-center gap-1">
                                  <Star className="h-3.5 w-3.5 fill-yellow-500 text-yellow-500" />
                                  {book.rating.toFixed(1)}
                                </span>
                              )}
                            </TableCell>
                            <TableCell className="text-muted-foreground">
                              {edition?.format ?? "—"}
                            </TableCell>
                            <TableCell className="text-muted-foreground">
                              {edition?.pageCount ?? "—"}
                            </TableCell>
                            <TableCell className="text-muted-foreground">
                              {edition?.isbn10 ?? "—"}
                            </TableCell>
                            <TableCell className="text-muted-foreground">
                              {edition?.isbn13 ?? "—"}
                            </TableCell>
                            <TableCell className="text-muted-foreground">
                              {edition?.asin ?? "—"}
                            </TableCell>
                            <TableCell className="text-muted-foreground">
                              {edition?.score ?? "—"}
                            </TableCell>
                            <TableCell className="text-muted-foreground">
                              <AdditionalAuthors
                                bookAuthors={book.bookAuthors}
                                currentAuthorId={currentAuthorId}
                              />
                            </TableCell>
                          </TableRow>
                        );
                      }

                      // External book from Hardcover
                      const edition = pickBestEdition(entry.editions, language);
                      const displayTitle =
                        !edition || edition.isDefaultCover
                          ? entry.title
                          : edition.title;
                      const coverUrl = edition?.coverUrl ?? entry.coverUrl;
                      const displayDate =
                        edition?.releaseDate ??
                        entry.releaseDate ??
                        (entry.releaseYear ? String(entry.releaseYear) : "—");
                      return (
                        <TableRow
                          key={`ext-${entry.foreignBookId}`}
                          className="cursor-pointer opacity-60 hover:opacity-100"
                          onClick={() =>
                            openPreview(entry, displayTitle, coverUrl)
                          }
                        >
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={(e) => {
                                e.stopPropagation();
                                openPreview(entry, displayTitle, coverUrl);
                              }}
                            >
                              <Plus className="h-4 w-4" />
                            </Button>
                          </TableCell>
                          <TableCell className="text-muted-foreground text-xs">
                            {entry.position ?? "—"}
                          </TableCell>
                          <TableCell>
                            {coverUrl ? (
                              <img
                                src={coverUrl}
                                alt={displayTitle}
                                className="aspect-[2/3] w-full rounded-sm object-cover"
                              />
                            ) : (
                              <div className="aspect-[2/3] w-full rounded-sm bg-muted flex items-center justify-center">
                                <ImageIcon className="h-4 w-4 text-muted-foreground" />
                              </div>
                            )}
                          </TableCell>
                          <TableCell>
                            <span className="font-medium">{displayTitle}</span>
                          </TableCell>
                          <TableCell>{displayDate}</TableCell>
                          <TableCell>
                            {entry.rating === null ? (
                              "—"
                            ) : (
                              <span className="inline-flex items-center gap-1">
                                <Star className="h-3.5 w-3.5 fill-yellow-500 text-yellow-500" />
                                {entry.rating.toFixed(1)}
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {edition?.format ?? "—"}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {edition?.pageCount ?? "—"}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {edition?.isbn10 ?? "—"}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {edition?.isbn13 ?? "—"}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {edition?.asin ?? "—"}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {edition?.score ?? "—"}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {entry.authorName}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        );
      })}

      {previewBook && (
        <BookPreviewModal
          book={previewBook}
          open
          onOpenChange={(v) => {
            if (!v) {
              setPreviewBook(undefined);
            }
          }}
        />
      )}
    </div>
  );
}

// ---------- Main page ----------

// oxlint-disable-next-line complexity -- Page component manages multiple state variables
function AuthorDetailPage() {
  const { authorId } = Route.useParams();
  const navigate = useNavigate();
  const router = useRouter();

  const authorIdNum = Number(authorId);

  const { data: author } = useSuspenseQuery(authorDetailQuery(authorIdNum));
  const { data: qualityProfiles } = useSuspenseQuery(
    qualityProfilesListQuery(),
  );
  const { data: metadataProfile } = useSuspenseQuery(metadataProfileQuery());

  const [activeTab, setActiveTab] = useState<"books" | "series">("books");
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const updateAuthor = useUpdateAuthor();
  const deleteAuthor = useDeleteAuthor();
  const refreshMetadata = useRefreshAuthorMetadata();

  const books = useMemo(
    () => (author?.books ?? []) as LocalBook[],
    [author?.books],
  );
  const authorSeries = useMemo(
    () => (author?.series ?? []) as AuthorSeries[],
    [author?.series],
  );
  const availableLanguages = useMemo(() => {
    const all = (author?.availableLanguages ?? []) as LanguageOption[];
    const allowedSet = new Set(metadataProfile.allowedLanguages);
    // Intersect: only show languages that are both available on the author AND in the allowed list
    const filtered = all.filter((l) => allowedSet.has(l.languageCode));
    // If nothing remains (e.g., allowed languages don't overlap with author's), fall back to all
    return filtered.length > 0 ? filtered : all;
  }, [author?.availableLanguages, metadataProfile.allowedLanguages]);

  const authorQualityProfiles = useMemo(() => {
    if (!author || !qualityProfiles) {
      return [];
    }
    const profileIdSet = new Set(author.qualityProfileIds);
    return qualityProfiles.filter((p) => profileIdSet.has(p.id));
  }, [author, qualityProfiles]);

  if (!author) {
    return <NotFound />;
  }
  const monitoredCount = books.filter(
    (b) => b.qualityProfileIds.length > 0,
  ).length;

  const hardcoverSlug = author.slug || author.foreignAuthorId;
  const hardcoverUrl = hardcoverSlug
    ? `https://hardcover.app/authors/${hardcoverSlug}`
    : null;

  const lifespan =
    author.bornYear || author.deathYear
      ? `${author.bornYear || "?"}-${author.deathYear || "Present"}`
      : null;

  const handleUpdate = (values: { qualityProfileIds: number[] }) => {
    updateAuthor.mutate(
      { ...values, id: author.id },
      {
        onSuccess: () => {
          setEditOpen(false);
          router.invalidate();
        },
      },
    );
  };

  const handleDelete = () => {
    deleteAuthor.mutate(author.id, {
      onSuccess: () => navigate({ to: "/bookshelf/authors" }),
    });
  };

  const handleRefreshMetadata = () => {
    refreshMetadata.mutate(author.id, {
      onSuccess: () => router.invalidate(),
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <Button variant="ghost" size="sm" asChild>
          <Link to="/bookshelf/authors">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Authors
          </Link>
        </Button>
      </div>

      <PageHeader
        title={author.name}
        description={lifespan || null}
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={handleRefreshMetadata}
              disabled={refreshMetadata.isPending}
            >
              {refreshMetadata.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 h-4 w-4" />
              )}
              Update Metadata
            </Button>
            <Button variant="outline" onClick={() => setEditOpen(true)}>
              <Pencil className="mr-2 h-4 w-4" />
              Edit
            </Button>
            <Button variant="destructive" onClick={() => setDeleteOpen(true)}>
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </Button>
            {hardcoverUrl && (
              <Button asChild variant="outline">
                <a href={hardcoverUrl} target="_blank" rel="noreferrer">
                  <ExternalLink className="mr-2 h-4 w-4" />
                  Hardcover
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
              imageUrl={author.images?.[0]?.url ?? null}
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
                <span>{books.length}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">Monitored</span>
                <span>{monitoredCount}</span>
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
              {author.status && (
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">Status</span>
                  <span className="capitalize">{author.status}</span>
                </div>
              )}
            </CardContent>
          </Card>

          {author.bio && (
            <Card className="w-full xl:min-w-0 xl:flex-1">
              <CardHeader>
                <CardTitle>Bio</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap max-h-48 overflow-y-auto">
                  {author.bio}
                </p>
              </CardContent>
            </Card>
          )}
        </div>

        <Card>
          <Tabs
            value={activeTab}
            onValueChange={(v) => setActiveTab(v as "books" | "series")}
          >
            <CardHeader className="pb-0">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle>
                    {activeTab === "books" ? "Books" : "Series"}
                  </CardTitle>
                  <CardDescription className="mt-1" />
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
                  books={books}
                  currentAuthorId={authorIdNum}
                  availableLanguages={availableLanguages}
                  authorQualityProfiles={authorQualityProfiles}
                />
              </TabsContent>
              <TabsContent value="series" className="mt-0">
                <SeriesTab
                  seriesList={authorSeries}
                  books={books}
                  currentAuthorId={authorIdNum}
                  availableLanguages={availableLanguages}
                  enabled={activeTab === "series"}
                  authorQualityProfiles={authorQualityProfiles}
                />
              </TabsContent>
            </CardContent>
          </Tabs>
        </Card>
      </div>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit Author</DialogTitle>
          </DialogHeader>
          <AuthorForm
            initialValues={{
              qualityProfileIds: author.qualityProfileIds ?? [],
            }}
            qualityProfiles={qualityProfiles}
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

// ---------- Root component ----------

function AuthorPage() {
  return <AuthorDetailPage />;
}
