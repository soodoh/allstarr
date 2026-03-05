import { useMemo, useState } from "react";
import type { JSX } from "react";
import {
  ChevronDown,
  ChevronUp,
  ChevronsUpDown,
  ImageIcon,
} from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "src/components/ui/table";
import { TabsContent } from "src/components/ui/tabs";
import TablePagination from "src/components/shared/table-pagination";
import { useToggleEditionProfile } from "src/hooks/mutations";
import ProfileToggleIcons from "src/components/shared/profile-toggle-icons";
import MetadataWarning from "src/components/shared/metadata-warning";

type Edition = {
  id: number;
  title: string;
  foreignEditionId: string | null;
  format: string | null;
  publisher: string | null;
  editionInformation: string | null;
  pageCount: number | null;
  releaseDate: string | null;
  isbn10: string | null;
  isbn13: string | null;
  asin: string | null;
  language: string | null;
  languageCode: string | null;
  country: string | null;
  usersCount: number | null;
  score: number | null;
  downloadProfileIds: number[];
  metadataSourceMissingSince: Date | null;
  images: Array<{ url: string; coverType: string }>;
};

type DownloadProfile = {
  id: number;
  name: string;
  icon: string;
};

type EditionSortKey =
  | "title"
  | "publisher"
  | "information"
  | "format"
  | "pages"
  | "releaseDate"
  | "isbn13"
  | "isbn10"
  | "asin"
  | "language"
  | "country"
  | "readers"
  | "score";

type EditionColumn = {
  key: EditionSortKey;
  label: string;
};

const EDITION_COLUMNS: EditionColumn[] = [
  { key: "title", label: "Title" },
  { key: "publisher", label: "Publisher" },
  { key: "information", label: "Information" },
  { key: "format", label: "Type" },
  { key: "pages", label: "Pages" },
  { key: "releaseDate", label: "Release Date" },
  { key: "isbn13", label: "ISBN-13" },
  { key: "isbn10", label: "ISBN-10" },
  { key: "asin", label: "ASIN" },
  { key: "language", label: "Language" },
  { key: "country", label: "Country" },
  { key: "readers", label: "Readers" },
  { key: "score", label: "Data Score" },
];

const EDITION_SORT_ACCESSORS: Record<
  EditionSortKey,
  (e: Edition) => string | number
> = {
  title: (e) => e.title || "",
  publisher: (e) => e.publisher || "",
  information: (e) => e.editionInformation || "",
  format: (e) => e.format || "",
  pages: (e) => e.pageCount ?? -1,
  releaseDate: (e) => e.releaseDate || "",
  isbn13: (e) => e.isbn13 || "",
  isbn10: (e) => e.isbn10 || "",
  asin: (e) => e.asin || "",
  language: (e) => e.language || "",
  country: (e) => e.country || "",
  readers: (e) => e.usersCount ?? -1,
  score: (e) => e.score ?? -1,
};

function getEditionSortValue(
  edition: Edition,
  key: EditionSortKey,
): string | number {
  return EDITION_SORT_ACCESSORS[key](edition);
}

