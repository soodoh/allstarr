import type { JSX } from "react";
import type { SyncedIndexer } from "src/db/schema/synced-indexers";
import { Pencil, Trash2 } from "lucide-react";
import { Button } from "src/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "src/components/ui/table";
import { Badge } from "src/components/ui/badge";

type Indexer = {
  id: number;
  name: string;
  host: string;
  port: number;
  priority: number;
  enabled: boolean;
  enableRss: boolean;
  enableAutomaticSearch: boolean;
  enableInteractiveSearch: boolean;
};

type UnifiedRow =
  | { type: "manual"; data: Indexer }
  | { type: "synced"; data: SyncedIndexer };

type IndexerListProps = {
  indexers: Indexer[];
  syncedIndexers?: SyncedIndexer[];
  onEdit: (indexer: Indexer) => void;
  onDelete: (id: number) => void;
};

export default function IndexerList({
  indexers,
  syncedIndexers = [],
  onEdit,
  onDelete,
}: IndexerListProps): JSX.Element {
  const rows: UnifiedRow[] = [
    ...indexers.map((i) => ({ type: "manual" as const, data: i })),
    ...syncedIndexers.map((i) => ({ type: "synced" as const, data: i })),
  ].toSorted((a, b) => a.data.name.localeCompare(b.data.name));

  if (rows.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        No indexers configured. Add one to get started.
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Host</TableHead>
          <TableHead className="w-20">Priority</TableHead>
          <TableHead className="w-16 text-center">RSS</TableHead>
          <TableHead className="w-28 text-center">Auto Search</TableHead>
          <TableHead className="w-28 text-center">Interactive</TableHead>
          <TableHead className="w-24">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) =>
          row.type === "manual" ? (
            <TableRow key={`manual-${row.data.id}`}>
              <TableCell className="font-medium">{row.data.name}</TableCell>
              <TableCell className="text-muted-foreground">
                {row.data.host}:{row.data.port}
              </TableCell>
              <TableCell>{row.data.priority}</TableCell>
              <TableCell className="text-center">
                <Badge
                  variant={
                    row.data.enabled && row.data.enableRss
                      ? "default"
                      : "outline"
                  }
                >
                  {row.data.enabled && row.data.enableRss ? "Yes" : "No"}
                </Badge>
              </TableCell>
              <TableCell className="text-center">
                <Badge
                  variant={
                    row.data.enabled && row.data.enableAutomaticSearch
                      ? "default"
                      : "outline"
                  }
                >
                  {row.data.enabled && row.data.enableAutomaticSearch
                    ? "Yes"
                    : "No"}
                </Badge>
              </TableCell>
              <TableCell className="text-center">
                <Badge
                  variant={
                    row.data.enabled && row.data.enableInteractiveSearch
                      ? "default"
                      : "outline"
                  }
                >
                  {row.data.enabled && row.data.enableInteractiveSearch
                    ? "Yes"
                    : "No"}
                </Badge>
              </TableCell>
              <TableCell>
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => onEdit(row.data)}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => onDelete(row.data.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ) : (
            <TableRow key={`synced-${row.data.id}`} className="opacity-75">
              <TableCell className="font-medium">
                <span className="flex items-center gap-2">
                  {row.data.name}
                  <Badge variant="outline" className="text-xs font-normal">
                    Prowlarr Sync
                  </Badge>
                </span>
              </TableCell>
              <TableCell className="text-muted-foreground text-sm max-w-64 truncate">
                {row.data.baseUrl}
              </TableCell>
              <TableCell>{row.data.priority}</TableCell>
              <TableCell className="text-center">
                <Badge
                  variant={row.data.enableRss ? "default" : "outline"}
                >
                  {row.data.enableRss ? "Yes" : "No"}
                </Badge>
              </TableCell>
              <TableCell className="text-center">
                <Badge
                  variant={
                    row.data.enableAutomaticSearch ? "default" : "outline"
                  }
                >
                  {row.data.enableAutomaticSearch ? "Yes" : "No"}
                </Badge>
              </TableCell>
              <TableCell className="text-center">
                <Badge
                  variant={
                    row.data.enableInteractiveSearch ? "default" : "outline"
                  }
                >
                  {row.data.enableInteractiveSearch ? "Yes" : "No"}
                </Badge>
              </TableCell>
              <TableCell />
            </TableRow>
          ),
        )}
      </TableBody>
    </Table>
  );
}
