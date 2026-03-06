import { useMemo } from "react";
import type { JSX, ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import BaseBookTable from "src/components/bookshelf/books/base-book-table";
import type {
  BookTableRow,
  ColumnConfig,
} from "src/components/bookshelf/books/base-book-table";
import type { BookAuthorEntry } from "src/components/bookshelf/books/additional-authors";
import ProfileToggleIcons from "src/components/shared/profile-toggle-icons";

type Book = {
  id: number;
  title: string;
  editionId: number;
  editionTitle: string;
  editionImages: Array<{ url: string; coverType: string }>;
  language: string | null;
  bookAuthors: BookAuthorEntry[];
  authorName: string | null;
  releaseDate: string | null;
  rating: number | null;
  ratingsCount: number | null;
  usersCount: number | null;
  series: Array<{ title: string; position: string | null }>;
  images: Array<{ url: string; coverType: string }>;
  downloadProfileIds?: number[];
  authorDownloadProfileIds?: number[];
};

type DownloadProfile = {
  id: number;
  name: string;
  icon: string;
};

type BookTableProps = {
  books: Book[];
  sortKey?: string;
  sortDir?: "asc" | "desc";
  onSort?: (key: string) => void;
  downloadProfiles?: DownloadProfile[];
  onToggleProfile?: (editionId: number, profileId: number) => void;
  isTogglePending?: boolean;
  children?: ReactNode;
};

const COLUMNS: ColumnConfig[] = [
  { key: "title", sortable: true },
  { key: "author", sortable: true },
  { key: "releaseDate", sortable: true },
  { key: "series", sortable: true },
  { key: "language", sortable: true },
  { key: "readers", sortable: true },
  { key: "rating", sortable: true },
];

function mapBookToRow(book: Book): BookTableRow {
  const coverUrl = (book.editionImages ?? book.images)?.[0]?.url ?? null;
  return {
    key: book.editionId,
    bookId: book.id,
    title: book.editionTitle,
    coverUrl,
    bookAuthors: book.bookAuthors,
    authorName: book.authorName,
    releaseDate: book.releaseDate,
    usersCount: book.usersCount,
    rating: book.rating,
    ratingsCount: book.ratingsCount,
    format: null,
    pageCount: null,
    isbn10: null,
    isbn13: null,
    asin: null,
    score: null,
    publisher: null,
    editionInformation: null,
    language: book.language,
    country: null,
    series: book.series,
    monitored: (book.downloadProfileIds ?? []).length > 0,
    downloadProfileIds: book.downloadProfileIds ?? [],
  };
}

export default function BookTable({
  books,
  sortKey,
  sortDir,
  onSort,
  downloadProfiles,
  onToggleProfile,
  isTogglePending,
  children,
}: BookTableProps): JSX.Element {
  const navigate = useNavigate();

  const rows = useMemo(() => books.map(mapBookToRow), [books]);

  // Build a lookup of authorDownloadProfileIds by bookId for leading cell
  const authorProfilesMap = useMemo(() => {
    const map = new Map<number, number[]>();
    for (const book of books) {
      if (book.authorDownloadProfileIds) {
        map.set(book.id, book.authorDownloadProfileIds);
      }
    }
    return map;
  }, [books]);

  const renderLeadingCell =
    downloadProfiles && onToggleProfile
      ? (row: BookTableRow) => {
          // Filter profiles: only show profiles the author is linked to
          const authorProfileIds = authorProfilesMap.get(row.bookId) ?? [];
          // oxlint-disable-next-line react-perf/jsx-no-new-array-as-prop -- Dynamic per-row filtering
          const visibleProfiles =
            authorProfileIds.length > 0
              ? downloadProfiles.filter((p) => authorProfileIds.includes(p.id))
              : downloadProfiles;
          return (
            <ProfileToggleIcons
              profiles={visibleProfiles}
              activeProfileIds={row.downloadProfileIds}
              onToggle={(profileId) => onToggleProfile(row.bookId, profileId)}
              isPending={isTogglePending}
            />
          );
        }
      : undefined;

  return (
    <BaseBookTable
      rows={rows}
      columns={COLUMNS}
      sortKey={sortKey}
      sortDir={sortDir}
      onSort={onSort}
      renderLeadingCell={renderLeadingCell}
      onRowClick={(row) =>
        navigate({
          to: "/bookshelf/books/$bookId",
          params: { bookId: String(row.bookId) },
        })
      }
    >
      {children}
    </BaseBookTable>
  );
}
