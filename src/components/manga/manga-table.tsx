import { Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import type { JSX, ReactNode } from "react";
import { ChevronDown, ChevronUp, ChevronsUpDown } from "lucide-react";
import OptimizedImage from "src/components/shared/optimized-image";
import ProfileToggleIcons from "src/components/shared/profile-toggle-icons";
import { useTableColumns } from "src/hooks/use-table-columns";
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

type Manga = {
  id: number;
  title: string;
  sortTitle: string;
  type: string;
  year: number;
  status: string;
  posterUrl: string;
  volumeCount: number;
  chapterCount: number;
  chapterFileCount: number;
  downloadProfileIds?: number[];
};

type DownloadProfile = {
  id: number;
  name: string;
  icon: string;
};

type MangaTableProps = {
  mangaList: Manga[];
  selectable?: boolean;
  selectedIds?: Set<number>;
  onToggleSelect?: (id: number) => void;
  onToggleAll?: () => void;
  downloadProfiles?: DownloadProfile[];
  onToggleProfile?: (mangaId: number, profileId: number) => void;
};

const STATUS_BADGE: Record<string, { className: string; label: string }> = {
  ongoing: { className: "bg-green-600", label: "Ongoing" },
  complete: { className: "bg-blue-600", label: "Complete" },
  hiatus: { className: "bg-yellow-600", label: "Hiatus" },
  cancelled: { className: "bg-red-600", label: "Cancelled" },
};

const EMPTY_PROFILE_IDS: number[] = [];

type SortableKey =
  | "title"
  | "type"
  | "year"
  | "volumes"
  | "chapters"
  | "status";

type ColumnDef = {
  label: string;
  render: (manga: Manga) => ReactNode;
  sortKey?: SortableKey;
  cellClassName?: string;
  colClassName?: string;
};

const COLUMN_REGISTRY: Record<string, ColumnDef> = {
  title: {
    label: "Title",
    sortKey: "title",
    render: () => null, // Handled inline (Link component needs manga context)
  },
  type: {
    label: "Type",
    sortKey: "type",
    colClassName: "w-24",
    cellClassName: "text-muted-foreground capitalize",
    render: (manga) => manga.type || "\u2014",
  },
  year: {
    label: "Year",
    sortKey: "year",
    colClassName: "w-20",
    render: (manga) => (manga.year > 0 ? manga.year : "\u2014"),
  },
  volumes: {
    label: "Volumes",
    sortKey: "volumes",
    colClassName: "w-24",
    render: (manga) => manga.volumeCount,
  },
  chapters: {
    label: "Chapters",
    sortKey: "chapters",
    colClassName: "w-28",
    render: (manga) => `${manga.chapterFileCount}/${manga.chapterCount}`,
  },
  status: {
    label: "Status",
    sortKey: "status",
    colClassName: "w-28",
    render: (manga) => {
      const badge = STATUS_BADGE[manga.status] ?? {
        className: "bg-zinc-600",
        label: manga.status,
      };
      return <Badge className={badge.className}>{badge.label}</Badge>;
    },
  },
};

export default function MangaTable({
  mangaList,
  selectable,
  selectedIds,
  onToggleSelect,
  onToggleAll,
  downloadProfiles,
  onToggleProfile,
}: MangaTableProps): JSX.Element {
  const navigate = useNavigate();
  const { visibleColumns } = useTableColumns("manga");
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
    ? [...mangaList].toSorted((a, b) => {
        let cmp = 0;
        switch (sortKey) {
          case "title": {
            cmp = a.sortTitle.localeCompare(b.sortTitle);
            break;
          }
          case "type": {
            cmp = a.type.localeCompare(b.type);
            break;
          }
          case "year": {
            cmp = a.year - b.year;
            break;
          }
          case "volumes": {
            cmp = a.volumeCount - b.volumeCount;
            break;
          }
          case "chapters": {
            cmp = a.chapterFileCount - b.chapterFileCount;
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
    : mangaList;

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
    mangaList.length > 0 &&
    selectedIds.size === mangaList.length;

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
          {sorted.map((m) => {
            const isSelected = selectable && selectedIds?.has(m.id);
            return (
              <TableRow
                key={m.id}
                className="cursor-pointer hover:bg-accent/50 transition-colors"
                onClick={() => {
                  if (selectable && onToggleSelect) {
                    onToggleSelect(m.id);
                  } else {
                    navigate({
                      to: "/manga/series/$mangaId",
                      params: { mangaId: String(m.id) },
                    });
                  }
                }}
              >
                {selectable && (
                  <TableCell>
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={() => onToggleSelect?.(m.id)}
                      onClick={(e) => e.stopPropagation()}
                    />
                  </TableCell>
                )}
                {visibleColumns.map((col) => {
                  if (col.key === "monitored") {
                    // oxlint-disable-next-line react-perf/jsx-no-new-array-as-prop -- Dynamic per-row filtering
                    const assignedProfiles = downloadProfiles
                      ? downloadProfiles.filter((p) =>
                          (m.downloadProfileIds ?? EMPTY_PROFILE_IDS).includes(
                            p.id,
                          ),
                        )
                      : undefined;
                    return (
                      <TableCell key={col.key}>
                        {assignedProfiles && onToggleProfile ? (
                          <ProfileToggleIcons
                            profiles={assignedProfiles}
                            activeProfileIds={
                              m.downloadProfileIds ?? EMPTY_PROFILE_IDS
                            }
                            onToggle={(profileId) =>
                              onToggleProfile(m.id, profileId)
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
                          src={m.posterUrl}
                          alt={m.title}
                          type="manga"
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
                          to="/manga/series/$mangaId"
                          params={{ mangaId: String(m.id) }}
                          className="font-medium hover:underline"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {m.title}
                        </Link>
                      </TableCell>
                    );
                  }
                  const def = COLUMN_REGISTRY[col.key];
                  return (
                    <TableCell key={col.key} className={def?.cellClassName}>
                      {def?.render(m)}
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
