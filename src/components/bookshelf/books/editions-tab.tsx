import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { JSX } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { TabsContent } from "src/components/ui/tabs";
import { useToggleEditionProfile } from "src/hooks/mutations";
import ProfileToggleIcons from "src/components/shared/profile-toggle-icons";
import MetadataWarning from "src/components/shared/metadata-warning";
import BaseBookTable from "src/components/bookshelf/books/base-book-table";
import type {
  BookTableRow,
  ColumnConfig,
} from "src/components/bookshelf/books/base-book-table";
import { BookTableRowsSkeleton } from "src/components/shared/loading-skeleton";
import { bookEditionsInfiniteQuery } from "src/lib/queries";

type DownloadProfile = {
  id: number;
  name: string;
  icon: string;
};

const COLUMNS: ColumnConfig[] = [
  { key: "title", sortable: true },
  { key: "publisher", sortable: true },
  { key: "information", sortable: true },
  { key: "format", sortable: true },
  { key: "pages", sortable: true },
  { key: "releaseDate", sortable: true },
  { key: "isbn13", sortable: true },
  { key: "isbn10", sortable: true },
  { key: "asin", sortable: true },
  { key: "language", sortable: true },
  { key: "country", sortable: true },
  { key: "readers", sortable: true },
  { key: "score", sortable: true },
];

export default function EditionsTab({
  bookId,
  authorDownloadProfiles,
}: {
  bookId: number;
  authorDownloadProfiles: DownloadProfile[];
}): JSX.Element {
  const [sortKey, setSortKey] = useState<string>("readers");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const sentinelRef = useRef<HTMLDivElement>(null);

  const toggleEditionProfile = useToggleEditionProfile();

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const { data, isFetchingNextPage, hasNextPage, fetchNextPage } =
    useInfiniteQuery(bookEditionsInfiniteQuery(bookId, sortKey, sortDir));

  const editions = useMemo(
    () => data?.pages.flatMap((p) => p.items) ?? [],
    [data],
  );

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
      editions.map((edition) => ({
        key: edition.id,
        bookId: edition.bookId,
        title: edition.title,
        coverUrl: edition.images?.[0]?.url ?? null,
        bookAuthors: [],
        authorName: null,
        releaseDate: edition.releaseDate,
        usersCount: edition.usersCount,
        rating: null,
        ratingsCount: null,
        format: edition.format,
        pageCount: edition.pageCount,
        audioLength: edition.audioLength ?? null,
        isbn10: edition.isbn10,
        isbn13: edition.isbn13,
        asin: edition.asin,
        score: edition.score,
        publisher: edition.publisher,
        editionInformation: edition.editionInformation,
        language: edition.language,
        country: edition.country,
        series: [],
        monitored: edition.downloadProfileIds.length > 0,
        downloadProfileIds: edition.downloadProfileIds,
      })),
    [editions],
  );

  // Build a map of edition metadata warning info
  const editionMetaMap = useMemo(() => {
    const map = new Map<
      number,
      { metadataSourceMissingSince: Date | null; title: string }
    >();
    for (const edition of editions) {
      map.set(edition.id, {
        metadataSourceMissingSince: edition.metadataSourceMissingSince,
        title: edition.title,
      });
    }
    return map;
  }, [editions]);

  const renderLeadingCell = (row: BookTableRow) => {
    const meta = editionMetaMap.get(row.key as number);
    if (meta?.metadataSourceMissingSince) {
      return (
        <MetadataWarning
          type="edition"
          missingSince={meta.metadataSourceMissingSince}
          itemId={row.key as number}
          itemTitle={meta.title}
        />
      );
    }
    return (
      <ProfileToggleIcons
        profiles={authorDownloadProfiles}
        activeProfileIds={row.downloadProfileIds}
        onToggle={(profileId) =>
          toggleEditionProfile.mutate({
            editionId: row.key as number,
            downloadProfileId: profileId,
          })
        }
        isPending={toggleEditionProfile.isPending}
      />
    );
  };

  return (
    <TabsContent
      value="editions"
      className="flex-1 min-h-0 flex flex-col gap-3"
    >
      <div className="overflow-auto flex-1 min-h-0">
        <BaseBookTable
          rows={rows}
          columns={COLUMNS}
          sortKey={sortKey}
          sortDir={sortDir}
          onSort={handleSort}
          renderLeadingCell={renderLeadingCell}
          emptyMessage="No editions found."
          className="min-w-max"
        >
          {isFetchingNextPage && (
            <BookTableRowsSkeleton columns={COLUMNS.length} />
          )}
        </BaseBookTable>
        <div ref={sentinelRef} className="h-1" />
      </div>
    </TabsContent>
  );
}
