import { Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import type { JSX, ReactNode } from "react";
import { ChevronDown, ChevronUp, ChevronsUpDown } from "lucide-react";
import OptimizedImage from "src/components/shared/optimized-image";
import ProfileToggleIcons from "src/components/shared/profile-toggle-icons";
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

type Show = {
  id: number;
  title: string;
  sortTitle: string;
  year: number;
  network: string;
  status: string;
  posterUrl: string;
  seasonCount: number;
  episodeCount: number;
  episodeFileCount: number;
  downloadProfileIds?: number[];
};

type DownloadProfile = {
  id: number;
  name: string;
  icon: string;
};

type ShowTableProps = {
  shows: Show[];
  selectable?: boolean;
  selectedIds?: Set<number>;
  onToggleSelect?: (id: number) => void;
  onToggleAll?: () => void;
  downloadProfiles?: DownloadProfile[];
  onToggleProfile?: (showId: number, profileId: number) => void;
};

const STATUS_BADGE: Record<string, { className: string; label: string }> = {
  continuing: { className: "bg-green-600", label: "Continuing" },
  ended: { className: "bg-blue-600", label: "Ended" },
  upcoming: { className: "bg-yellow-600", label: "Upcoming" },
  canceled: { className: "bg-red-600", label: "Canceled" },
};

const EMPTY_PROFILE_IDS: number[] = [];

type SortableKey =
  | "title"
  | "year"
  | "network"
  | "seasons"
  | "episodes"
  | "status";

type ColumnDef = {
  label: string;
  render: (show: Show) => ReactNode;
  sortKey?: SortableKey;
  cellClassName?: string;
  colClassName?: string;
};

const COLUMN_REGISTRY: Record<string, ColumnDef> = {
  title: {
    label: "Title",
    sortKey: "title",
    render: () => null, // Handled inline (Link component needs show context)
  },
  year: {
    label: "Year",
    sortKey: "year",
    colClassName: "w-20",
    render: (show) => (show.year > 0 ? show.year : "\u2014"),
  },
  network: {
    label: "Network",
    sortKey: "network",
    cellClassName: "text-muted-foreground",
    render: (show) => show.network || "\u2014",
  },
  seasons: {
    label: "Seasons",
    sortKey: "seasons",
    colClassName: "w-24",
    render: (show) => show.seasonCount,
  },
  episodes: {
    label: "Episodes",
    sortKey: "episodes",
    colClassName: "w-28",
    render: (show) => `${show.episodeFileCount}/${show.episodeCount}`,
  },
  status: {
    label: "Status",
    sortKey: "status",
    colClassName: "w-28",
    render: (show) => {
      const badge = STATUS_BADGE[show.status] ?? {
        className: "bg-zinc-600",
        label: show.status,
      };
      return <Badge className={badge.className}>{badge.label}</Badge>;
    },
  },
};

export default function ShowTable({
  shows,
  selectable,
  selectedIds,
  onToggleSelect,
  onToggleAll,
  downloadProfiles,
  onToggleProfile,
}: ShowTableProps): JSX.Element {
  const navigate = useNavigate();
  const { visibleColumns } = useTableColumns("tv");
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
    ? [...shows].toSorted((a, b) => {
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
          case "network": {
            cmp = a.network.localeCompare(b.network);
            break;
          }
          case "seasons": {
            cmp = a.seasonCount - b.seasonCount;
            break;
          }
          case "episodes": {
            cmp = a.episodeFileCount - b.episodeFileCount;
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
    : shows;

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
    shows.length > 0 &&
    selectedIds.size === shows.length;

  return (
    <div>
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
          {sorted.map((show) => {
            const isSelected = selectable && selectedIds?.has(show.id);
            return (
              <TableRow
                key={show.id}
                className="cursor-pointer hover:bg-accent/50 transition-colors"
                onClick={() => {
                  if (selectable && onToggleSelect) {
                    onToggleSelect(show.id);
                  } else {
                    navigate({
                      to: "/tv/series/$showId",
                      params: { showId: String(show.id) },
                    });
                  }
                }}
              >
                {selectable && (
                  <TableCell>
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={() => onToggleSelect?.(show.id)}
                      onClick={(e) => e.stopPropagation()}
                    />
                  </TableCell>
                )}
                {visibleColumns.map((col) => {
                  if (col.key === "monitored") {
                    // oxlint-disable-next-line react-perf/jsx-no-new-array-as-prop -- Dynamic per-row filtering
                    const assignedProfiles = downloadProfiles
                      ? downloadProfiles.filter((p) =>
                          (
                            show.downloadProfileIds ?? EMPTY_PROFILE_IDS
                          ).includes(p.id),
                        )
                      : undefined;
                    return (
                      <TableCell key={col.key}>
                        {assignedProfiles && onToggleProfile ? (
                          <ProfileToggleIcons
                            profiles={assignedProfiles}
                            activeProfileIds={
                              show.downloadProfileIds ?? EMPTY_PROFILE_IDS
                            }
                            onToggle={(profileId) =>
                              onToggleProfile(show.id, profileId)
                            }
                          />
                        ) : null}
                      </TableCell>
                    );
                  }
                  if (col.key === "cover") {
                    return (
                      <TableCell key={col.key}>
                        <OptimizedImage
                          src={resizeTmdbUrl(show.posterUrl, "w185")}
                          alt={show.title}
                          type="show"
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
                          to="/tv/series/$showId"
                          params={{ showId: String(show.id) }}
                          className="font-medium hover:underline"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {show.title}
                        </Link>
                      </TableCell>
                    );
                  }
                  const def = COLUMN_REGISTRY[col.key];
                  return (
                    <TableCell key={col.key} className={def?.cellClassName}>
                      {def?.render(show)}
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
