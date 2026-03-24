import { Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import type { JSX } from "react";
import { ChevronDown, ChevronUp, ChevronsUpDown, Tv } from "lucide-react";
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
};

type ShowTableProps = {
  shows: Show[];
  selectable?: boolean;
  selectedIds?: Set<number>;
  onToggleSelect?: (id: number) => void;
  onToggleAll?: () => void;
};

const STATUS_BADGE: Record<string, { className: string; label: string }> = {
  continuing: { className: "bg-green-600", label: "Continuing" },
  ended: { className: "bg-blue-600", label: "Ended" },
  upcoming: { className: "bg-yellow-600", label: "Upcoming" },
  canceled: { className: "bg-red-600", label: "Canceled" },
};

type SortableKey =
  | "title"
  | "year"
  | "network"
  | "seasons"
  | "episodes"
  | "status";

export default function ShowTable({
  shows,
  selectable,
  selectedIds,
  onToggleSelect,
  onToggleAll,
}: ShowTableProps): JSX.Element {
  const navigate = useNavigate();
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
    <Table>
      <colgroup>
        {selectable && <col className="w-10" />}
        <col className="w-14" />
        <col />
        <col className="w-20" />
        <col />
        <col className="w-24" />
        <col className="w-28" />
        <col className="w-28" />
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
          <TableHead />
          {(
            [
              { key: "title", label: "Title" },
              { key: "year", label: "Year" },
              { key: "network", label: "Network" },
              { key: "seasons", label: "Seasons" },
              { key: "episodes", label: "Episodes" },
              { key: "status", label: "Status" },
            ] as Array<{ key: SortableKey; label: string }>
          ).map(({ key, label }) => (
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
        {sorted.map((show) => {
          const badge = STATUS_BADGE[show.status] ?? {
            className: "bg-zinc-600",
            label: show.status,
          };
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
              <TableCell>
                {show.posterUrl ? (
                  <img
                    src={show.posterUrl}
                    alt={show.title}
                    className="aspect-[2/3] w-full rounded-sm object-cover"
                  />
                ) : (
                  <div className="aspect-[2/3] w-full rounded-sm bg-muted flex items-center justify-center">
                    <Tv className="h-4 w-4 text-muted-foreground" />
                  </div>
                )}
              </TableCell>
              <TableCell>
                <Link
                  to="/tv/series/$showId"
                  params={{ showId: String(show.id) }}
                  className="font-medium hover:underline"
                  onClick={(e) => e.stopPropagation()}
                >
                  {show.title}
                </Link>
              </TableCell>
              <TableCell>{show.year > 0 ? show.year : "\u2014"}</TableCell>
              <TableCell className="text-muted-foreground">
                {show.network || "\u2014"}
              </TableCell>
              <TableCell>{show.seasonCount}</TableCell>
              <TableCell>
                {show.episodeFileCount}/{show.episodeCount}
              </TableCell>
              <TableCell>
                <Badge className={badge.className}>{badge.label}</Badge>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