export default function EditionsTab({
  editions,
  authorDownloadProfiles,
}: {
  editions: Edition[];
  authorDownloadProfiles: DownloadProfile[];
}): JSX.Element {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [sortBy, setSortBy] = useState<EditionSortKey>("readers");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const toggleEditionProfile = useToggleEditionProfile();

  const handleSort = (key: EditionSortKey) => {
    if (sortBy === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(key);
      setSortDir("asc");
    }
    setPage(1);
  };

  const handlePageSizeChange = (size: number) => {
    setPageSize(size);
    setPage(1);
  };

  const sortedEditions = useMemo(() => {
    return [...editions].toSorted((a, b) => {
      const av = getEditionSortValue(a, sortBy);
      const bv = getEditionSortValue(b, sortBy);
      let cmp: number;
      if (typeof av === "number" && typeof bv === "number") {
        cmp = av - bv;
      } else {
        cmp = String(av).localeCompare(String(bv));
      }
      if (cmp === 0 && sortBy !== "readers") {
        cmp = (b.usersCount ?? 0) - (a.usersCount ?? 0);
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [editions, sortBy, sortDir]);

  const total = sortedEditions.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const pagedEditions = sortedEditions.slice(
    (page - 1) * pageSize,
    page * pageSize,
  );

  const SortIcon = ({ col }: { col: EditionSortKey }) => {
    if (sortBy !== col) {
      return (
        <ChevronsUpDown className="ml-1 h-3.5 w-3.5 text-muted-foreground/50 inline" />
      );
    }
    return sortDir === "asc" ? (
      <ChevronUp className="ml-1 h-3.5 w-3.5 inline" />
    ) : (
      <ChevronDown className="ml-1 h-3.5 w-3.5 inline" />
    );
  };

  return (
    <TabsContent
      value="editions"
      className="flex-1 min-h-0 flex flex-col gap-3"
    >
      <div className="overflow-auto flex-1 min-h-0">
        <Table className="min-w-max">
          <colgroup>
            <col className="w-8" />
            <col className="w-14" />
            {EDITION_COLUMNS.map((col) => (
              <col key={col.key} />
            ))}
          </colgroup>
          <TableHeader>
            <TableRow>
              <TableHead />
              <TableHead />
              {EDITION_COLUMNS.map(({ key, label }) => (
                <TableHead
                  key={key}
                  className="cursor-pointer select-none hover:text-foreground"
                  onClick={() => handleSort(key)}
                >
                  {label}
                  <SortIcon col={key} />
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {pagedEditions.length > 0 &&
              pagedEditions.map((edition) => {
                const coverUrl = edition.images?.[0]?.url;
                return (
                  <TableRow key={edition.id}>
                    <TableCell className="px-2">
                      {edition.metadataSourceMissingSince ? (
                        <MetadataWarning
                          type="edition"
                          missingSince={edition.metadataSourceMissingSince}
                          itemId={edition.id}
                          itemTitle={edition.title}
                        />
                      ) : (
                        <ProfileToggleIcons
                          profiles={authorDownloadProfiles}
                          activeProfileIds={edition.downloadProfileIds}
                          onToggle={(profileId) =>
                            toggleEditionProfile.mutate({
                              editionId: edition.id,
                              downloadProfileId: profileId,
                            })
                          }
                          isPending={toggleEditionProfile.isPending}
                        />
                      )}
                    </TableCell>
                    <TableCell>
                      {coverUrl ? (
                        <img
                          src={coverUrl}
                          alt={edition.title}
                          className="aspect-[2/3] w-full rounded-sm object-cover"
                        />
                      ) : (
                        <div className="aspect-[2/3] w-full rounded-sm bg-muted flex items-center justify-center">
                          <ImageIcon className="h-4 w-4 text-muted-foreground" />
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="font-medium max-w-48 truncate">
                      {edition.title}
                    </TableCell>
                    <TableCell className="max-w-36 truncate">
                      {edition.publisher || "\u2014"}
                    </TableCell>
                    <TableCell className="max-w-48 truncate">
                      {edition.editionInformation || "\u2014"}
                    </TableCell>
                    <TableCell>{edition.format || "\u2014"}</TableCell>
                    <TableCell>{edition.pageCount ?? "\u2014"}</TableCell>
                    <TableCell className="whitespace-nowrap">
                      {edition.releaseDate || "\u2014"}
                    </TableCell>
                    <TableCell>{edition.isbn13 || "\u2014"}</TableCell>
                    <TableCell>{edition.isbn10 || "\u2014"}</TableCell>
                    <TableCell>{edition.asin || "\u2014"}</TableCell>
                    <TableCell>{edition.language || "\u2014"}</TableCell>
                    <TableCell>{edition.country || "\u2014"}</TableCell>
                    <TableCell>
                      {(edition.usersCount ?? 0).toLocaleString()}
                    </TableCell>
                    <TableCell>
                      {(edition.score ?? 0).toLocaleString()}
                    </TableCell>
                  </TableRow>
                );
              })}
            {pagedEditions.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={EDITION_COLUMNS.length + 2}
                  className="text-center text-muted-foreground py-8"
                >
                  No editions found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      {total > 0 && (
        <TablePagination
          page={page}
          pageSize={pageSize}
          totalItems={total}
          totalPages={totalPages}
          onPageChange={setPage}
          onPageSizeChange={handlePageSizeChange}
        />
      )}
    </TabsContent>
  );
}
