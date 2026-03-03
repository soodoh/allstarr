import type { JSX } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "src/components/ui/table";
import Progress from "src/components/ui/progress";
import { Badge } from "src/components/ui/badge";
import EmptyState from "src/components/shared/empty-state";
import { queueListQuery } from "src/lib/queries";
import { formatBytes } from "src/lib/format";
import { useEffect, useRef } from "react";

function formatTimeLeft(seconds: number | null): string {
  if (seconds === null || seconds <= 0) {
    return "-";
  }
  if (seconds < 60) {
    return `${seconds}s`;
  }
  if (seconds < 3600) {
    return `${Math.floor(seconds / 60)}m`;
  }
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  return `${hours}h ${mins}m`;
}

export default function QueueTab(): JSX.Element {
  const { data, isLoading } = useQuery(queueListQuery());
  const shownWarnings = useRef(new Set<string>());

  useEffect(() => {
    if (data?.warnings) {
      for (const w of data.warnings) {
        if (!shownWarnings.current.has(w)) {
          shownWarnings.current.add(w);
          toast.warning(w);
        }
      }
    }
  }, [data?.warnings]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const items = data?.items ?? [];

  if (items.length === 0) {
    return (
      <EmptyState
        icon={Download}
        title="No active downloads"
        description="Downloads from your configured clients will appear here."
      />
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Title</TableHead>
          <TableHead className="w-48">Progress</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Size</TableHead>
          <TableHead>Time Left</TableHead>
          <TableHead>Speed</TableHead>
          <TableHead>Client</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((item) => (
          <TableRow key={`${item.downloadClientId}-${item.id}`}>
            <TableCell className="font-medium max-w-xs truncate">
              {item.name}
            </TableCell>
            <TableCell>
              <div className="flex items-center gap-2">
                <Progress value={item.progress} className="flex-1" />
                <span className="text-xs text-muted-foreground w-10 text-right">
                  {item.progress}%
                </span>
              </div>
            </TableCell>
            <TableCell>
              <Badge variant="outline">{item.status}</Badge>
            </TableCell>
            <TableCell className="text-sm">{formatBytes(item.size)}</TableCell>
            <TableCell className="text-sm">
              {formatTimeLeft(item.estimatedTimeLeft)}
            </TableCell>
            <TableCell className="text-sm">
              {item.downloadSpeed > 0
                ? `${formatBytes(item.downloadSpeed)}/s`
                : "-"}
            </TableCell>
            <TableCell>
              <Badge variant="secondary">{item.downloadClientName}</Badge>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
