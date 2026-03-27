import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  createFileRoute,
  Link,
  notFound,
  useNavigate,
  useRouter,
} from "@tanstack/react-router";
import {
  useInfiniteQuery,
  useQuery,
  useSuspenseQuery,
} from "@tanstack/react-query";
import {
  ArrowLeft,
  ChevronRight,
  Library,
  Loader2,
  Plus,
  Search,
  Star,
  X,
} from "lucide-react";
import PageHeader from "src/components/shared/page-header";
import ActionButtonGroup from "src/components/shared/action-button-group";
import Skeleton from "src/components/ui/skeleton";
import OptimizedImage from "src/components/shared/optimized-image";
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
import AuthorForm from "src/components/bookshelf/authors/author-form";
import ConfirmDialog from "src/components/shared/confirm-dialog";
import AdditionalAuthors from "src/components/bookshelf/books/additional-authors";
import BookPreviewModal from "src/components/bookshelf/hardcover/book-preview-modal";
import BaseBookTable from "src/components/bookshelf/books/base-book-table";
import type {
  BookTableRow,
  ColumnKey,
} from "src/components/bookshelf/books/base-book-table";
import { BookTableRowsSkeleton } from "src/components/shared/loading-skeleton";
import { useTableColumns } from "src/hooks/use-table-columns";
import ColumnSettingsPopover from "src/components/shared/column-settings-popover";
import type { HardcoverSearchItem } from "src/server/search";
import {
  authorDetailQuery,
  authorBooksInfiniteQuery,
  hardcoverSeriesCompleteQuery,
  metadataProfileQuery,
  downloadProfilesListQuery,
} from "src/lib/queries";
import { userSettingsQuery } from "src/lib/queries/user-settings";
import {
  useUpdateAuthor,
  useDeleteAuthor,
  useRefreshAuthorMetadata,
  useMonitorBookProfile,
  useUnmonitorBookProfile,
  useBulkMonitorBookProfile,
  useBulkUnmonitorBookProfile,
} from "src/hooks/mutations";
import UnmonitorDialog from "src/components/bookshelf/books/unmonitor-dialog";
import NotFound from "src/components/NotFound";
import { pickBestEdition } from "src/lib/editions";
import type { HardcoverRawSeriesBookEdition } from "src/server/hardcover/types";
import type { MetadataProfile } from "src/server/metadata-profile";

const SEARCH_DEBOUNCE_MS = 300;

