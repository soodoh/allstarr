import { useState } from "react";
import { Download, Loader2, ArrowUpDown } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Button } from "~/components/ui/button";
import { Badge } from "~/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import type { IndexerRelease } from "~/server/indexers/types";

type SortKey = "quality" | "size";
type SortDir = "asc" | "desc";

type ReleaseTableProps = {
  releases: IndexerRelease[];
  grabbingGuid: string | undefined;
  onGrab: (release: IndexerRelease) => void;
};

const QUALITY_BADGE_CLASS: Record<string, string> = {
  green: "bg-green-500/20 text-green-400 border-green-500/30",
  blue: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  amber: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  yellow: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  gray: "bg-zinc-500/20 text-zinc-400 border-zinc-500/30",
};

export default function ReleaseTable({
  releases,
  grabbingGuid,
  onGrab,
}: ReleaseTableProps): React.JSX.Element {
  const [sortKey, setSortKey] = useState<SortKey>("quality");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  if (releases.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <p>No releases found.</p>
        <p className="text-sm mt-1">
          Make sure you have{" "}
          <Link
            to="/settings/indexers"
            className="underline hover:text-foreground"
          >
            indexers configured
          </Link>{" "}
          and enabled.
        </p>
      </div>
    );
  }

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const sorted = [...releases].toSorted((a, b) => {
    let diff = 0;
    if (sortKey === "quality") {
      diff = a.quality.weight - b.quality.weight;
    } else {
      diff = a.size - b.size;
    }
    return sortDir === "asc" ? diff : -diff;
  });

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead
              className="w-24 cursor-pointer select-none"
              onClick={() => handleSort("quality")}
            >
              <div className="flex items-center gap-1">
                Quality
                <ArrowUpDown className="h-3 w-3 opacity-50" />
              </div>
            </TableHead>
            <TableHead>Title</TableHead>
            <TableHead className="w-28">Indexer</TableHead>
            <TableHead
              className="w-24 cursor-pointer select-none"
              onClick={() => handleSort("size")}
            >
              <div className="flex items-center gap-1">
                Size
                <ArrowUpDown className="h-3 w-3 opacity-50" />
              </div>
            </TableHead>
            <TableHead className="w-20">Protocol</TableHead>
            <TableHead className="w-20">Peers</TableHead>
            <TableHead className="w-28">Age</TableHead>
            <TableHead className="w-16">Grab</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.map((release) => {
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
                  {release.protocol === "torrent" && release.seeders !== null && release.seeders !== undefined
                    ? `${release.seeders}S / ${release.leechers ?? 0}L`
                    : "—"}
                </TableCell>
                <TableCell className="text-muted-foreground text-sm">
                  {release.ageFormatted}
                </TableCell>
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
