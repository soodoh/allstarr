import type { JSX } from "react";
import { Download, Loader2, AlertTriangle } from "lucide-react";
import { Button } from "src/components/ui/button";
import Skeleton from "src/components/ui/skeleton";
import { Badge } from "src/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "src/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "src/components/ui/tooltip";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "src/components/ui/popover";
import SortableTableHead from "src/components/shared/sortable-table-head";
import { useTableState } from "src/hooks/use-table-state";
import type { IndexerRelease } from "src/server/indexers/types";

type ReleaseTableProps = {
  releases: IndexerRelease[];
  grabbingGuid: string | undefined;
  onGrab: (release: IndexerRelease) => void;
  loading?: boolean;
};

const QUALITY_BADGE_CLASS: Record<string, string> = {
  green: "bg-green-500/20 text-green-400 border-green-500/30",
  blue: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  amber: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  yellow: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  gray: "bg-zinc-500/20 text-zinc-400 border-zinc-500/30",
  purple: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  cyan: "bg-cyan-500/20 text-cyan-400 border-cyan-500/30",
  orange: "bg-orange-500/20 text-orange-400 border-orange-500/30",
};

const comparators: Partial<
  Record<string, (a: IndexerRelease, b: IndexerRelease) => number>
> = {
  quality: (a, b) => a.quality.weight - b.quality.weight,
  formatScore: (a, b) => a.formatScore - b.formatScore,
  title: (a, b) => a.title.localeCompare(b.title),
  indexer: (a, b) => (a.indexer ?? "").localeCompare(b.indexer ?? ""),
  size: (a, b) => a.size - b.size,
  protocol: (a, b) => a.protocol.localeCompare(b.protocol),
  peers: (a, b) => (a.seeders ?? 0) - (b.seeders ?? 0),
  age: (a, b) => (a.age ?? 0) - (b.age ?? 0),
  rejections: (a, b) => a.rejections.length - b.rejections.length,
};

// oxlint-disable react/no-array-index-key -- Skeleton arrays have no meaningful data keys
function ReleaseTableSkeleton(): JSX.Element {
  return (
    <div className="space-y-2">
      <Skeleton className="h-10 w-full" />
      {Array.from({ length: 6 }).map((_, i) => (
        <Skeleton key={i} className="h-12 w-full" />
      ))}
    </div>
  );
}

function FormatScoreCell({
  release,
}: {
  release: IndexerRelease;
}): JSX.Element {
  const { formatScore, formatScoreDetails } = release;

  if (formatScoreDetails.length === 0) {
    return (
      <TableCell className="text-muted-foreground text-sm text-center">
        —
      </TableCell>
    );
  }

  return (
    <TableCell className="text-center">
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="cursor-default text-sm font-medium tabular-nums">
            {formatScore}
          </span>
        </TooltipTrigger>
        <TooltipContent side="left" className="max-w-xs">
          <ul className="space-y-1">
            {formatScoreDetails.map((detail) => (
              <li
                key={detail.profileName}
                className="flex justify-between gap-4 text-xs"
              >
                <span>{detail.profileName}</span>
                <span
                  className={detail.allowed ? "text-green-400" : "text-red-400"}
                >
                  {detail.score} ({detail.allowed ? "allowed" : "not allowed"})
                </span>
              </li>
            ))}
          </ul>
        </TooltipContent>
      </Tooltip>
    </TableCell>
  );
}

function RejectionsCell({ release }: { release: IndexerRelease }): JSX.Element {
  const { rejections } = release;

  if (rejections.length === 0) {
    return <TableCell className="w-12" />;
  }

  return (
    <TableCell className="w-12 text-center">
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="inline-flex items-center justify-center text-red-400 hover:text-red-300"
            title={`${rejections.length} rejection${rejections.length > 1 ? "s" : ""}`}
          >
            <AlertTriangle className="h-4 w-4" />
          </button>
        </PopoverTrigger>
        <PopoverContent side="left" className="w-80">
          <p className="text-sm font-medium mb-2">Release Rejected</p>
          <ul className="space-y-1">
            {rejections.map((rejection, idx) => (
              // eslint-disable-next-line react/no-array-index-key -- rejections are static per render
              <li
                key={idx}
                className="text-sm text-muted-foreground flex gap-2"
              >
                <span className="text-red-400 shrink-0">*</span>
                <span>{rejection.message}</span>
              </li>
            ))}
          </ul>
        </PopoverContent>
      </Popover>
    </TableCell>
  );
}

