import { Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import type { JSX, ReactNode } from "react";
import { ChevronDown, ChevronUp, ChevronsUpDown } from "lucide-react";
import OptimizedImage from "src/components/shared/optimized-image";
import ProfileToggleIcons from "src/components/shared/profile-toggle-icons";
import ColumnSettingsPopover from "src/components/shared/column-settings-popover";
import { useTableColumns } from "src/hooks/use-table-columns";
import { resizeTmdbUrl } from "src/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "src/components/ui/table";
import { Badge } from "src/components/ui/badge";
import Checkbox from "src/components/ui/checkbox";

type Movie = {
  id: number;
  title: string;
  sortTitle: string;
  year: number;
  studio: string;
  status: string;
  posterUrl: string;
  hasFile: boolean;
  downloadProfileIds?: number[];
};

type DownloadProfile = {
  id: number;
  name: string;
  icon: string;
};

type MovieTableProps = {
  movies: Movie[];
  selectable?: boolean;
  selectedIds?: Set<number>;
  onToggleSelect?: (id: number) => void;
  onToggleAll?: () => void;
  downloadProfiles?: DownloadProfile[];
  onToggleProfile?: (movieId: number, profileId: number) => void;
  isTogglePending?: boolean;
};

const STATUS_BADGE: Record<string, { className: string; label: string }> = {
  released: { className: "bg-green-600", label: "Released" },
  inCinemas: { className: "bg-blue-600", label: "In Cinemas" },
  announced: { className: "bg-yellow-600", label: "Announced" },
  tba: { className: "bg-zinc-600", label: "TBA" },
};

const EMPTY_PROFILE_IDS: number[] = [];

type SortableKey = "title" | "year" | "studio" | "status";

type ColumnDef = {
  label: string;
  render: (movie: Movie) => ReactNode;
  sortKey?: SortableKey;
  cellClassName?: string;
  colClassName?: string;
};

const COLUMN_REGISTRY: Record<string, ColumnDef> = {
  title: {
    label: "Title",
    sortKey: "title",
    render: () => null, // Handled inline (Link component needs movie context)
  },
  year: {
    label: "Year",
    sortKey: "year",
    colClassName: "w-20",
    render: (movie) => (movie.year > 0 ? movie.year : "\u2014"),
  },
  studio: {
    label: "Studio",
    sortKey: "studio",
    cellClassName: "text-muted-foreground",
    render: (movie) => movie.studio || "\u2014",
  },
  status: {
    label: "Status",
    sortKey: "status",
    colClassName: "w-28",
    render: (movie) => {
      const badge = STATUS_BADGE[movie.status] ?? STATUS_BADGE.tba;
      return <Badge className={badge.className}>{badge.label}</Badge>;
    },
  },
};

export default function MovieTable({
  movies,
  selectable,
  selectedIds,
  onToggleSelect,
  onToggleAll,
  downloadProfiles,
  onToggleProfile,
  isTogglePending,
}: MovieTableProps): JSX.Element {
  const navigate = useNavigate();
  const { visibleColumns } = useTableColumns("movies");
  const [sortKey, setSortKey] = useState<SortableKey | undefined>("title");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const handleSort = (key: SortableKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const sorted = sortKey
    ? [...movies].toSorted((a, b) => {
        let cmp = 0;
        switch (sortKey) {
          case "title": {
            cmp = a.sortTitle.localeCompare(b.sortTitle);
            break;
          }
          case "year": {
            cmp = a.year - b.year;
            break;
          }
          case "studio": {
            cmp = a.studio.localeCompare(b.studio);
            break;
          }
          case "status": {
            cmp = a.status.localeCompare(b.status);
            break;
          }
          default: {
            break;
          }
        }
        return sortDir === "asc" ? cmp : -cmp;
      })
    : movies;

  const SortIcon = ({ col }: { col: SortableKey }) => {
    if (sortKey !== col) {
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

  const allSelected =
    selectable &&
    selectedIds &&
    movies.length > 0 &&
    selectedIds.size === movies.length;

  return (
    <div>
      <div className="flex justify-end pb-2">
        <ColumnSettingsPopover tableId="movies" />
      </div>
      <Table>
        <colgroup>
          {selectable && <col className="w-10" />}
          {visibleColumns.map((col) => {
            if (col.key === "monitored") {
              return <col key={col.key} className="w-10" />;
            }
            if (col.key === "cover") {
              return <col key={col.key} className="w-14" />;
            }
            const def = COLUMN_REGISTRY[col.key];
            return (
              <col key={col.key} className={def?.colClassName ?? undefined} />
            );
          })}
        </colgroup>
        <TableHeader>
          <TableRow>
            {selectable && (
              <TableHead>
                <Checkbox
                  checked={allSelected}
                  onCheckedChange={() => onToggleAll?.()}
                />
              </TableHead>
            )}
            {visibleColumns.map((col) => {
              if (col.key === "monitored" || col.key === "cover") {
                return <TableHead key={col.key} />;
              }
              const def = COLUMN_REGISTRY[col.key];
              const colSortKey = def?.sortKey;
              if (colSortKey) {
                return (
                  <TableHead
                    key={col.key}
                    className="cursor-pointer select-none hover:text-foreground"
                    onClick={() => handleSort(colSortKey)}
                  >
                    {def.label}
                    <SortIcon col={colSortKey} />
                  </TableHead>
                );
              }
              return (
                <TableHead key={col.key}>{def?.label ?? col.label}</TableHead>
              );
            })}
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.map((movie) => {
            const isSelected = selectable && selectedIds?.has(movie.id);
            return (
              <TableRow
                key={movie.id}
                className="cursor-pointer hover:bg-accent/50 transition-colors"
                onClick={() => {
                  if (selectable && onToggleSelect) {
                    onToggleSelect(movie.id);
                  } else {
                    navigate({
                      to: "/movies/$movieId",
                      params: { movieId: String(movie.id) },
                    });
                  }
                }}
              >
                {selectable && (
                  <TableCell>
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={() => onToggleSelect?.(movie.id)}
                      onClick={(e) => e.stopPropagation()}
                    />
                  </TableCell>
                )}
                {visibleColumns.map((col) => {
                  if (col.key === "monitored") {
                    return (
                      <TableCell key={col.key}>
                        {downloadProfiles && onToggleProfile ? (
                          <ProfileToggleIcons
                            profiles={downloadProfiles}
                            activeProfileIds={
                              movie.downloadProfileIds ?? EMPTY_PROFILE_IDS
                            }
                            onToggle={(profileId) =>
                              onToggleProfile(movie.id, profileId)
                            }
                            isPending={isTogglePending}
                          />
                        ) : null}
                      </TableCell>
                    );
                  }
                  if (col.key === "cover") {
                    return (
                      <TableCell key={col.key}>
                        <OptimizedImage
                          src={resizeTmdbUrl(movie.posterUrl, "w185")}
                          alt={movie.title}
                          type="movie"
                          width={56}
                          height={84}
                          className="aspect-[2/3] w-full rounded-sm"
                        />
                      </TableCell>
                    );
                  }
                  if (col.key === "title") {
                    return (
                      <TableCell key={col.key}>
                        <Link
                          to="/movies/$movieId"
                          params={{ movieId: String(movie.id) }}
                          className="font-medium hover:underline"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {movie.title}
                        </Link>
                      </TableCell>
                    );
                  }
                  const def = COLUMN_REGISTRY[col.key];
                  return (
                    <TableCell key={col.key} className={def?.cellClassName}>
                      {def?.render(movie)}
                    </TableCell>
                  );
                })}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
