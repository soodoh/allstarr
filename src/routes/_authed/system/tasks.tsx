import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Play, Loader2, CheckCircle, XCircle, Clock } from "lucide-react";
import PageHeader from "src/components/shared/page-header";
import { TableSkeleton } from "src/components/shared/loading-skeleton";
import { scheduledTasksQuery } from "src/lib/queries";
import { useRunTask } from "src/hooks/mutations/tasks";
import { Card, CardContent } from "src/components/ui/card";
import { Badge } from "src/components/ui/badge";
import { Button } from "src/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "src/components/ui/table";
import type { ScheduledTask } from "src/server/tasks";

export const Route = createFileRoute("/_authed/system/tasks")({
  loader: ({ context }) =>
    context.queryClient.ensureQueryData(scheduledTasksQuery()),
  component: TasksPage,
  pendingComponent: () => <TableSkeleton />,
});

function plural(n: number, unit: string): string {
  return n === 1 ? `${n} ${unit}` : `${n} ${unit}s`;
}

function formatInterval(seconds: number): string {
  if (seconds < 60) {
    return `${seconds}s`;
  }
  if (seconds < 3600) {
    return plural(Math.round(seconds / 60), "minute");
  }
  if (seconds < 86_400) {
    return plural(Math.round(seconds / 3600), "hour");
  }
  return plural(Math.round(seconds / 86_400), "day");
}

function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`;
  }
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatRelativeTime(isoString: string): string {
  const date = new Date(isoString);
  const now = Date.now();
  const diffMs = now - date.getTime();

  if (diffMs < 0) {
    const absDiff = Math.abs(diffMs);
    if (absDiff < 60_000) {
      return "in < 1 minute";
    }
    if (absDiff < 3_600_000) {
      return `in ${plural(Math.round(absDiff / 60_000), "minute")}`;
    }
    return `in ${plural(Math.round(absDiff / 3_600_000), "hour")}`;
  }

  if (diffMs < 60_000) {
    return "just now";
  }
  if (diffMs < 3_600_000) {
    return `${plural(Math.round(diffMs / 60_000), "minute")} ago`;
  }
  if (diffMs < 86_400_000) {
    return `${plural(Math.round(diffMs / 3_600_000), "hour")} ago`;
  }
  return `${plural(Math.round(diffMs / 86_400_000), "day")} ago`;
}

function StatusBadge({ task }: { task: ScheduledTask }) {
  if (task.isRunning) {
    return (
      <Badge variant="outline" className="gap-1">
        <Loader2 className="h-3 w-3 animate-spin" />
        Running
      </Badge>
    );
  }

  if (!task.lastResult) {
    return (
      <Badge variant="secondary" className="gap-1">
        <Clock className="h-3 w-3" />
        Pending
      </Badge>
    );
  }

  if (task.lastResult === "success") {
    return (
      <Badge
        variant="outline"
        className="gap-1 border-green-500/50 text-green-500"
      >
        <CheckCircle className="h-3 w-3" />
        Success
      </Badge>
    );
  }

  return (
    <Badge variant="destructive" className="gap-1">
      <XCircle className="h-3 w-3" />
      Error
    </Badge>
  );
}

function TaskRow({ task }: { task: ScheduledTask }) {
  const runTask = useRunTask();

  return (
    <TableRow>
      <TableCell>
        <div>
          <div className="font-medium">{task.name}</div>
          {task.lastMessage && (
            <div className="text-xs text-muted-foreground mt-0.5">
              {task.lastMessage}
            </div>
          )}
        </div>
      </TableCell>
      <TableCell className="text-muted-foreground">
        {formatInterval(task.interval)}
      </TableCell>
      <TableCell className="text-muted-foreground">
        {task.lastExecution ? formatRelativeTime(task.lastExecution) : "Never"}
      </TableCell>
      <TableCell className="text-muted-foreground">
        {task.lastDuration !== null && task.lastDuration !== undefined
          ? formatDuration(task.lastDuration)
          : "-"}
      </TableCell>
      <TableCell className="text-muted-foreground">
        {task.nextExecution ? formatRelativeTime(task.nextExecution) : "Never"}
      </TableCell>
      <TableCell>
        <StatusBadge task={task} />
      </TableCell>
      <TableCell>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          disabled={task.isRunning || runTask.isPending}
          onClick={() => runTask.mutate(task.id)}
        >
          {task.isRunning || runTask.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Play className="h-4 w-4" />
          )}
        </Button>
      </TableCell>
    </TableRow>
  );
}

function TasksPage() {
  const { data: tasks } = useSuspenseQuery(scheduledTasksQuery());

  return (
    <div className="space-y-6">
      <PageHeader
        title="Tasks"
        description="Scheduled background tasks and their execution status."
      />

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Interval</TableHead>
                <TableHead>Last Execution</TableHead>
                <TableHead>Duration</TableHead>
                <TableHead>Next Execution</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {tasks.map((task) => (
                <TaskRow key={task.id} task={task} />
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