export default function ReleaseTable({
  releases,
  grabbingGuid,
  onGrab,
  loading,
}: ReleaseTableProps): JSX.Element {
  const { sortColumn, sortDirection, handleSort, paginatedData } =
    useTableState({
      data: releases,
      comparators,
      defaultPageSize: 100,
      defaultSortColumn: "quality",
      defaultSortDirection: "desc",
    });

  if (loading) {
    return <ReleaseTableSkeleton />;
  }

  if (releases.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <p>No releases found.</p>
      </div>
    );
  }

  const sortProps = { sortColumn, sortDirection, onSort: handleSort };

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <SortableTableHead column="quality" className="w-24" {...sortProps}>
              Quality
            </SortableTableHead>
            <SortableTableHead
              column="formatScore"
              className="w-16"
              {...sortProps}
            >
              Score
            </SortableTableHead>
            <SortableTableHead column="title" {...sortProps}>
              Title
            </SortableTableHead>
            <SortableTableHead column="indexer" className="w-28" {...sortProps}>
              Indexer
            </SortableTableHead>
            <SortableTableHead column="size" className="w-24" {...sortProps}>
              Size
            </SortableTableHead>
            <SortableTableHead
              column="protocol"
              className="w-20"
              {...sortProps}
            >
              Protocol
            </SortableTableHead>
            <SortableTableHead column="peers" className="w-20" {...sortProps}>
              Peers
            </SortableTableHead>
            <SortableTableHead column="age" className="w-28" {...sortProps}>
              Age
            </SortableTableHead>
            <SortableTableHead
              column="rejections"
              className="w-12"
              {...sortProps}
            >
              <AlertTriangle className="h-4 w-4" />
            </SortableTableHead>
            <TableHead className="w-16">Grab</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {paginatedData.map((release) => {
            const isGrabbing = grabbingGuid === release.guid;
            const qualityClass =
              QUALITY_BADGE_CLASS[release.quality.color] ??
              QUALITY_BADGE_CLASS.gray;
            return (
              <TableRow key={release.guid}>
                <TableCell>
                  <span
                    className={`inline-flex items-center rounded border px-2 py-0.5 text-xs font-medium ${qualityClass}`}
                  >
                    {release.quality.name}
                  </span>
                </TableCell>
                <FormatScoreCell release={release} />
                <TableCell className="max-w-xs">
                  <span
                    className="block truncate text-sm"
                    title={release.title}
                  >
                    {release.title}
                  </span>
                </TableCell>
                <TableCell className="text-muted-foreground text-sm">
                  {release.indexer ?? `Indexer ${release.indexerId}`}
                </TableCell>
                <TableCell className="text-muted-foreground text-sm">
                  {release.sizeFormatted}
                </TableCell>
                <TableCell>
                  <Badge
                    variant={
                      release.protocol === "torrent" ? "default" : "secondary"
                    }
                    className="text-xs"
                  >
                    {release.protocol}
                  </Badge>
                </TableCell>
                <TableCell className="text-muted-foreground text-sm">
                  {release.protocol === "torrent" && release.seeders !== null
                    ? `${release.seeders}S / ${release.leechers ?? 0}L`
                    : "—"}
                </TableCell>
                <TableCell className="text-muted-foreground text-sm">
                  {release.ageFormatted}
                </TableCell>
                <RejectionsCell release={release} />
                <TableCell>
                  <Button
                    variant="ghost"
                    size="icon"
                    disabled={isGrabbing}
                    onClick={() => onGrab(release)}
                    title="Grab release"
                  >
                    {isGrabbing ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Download className="h-4 w-4" />
                    )}
                  </Button>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