export const Route = createFileRoute("/_authed/authors/$authorId")({
  loader: async ({ params, context }) => {
    const id = Number(params.authorId);
    if (!Number.isFinite(id) || id <= 0) {
      throw notFound();
    }

    const [author] = await Promise.all([
      context.queryClient
        .ensureQueryData(authorDetailQuery(id))
        .catch((error) => {
          if (error instanceof Error && error.message.includes("not found")) {
            throw notFound();
          }
          throw error;
        }),
      context.queryClient.ensureQueryData(downloadProfilesListQuery()),
      context.queryClient.ensureQueryData(metadataProfileQuery()),
      context.queryClient.ensureQueryData(userSettingsQuery("author-books")),
      context.queryClient.ensureQueryData(userSettingsQuery("author-series")),
    ]);
    if (!author) {
      throw notFound();
    }
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
  images: Array<{ url: string; coverType: string }>;
  isDefaultCover: boolean;
  downloadProfileIds: number[];
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
  downloadProfileIds: number[];
  foreignBookId: string | null;
  images: Array<{ url: string; coverType: string }>;
  rating: number | null;
  ratingsCount: number | null;
  usersCount: number | null;
  tags: number[];
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

// ---------- Helpers ----------

// ---------- Books tab ----------

type DownloadProfileInfo = { id: number; name: string; icon: string };

function BooksTab({
  currentAuthorId,
  availableLanguages,
  authorDownloadProfiles,
}: {
  currentAuthorId: number;
  availableLanguages: LanguageOption[];
  authorDownloadProfiles: DownloadProfileInfo[];
}) {
  const router = useRouter();
  const monitorBookProfile = useMonitorBookProfile();
  const unmonitorBookProfile = useUnmonitorBookProfile();
  const navigate = useNavigate();
  const { visibleColumns } = useTableColumns("author-books");

  const columns = useMemo(
    () =>
      visibleColumns.map((col) => ({
        key: col.key as ColumnKey,
        sortable:
          col.key === "title" ||
          col.key === "releaseDate" ||
          col.key === "series" ||
          col.key === "readers" ||
          col.key === "rating",
      })),
    [visibleColumns],
  );

  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [unmonitorTarget, setUnmonitorTarget] = useState<{
    bookId: number;
    downloadProfileId: number;
    bookTitle: string;
    profileName: string;
    fileCount: number;
  } | null>(null);
  const [language, setLanguage] = useState(
    availableLanguages.length > 0 ? availableLanguages[0].languageCode : "all",
  );
  const [sortKey, setSortKey] = useState<string>("readers");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const sentinelRef = useRef<HTMLDivElement>(null);

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

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const { data, isFetchingNextPage, hasNextPage, fetchNextPage } =
    useInfiniteQuery(
      authorBooksInfiniteQuery(
        currentAuthorId,
        searchQuery,
        language,
        sortKey,
        sortDir,
      ),
    );

  const items = useMemo(
    () => data?.pages.flatMap((p) => p.items) ?? [],
    [data],
  );
  const total = data?.pages[0]?.total ?? 0;

  const handleObserver = useCallback(
    (entries: IntersectionObserverEntry[]) => {
      if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) {
        fetchNextPage();
      }
    },
    [hasNextPage, isFetchingNextPage, fetchNextPage],
  );

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) {
      return;
    }
    const observer = new IntersectionObserver(handleObserver, {
      rootMargin: "200px",
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [handleObserver]);

  const rows: BookTableRow[] = useMemo(
    () =>
      items.map((item) => ({
        key: item.id,
        bookId: item.id,
        title: item.title,
        coverUrl: item.coverUrl,
        bookAuthors: item.bookAuthors,
        authorName: item.authorName,
        releaseDate: item.releaseDate,
        usersCount: item.usersCount,
        rating: item.rating,
        ratingsCount: item.ratingsCount,
        format: item.format,
        pageCount: item.pageCount,
        audioLength: null,
        isbn10: item.isbn10,
        isbn13: item.isbn13,
        asin: item.asin,
        score: item.score,
        publisher: item.publisher,
        editionInformation: item.editionInformation,
        language: item.language,
        country: item.country,
        series: item.series,
        monitored: item.downloadProfileIds.length > 0,
        downloadProfileIds: item.downloadProfileIds,
      })),
    [items],
  );

  // Build metadata warning info map
  const metaMap = useMemo(() => {
    const map = new Map<
      number,
      {
        metadataSourceMissingSince: Date | null;
        missingEditionsCount: number;
        fileCount: number;
        title: string;
      }
    >();
    for (const item of items) {
      map.set(item.id, {
        metadataSourceMissingSince: item.metadataSourceMissingSince,
        missingEditionsCount: item.missingEditionsCount,
        fileCount: item.fileCount,
        title: item.title,
      });
    }
    return map;
  }, [items]);

  const renderLeadingCell = (row: BookTableRow) => {
    const meta = metaMap.get(row.bookId);
    if (meta?.metadataSourceMissingSince) {
      return (
        <MetadataWarning
          type="book"
          missingSince={meta.metadataSourceMissingSince}
          itemId={row.bookId}
          itemTitle={meta.title}
          fileCount={meta.fileCount}
          onDeleted={() => router.invalidate()}
        />
      );
    }
    if (meta && meta.missingEditionsCount > 0) {
      return (
        <MetadataWarning
          type="book-editions"
          missingSince={new Date()}
          missingEditionsCount={meta.missingEditionsCount}
          itemId={row.bookId}
          itemTitle={meta.title}
        />
      );
    }
    return (
      <ProfileToggleIcons
        profiles={authorDownloadProfiles}
        activeProfileIds={row.downloadProfileIds}
        onToggle={(profileId) => {
          const isActive = row.downloadProfileIds.includes(profileId);
          if (isActive) {
            const profile = authorDownloadProfiles.find(
              (p) => p.id === profileId,
            );
            setUnmonitorTarget({
              bookId: row.bookId,
              downloadProfileId: profileId,
              bookTitle: row.title,
              profileName: profile?.name ?? "Unknown",
              fileCount: meta?.fileCount ?? 0,
            });
          } else {
            monitorBookProfile.mutate({
              bookId: row.bookId,
              downloadProfileId: profileId,
            });
          }
        }}
      />
    );
  };

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
          <span className="text-sm text-muted-foreground whitespace-nowrap">
            {total} book{total === 1 ? "" : "s"}
          </span>
          <ColumnSettingsPopover tableId="author-books" />
        </div>
      </div>

      <div className="overflow-x-auto">
        <BaseBookTable
          rows={rows}
          columns={columns}
          sortKey={sortKey}
          sortDir={sortDir}
          onSort={handleSort}
          renderLeadingCell={renderLeadingCell}
          currentAuthorId={currentAuthorId}
          onRowClick={(row) =>
            navigate({
              to: "/books/$bookId",
              params: { bookId: String(row.bookId) },
            })
          }
          emptyMessage={
            searchQuery
              ? `No books match \u201C${searchQuery}\u201D.`
              : "No books found for this author."
          }
        >
          {isFetchingNextPage && (
            <BookTableRowsSkeleton columns={columns.length} hasLeadingCell />
          )}
        </BaseBookTable>
        <div ref={sentinelRef} className="h-1" />
      </div>

      <UnmonitorDialog
        open={unmonitorTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setUnmonitorTarget(null);
          }
        }}
        profileName={unmonitorTarget?.profileName ?? ""}
        itemTitle={unmonitorTarget?.bookTitle ?? ""}
        itemType="book"
        fileCount={unmonitorTarget?.fileCount ?? 0}
        onConfirm={(deleteFiles) => {
          if (unmonitorTarget) {
            unmonitorBookProfile.mutate(
              {
                bookId: unmonitorTarget.bookId,
                downloadProfileId: unmonitorTarget.downloadProfileId,
                deleteFiles,
              },
              { onSuccess: () => setUnmonitorTarget(null) },
            );
          }
        }}
        isPending={unmonitorBookProfile.isPending}
      />
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

/** Remove fractional-position entries whose title starts with the integer-position parent's title (partial editions). */
function filterPartialEditions(
  entries: MergedSeriesEntry[],
): MergedSeriesEntry[] {
  const integerPositionTitles = new Map<number, string>();
  for (const entry of entries) {
    if (!entry.position) {
      continue;
    }
    const pos = Number.parseFloat(entry.position);
    if (!Number.isFinite(pos) || !Number.isInteger(pos)) {
      continue;
    }
    const title = entry.kind === "local" ? entry.book.title : entry.title;
    integerPositionTitles.set(pos, title);
  }
  return entries.filter((entry) => {
    if (!entry.position) {
      return true;
    }
    const pos = Number.parseFloat(entry.position);
    if (!Number.isFinite(pos) || Number.isInteger(pos)) {
      return true;
    }
    const intPos = Math.floor(pos);
    const parentTitle = integerPositionTitles.get(intPos);
    if (!parentTitle) {
      return true;
    }
    const title = entry.kind === "local" ? entry.book.title : entry.title;
    return !title.toLowerCase().startsWith(parentTitle.toLowerCase());
  });
}

// ---------- Series column registry ----------

type SeriesRowData = {
  position: string | null;
  coverUrl: string | null;
  displayTitle: string;
  displayDate: string;
  usersCount: number | null;
  rating: number | null;
  ratingsCount: number | null;
  format: string | null;
  pageCount: number | null;
  isbn10: string | null;
  isbn13: string | null;
  asin: string | null;
  score: number | null;
  /** For local books: bookAuthors array; for external: authorName string */
  bookAuthors: BookAuthorEntry[];
  authorName: string | null;
};

type SeriesColumnKey =
  | "monitored"
  | "cover"
  | "position"
  | "title"
  | "releaseDate"
  | "readers"
  | "rating"
  | "format"
  | "pages"
  | "isbn10"
  | "isbn13"
  | "asin"
  | "score"
  | "author";

type SeriesColumnDef = {
  label: string;
  render: (row: SeriesRowData, currentAuthorId?: number) => ReactNode;
  headerClassName?: string;
  cellClassName?: string;
};

const SERIES_COLUMN_REGISTRY: Record<
  Exclude<SeriesColumnKey, "monitored" | "cover">,
  SeriesColumnDef
> = {
  position: {
    label: "#",
    render: (row) => (
      <span className="text-muted-foreground text-xs">
        {row.position ?? "—"}
      </span>
    ),
    headerClassName: "w-12",
  },
  title: {
    label: "Title",
    render: (row) => <span className="font-medium">{row.displayTitle}</span>,
  },
  releaseDate: {
    label: "Release Date",
    render: (row) => row.displayDate,
  },
  readers: {
    label: "Readers",
    render: (row) =>
      row.usersCount !== null && row.usersCount !== undefined
        ? row.usersCount.toLocaleString()
        : "—",
  },
  rating: {
    label: "Rating",
    render: (row) =>
      row.rating === null ? (
        "—"
      ) : (
        <span className="inline-flex items-center gap-1">
          <Star className="h-3.5 w-3.5 fill-yellow-500 text-yellow-500" />
          {row.rating.toFixed(1)}
          {row.ratingsCount !== null &&
            row.ratingsCount !== undefined &&
            row.ratingsCount > 0 && (
              <span className="text-muted-foreground">
                ({row.ratingsCount.toLocaleString()})
              </span>
            )}
        </span>
      ),
  },
  format: {
    label: "Type",
    render: (row) => row.format ?? "—",
    cellClassName: "text-muted-foreground",
  },
  pages: {
    label: "Pages",
    render: (row) => row.pageCount ?? "—",
    cellClassName: "text-muted-foreground",
  },
  isbn10: {
    label: "ISBN 10",
    render: (row) => row.isbn10 ?? "—",
    cellClassName: "text-muted-foreground",
  },
  isbn13: {
    label: "ISBN-13",
    render: (row) => row.isbn13 ?? "—",
    cellClassName: "text-muted-foreground",
  },
  asin: {
    label: "ASIN",
    render: (row) => row.asin ?? "—",
    cellClassName: "text-muted-foreground",
  },
  score: {
    label: "Data Score",
    render: (row) => row.score ?? "—",
    cellClassName: "text-muted-foreground",
  },
  author: {
    label: "Author",
    render: (row, currentAuthorId) =>
      row.bookAuthors.length > 0 ? (
        <AdditionalAuthors
          bookAuthors={row.bookAuthors}
          currentAuthorId={currentAuthorId}
        />
      ) : (
        row.authorName
      ),
    cellClassName: "text-muted-foreground",
  },
};

// oxlint-disable-next-line complexity -- Series tab merges local/external data with expand/collapse UI
function SeriesTab({
  seriesList,
  books,
  currentAuthorId,
  foreignAuthorId,
  availableLanguages,
  enabled,
  authorDownloadProfiles,
  metadataProfile,
}: {
  seriesList: AuthorSeries[];
  books: LocalBook[];
  currentAuthorId: number;
  foreignAuthorId: string | null;
  availableLanguages: LanguageOption[];
  enabled: boolean;
  authorDownloadProfiles: DownloadProfileInfo[];
  metadataProfile: MetadataProfile;
}) {
  const router = useRouter();
  const monitorBookProfile = useMonitorBookProfile();
  const unmonitorBookProfile = useUnmonitorBookProfile();
  const navigate = useNavigate();
  const { visibleColumns: seriesVisibleColumns } =
    useTableColumns("author-series");
  const [expandedId, setExpandedId] = useState<number | undefined>(undefined);
  const [language, setLanguage] = useState(
    availableLanguages.length > 0 ? availableLanguages[0].languageCode : "all",
  );
  const [previewBook, setPreviewBook] = useState<
    HardcoverSearchItem | undefined
  >(undefined);
  const [unmonitorTarget, setUnmonitorTarget] = useState<{
    bookId: number;
    downloadProfileId: number;
    bookTitle: string;
    profileName: string;
    fileCount: number;
  } | null>(null);
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

  const excludeForeignAuthorId = foreignAuthorId
    ? Number(foreignAuthorId)
    : undefined;

  const { data: hardcoverSeries, isLoading: isLoadingSeries } = useQuery({
    ...hardcoverSeriesCompleteQuery(foreignSeriesIds, excludeForeignAuthorId),
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
        (book.languageCodes.length === 0 ||
          !book.languageCodes.includes(language))
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

        // Apply metadata profile filters to external book editions
        let qualifyingEditions = hcBook.editions;
        if (metadataProfile.skipMissingIsbnAsin) {
          qualifyingEditions = qualifyingEditions.filter(
            (e) => e.isbn10 || e.isbn13 || e.asin,
          );
        }
        if (metadataProfile.skipMissingReleaseDate) {
          qualifyingEditions = qualifyingEditions.filter((e) => e.releaseDate);
        }
        // Skip the book if no qualifying editions remain
        if (qualifyingEditions.length === 0) {
          continue;
        }
        // Skip the book itself if it has no release date (book-level check)
        if (metadataProfile.skipMissingReleaseDate && !hcBook.releaseDate) {
          continue;
        }

        entries.push({ kind: "external", ...hcBook });
      }
    }

    return filterPartialEditions(dedupeByPosition(entries));
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- getSeriesEntries depends on language, bookMap, hardcoverSeriesMap, localForeignBookIds, metadataProfile
    [
      seriesList,
      language,
      bookMap,
      hardcoverSeriesMap,
      localForeignBookIds,
      searchQuery,
      metadataProfile,
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
        <ColumnSettingsPopover tableId="author-series" />
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
          (sb) => (bookMap.get(sb.bookId)?.downloadProfileIds?.length ?? 0) > 0,
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
                      {seriesVisibleColumns.map((col) => {
                        if (col.key === "monitored") {
                          return <TableHead key={col.key} className="w-10" />;
                        }
                        if (col.key === "cover") {
                          return <TableHead key={col.key} className="w-14" />;
                        }
                        const def =
                          SERIES_COLUMN_REGISTRY[
                            col.key as keyof typeof SERIES_COLUMN_REGISTRY
                          ];
                        return (
                          <TableHead
                            key={col.key}
                            className={def?.headerClassName}
                          >
                            {def?.label ?? col.label}
                          </TableHead>
                        );
                      })}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {/* oxlint-disable-next-line complexity -- Series table row render with local/external variants and column iteration */}
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

                        const rowData: SeriesRowData = {
                          position,
                          coverUrl: coverUrl ?? null,
                          displayTitle,
                          displayDate,
                          usersCount: book.usersCount,
                          rating: book.rating,
                          ratingsCount: book.ratingsCount,
                          format: edition?.format ?? null,
                          pageCount: edition?.pageCount ?? null,
                          isbn10: edition?.isbn10 ?? null,
                          isbn13: edition?.isbn13 ?? null,
                          asin: edition?.asin ?? null,
                          score: edition?.score ?? null,
                          bookAuthors: book.bookAuthors,
                          authorName: book.authorName,
                        };

                        return (
                          <TableRow
                            key={`local-${book.id}`}
                            className="cursor-pointer"
                            onClick={() =>
                              navigate({
                                to: "/books/$bookId",
                                params: { bookId: String(book.id) },
                              })
                            }
                          >
                            {seriesVisibleColumns.map((col) => {
                              if (col.key === "monitored") {
                                return (
                                  <TableCell key={col.key}>
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
                                            onDeleted={() =>
                                              router.invalidate()
                                            }
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
                                          profiles={authorDownloadProfiles}
                                          activeProfileIds={
                                            book.downloadProfileIds
                                          }
                                          onToggle={(profileId) => {
                                            const isActive =
                                              book.downloadProfileIds.includes(
                                                profileId,
                                              );
                                            if (isActive) {
                                              const profile =
                                                authorDownloadProfiles.find(
                                                  (p) => p.id === profileId,
                                                );
                                              setUnmonitorTarget({
                                                bookId: book.id,
                                                downloadProfileId: profileId,
                                                bookTitle: book.title,
                                                profileName:
                                                  profile?.name ?? "Unknown",
                                                fileCount: book.fileCount,
                                              });
                                            } else {
                                              monitorBookProfile.mutate({
                                                bookId: book.id,
                                                downloadProfileId: profileId,
                                              });
                                            }
                                          }}
                                        />
                                      );
                                    })()}
                                  </TableCell>
                                );
                              }
                              if (col.key === "cover") {
                                return (
                                  <TableCell
                                    key={col.key}
                                    className="min-w-14 w-14"
                                  >
                                    <OptimizedImage
                                      src={rowData.coverUrl}
                                      alt={rowData.displayTitle}
                                      type="book"
                                      width={56}
                                      height={84}
                                      className="aspect-[2/3] w-full rounded-sm"
                                    />
                                  </TableCell>
                                );
                              }
                              const def =
                                SERIES_COLUMN_REGISTRY[
                                  col.key as keyof typeof SERIES_COLUMN_REGISTRY
                                ];
                              if (!def) {
                                return <TableCell key={col.key} />;
                              }
                              return (
                                <TableCell
                                  key={col.key}
                                  className={def.cellClassName}
                                >
                                  {def.render(rowData, currentAuthorId)}
                                </TableCell>
                              );
                            })}
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

                      const rowData: SeriesRowData = {
                        position: entry.position,
                        coverUrl: coverUrl ?? null,
                        displayTitle,
                        displayDate,
                        usersCount: entry.usersCount,
                        rating: entry.rating,
                        ratingsCount: null,
                        format: edition?.format ?? null,
                        pageCount: edition?.pageCount ?? null,
                        isbn10: edition?.isbn10 ?? null,
                        isbn13: edition?.isbn13 ?? null,
                        asin: edition?.asin ?? null,
                        score: edition?.score ?? null,
                        bookAuthors: [],
                        authorName: entry.authorName,
                      };

                      return (
                        <TableRow
                          key={`ext-${entry.foreignBookId}`}
                          className="cursor-pointer opacity-60 hover:opacity-100"
                          onClick={() =>
                            openPreview(entry, displayTitle, coverUrl)
                          }
                        >
                          {seriesVisibleColumns.map((col) => {
                            if (col.key === "monitored") {
                              return (
                                <TableCell key={col.key}>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      openPreview(
                                        entry,
                                        displayTitle,
                                        coverUrl,
                                      );
                                    }}
                                  >
                                    <Plus className="h-4 w-4" />
                                  </Button>
                                </TableCell>
                              );
                            }
                            if (col.key === "cover") {
                              return (
                                <TableCell
                                  key={col.key}
                                  className="min-w-14 w-14"
                                >
                                  <OptimizedImage
                                    src={rowData.coverUrl}
                                    alt={rowData.displayTitle}
                                    type="book"
                                    width={56}
                                    height={84}
                                    className="aspect-[2/3] w-full rounded-sm"
                                  />
                                </TableCell>
                              );
                            }
                            const def =
                              SERIES_COLUMN_REGISTRY[
                                col.key as keyof typeof SERIES_COLUMN_REGISTRY
                              ];
                            if (!def) {
                              return <TableCell key={col.key} />;
                            }
                            return (
                              <TableCell
                                key={col.key}
                                className={def.cellClassName}
                              >
                                {def.render(rowData, currentAuthorId)}
                              </TableCell>
                            );
                          })}
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

      <UnmonitorDialog
        open={unmonitorTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setUnmonitorTarget(null);
          }
        }}
        profileName={unmonitorTarget?.profileName ?? ""}
        itemTitle={unmonitorTarget?.bookTitle ?? ""}
        itemType="book"
        fileCount={unmonitorTarget?.fileCount ?? 0}
        onConfirm={(deleteFiles) => {
          if (unmonitorTarget) {
            unmonitorBookProfile.mutate(
              {
                bookId: unmonitorTarget.bookId,
                downloadProfileId: unmonitorTarget.downloadProfileId,
                deleteFiles,
              },
              { onSuccess: () => setUnmonitorTarget(null) },
            );
          }
        }}
        isPending={unmonitorBookProfile.isPending}
      />
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
  const { data: downloadProfiles } = useSuspenseQuery(
    downloadProfilesListQuery(),
  );
  const { data: metadataProfile } = useSuspenseQuery(metadataProfileQuery());

  const [activeTab, setActiveTab] = useState<"books" | "series">("books");
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [authorUnmonitorProfileId, setAuthorUnmonitorProfileId] = useState<
    number | null
  >(null);

  const updateAuthor = useUpdateAuthor();
  const deleteAuthor = useDeleteAuthor();
  const refreshMetadata = useRefreshAuthorMetadata();
  const bulkMonitorBook = useBulkMonitorBookProfile();
  const bulkUnmonitorBook = useBulkUnmonitorBookProfile();

  const books = useMemo(
    () => (author?.books ?? []) as LocalBook[],
    [author?.books],
  );
  const authorSeries = useMemo(
    () => (author?.series ?? []) as AuthorSeries[],
    [author?.series],
  );
  const profileLanguages = useMemo(() => {
    const langs = (downloadProfiles ?? []).map((p) => p.language);
    return [...new Set(langs)];
  }, [downloadProfiles]);

  const availableLanguages = useMemo(() => {
    const all = (author?.availableLanguages ?? []) as LanguageOption[];
    const allowedSet = new Set(profileLanguages);
    // Intersect: only show languages that are both available on the author AND in the profile languages
    const filtered = all.filter((l) => allowedSet.has(l.languageCode));
    // If nothing remains (e.g., profile languages don't overlap with author's), fall back to all
    return filtered.length > 0 ? filtered : all;
  }, [author?.availableLanguages, profileLanguages]);

  const authorDownloadProfiles = useMemo(() => {
    if (!author || !downloadProfiles) {
      return [];
    }
    const profileIdSet = new Set(author.downloadProfileIds);
    return downloadProfiles.filter((p) => profileIdSet.has(p.id));
  }, [author, downloadProfiles]);

  const bookDownloadProfiles = useMemo(
    () =>
      downloadProfiles?.filter(
        (p) => p.contentType === "ebook" || p.contentType === "audiobook",
      ) ?? [],
    [downloadProfiles],
  );

  // Compute per-profile monitoring state across all books (like TV show header)
  const authorActiveProfileIds = useMemo(
    () =>
      authorDownloadProfiles
        .filter(
          (p) =>
            books.length > 0 &&
            books.every((b) => b.downloadProfileIds.includes(p.id)),
        )
        .map((p) => p.id),
    [authorDownloadProfiles, books],
  );

  const authorPartialProfileIds = useMemo(
    () =>
      authorDownloadProfiles
        .filter(
          (p) =>
            !authorActiveProfileIds.includes(p.id) &&
            books.some((b) => b.downloadProfileIds.includes(p.id)),
        )
        .map((p) => p.id),
    [authorDownloadProfiles, authorActiveProfileIds, books],
  );

  if (!author) {
    return <NotFound />;
  }
  const monitoredCount = books.filter(
    (b) => b.downloadProfileIds.length > 0,
  ).length;

  const handleAuthorProfileToggle = (profileId: number) => {
    const isActive = authorActiveProfileIds.includes(profileId);
    if (isActive) {
      setAuthorUnmonitorProfileId(profileId);
    } else {
      // Partial or inactive — monitor all books for this profile
      const bookIds = books.map((b) => b.id);
      bulkMonitorBook.mutate(
        { bookIds, downloadProfileId: profileId },
        { onSuccess: () => router.invalidate() },
      );
    }
  };

  const handleAuthorUnmonitorConfirm = (deleteFiles: boolean) => {
    if (authorUnmonitorProfileId === null) {
      return;
    }
    const bookIds = books.map((b) => b.id);
    bulkUnmonitorBook.mutate(
      { bookIds, downloadProfileId: authorUnmonitorProfileId, deleteFiles },
      {
        onSuccess: () => {
          setAuthorUnmonitorProfileId(null);
          router.invalidate();
        },
      },
    );
  };

  const hardcoverSlug = author.slug || author.foreignAuthorId;
  const hardcoverUrl = hardcoverSlug
    ? `https://hardcover.app/authors/${hardcoverSlug}`
    : null;

  const lifespan =
    author.bornYear || author.deathYear
      ? `${author.bornYear || "?"}-${author.deathYear || "Present"}`
      : null;

  const handleUpdate = (values: {
    downloadProfileIds: number[];
    monitorNewBooks: "all" | "none" | "new";
  }) => {
    updateAuthor.mutate(
      {
        id: author.id,
        downloadProfileIds: values.downloadProfileIds,
        monitorNewBooks: values.monitorNewBooks,
      },
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
      onSuccess: () => navigate({ to: "/authors" }),
    });
  };

  const handleRefreshMetadata = () => {
    refreshMetadata.mutate(author.id, {
      onSuccess: () => router.invalidate(),
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Link
          to="/authors"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Authors
        </Link>
        <ActionButtonGroup
          onRefreshMetadata={handleRefreshMetadata}
          isRefreshing={refreshMetadata.isPending}
          onEdit={() => setEditOpen(true)}
          onDelete={() => setDeleteOpen(true)}
          externalUrl={hardcoverUrl}
          externalLabel="Open in Hardcover"
        />
      </div>

      <div className="flex items-start gap-3">
        {authorDownloadProfiles.length > 0 && (
          <ProfileToggleIcons
            profiles={authorDownloadProfiles}
            activeProfileIds={authorActiveProfileIds}
            partialProfileIds={authorPartialProfileIds}
            onToggle={handleAuthorProfileToggle}
            size="lg"
            direction="vertical"
          />
        )}
        <div className="flex-1 min-w-0">
          <PageHeader title={author.name} description={lifespan || null} />
        </div>
      </div>

      <div className="space-y-6">
        <div className="flex flex-col gap-6 xl:flex-row">
          <div className="w-full xl:w-auto xl:shrink-0">
            <OptimizedImage
              src={author.images?.[0]?.url ?? null}
              alt={`${author.name} photo`}
              type="author"
              width={176}
              height={234}
              priority
              className="aspect-[3/4] w-full max-w-56 xl:h-full xl:max-w-none xl:w-44 xl:aspect-auto"
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
                  currentAuthorId={authorIdNum}
                  availableLanguages={availableLanguages}
                  authorDownloadProfiles={authorDownloadProfiles}
                />
              </TabsContent>
              <TabsContent value="series" className="mt-0">
                <SeriesTab
                  seriesList={authorSeries}
                  books={books}
                  currentAuthorId={authorIdNum}
                  foreignAuthorId={author.foreignAuthorId ?? null}
                  availableLanguages={availableLanguages}
                  enabled={activeTab === "series"}
                  authorDownloadProfiles={authorDownloadProfiles}
                  metadataProfile={metadataProfile}
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
              downloadProfileIds: author.downloadProfileIds ?? [],
              monitorNewBooks:
                (author.monitorNewBooks as "all" | "none" | "new") ?? "all",
            }}
            downloadProfiles={bookDownloadProfiles}
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

      <UnmonitorDialog
        open={authorUnmonitorProfileId !== null}
        onOpenChange={(open) => {
          if (!open) {
            setAuthorUnmonitorProfileId(null);
          }
        }}
        profileName={
          authorDownloadProfiles.find((p) => p.id === authorUnmonitorProfileId)
            ?.name ?? ""
        }
        itemTitle={author.name}
        itemType="author"
        fileCount={0}
        onConfirm={handleAuthorUnmonitorConfirm}
        isPending={bulkUnmonitorBook.isPending}
      />
    </div>
  );
}

// ---------- Root component ----------

function AuthorPage() {
  return <AuthorDetailPage />;
}
