import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import {
  CheckCircle,
  AlertCircle,
  AlertTriangle,
  HardDrive,
} from "lucide-react";
import PageHeader from "src/components/shared/page-header";
import { SystemStatusSkeleton } from "src/components/shared/loading-skeleton";
import { systemStatusQuery } from "src/lib/queries";
import type { HealthCheck, DiskSpaceEntry } from "src/lib/queries";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "src/components/ui/card";
import { Badge } from "src/components/ui/badge";

export const Route = createFileRoute("/_authed/system/status")({
  loader: ({ context }) =>
    context.queryClient.ensureQueryData(systemStatusQuery()),
  component: SystemStatusPage,
  pendingComponent: SystemStatusSkeleton,
});

function formatBytes(bytes: number): string {
  if (bytes === 0) {
    return "0 B";
  }
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const value = bytes / 1024 ** i;
  return `${value.toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const parts: string[] = [];
  if (days > 0) {
    parts.push(`${days}d`);
  }
  if (hours > 0) {
    parts.push(`${hours}h`);
  }
  parts.push(`${minutes}m`);
  return parts.join(" ");
}

function HealthSection({ checks }: { checks: HealthCheck[] }) {
  if (checks.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Health</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 text-green-500">
            <CheckCircle className="h-5 w-5" />
            <span>All systems healthy</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Health</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {checks.map((check) => (
          <div
            key={`${check.source}-${check.message}`}
            className="flex items-start gap-3"
          >
            {check.type === "error" ? (
              <AlertCircle className="h-5 w-5 shrink-0 text-destructive mt-0.5" />
            ) : (
              <AlertTriangle className="h-5 w-5 shrink-0 text-yellow-500 mt-0.5" />
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <Badge
                  variant={check.type === "error" ? "destructive" : "outline"}
                >
                  {check.source}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">{check.message}</p>
            </div>
            {check.wikiUrl && (
              <Link
                to={check.wikiUrl}
                className="text-sm text-primary hover:underline shrink-0"
              >
                Fix
              </Link>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function DiskSpaceSection({ disks }: { disks: DiskSpaceEntry[] }) {
  if (disks.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Disk Space</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 text-muted-foreground">
            <HardDrive className="h-5 w-5" />
            <span className="text-sm">No root folders configured.</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Disk Space</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {disks.map((disk) => {
          const used = disk.totalSpace - disk.freeSpace;
          const pct = disk.totalSpace > 0 ? (used / disk.totalSpace) * 100 : 0;
          let barColor = "bg-primary";
          if (pct > 90) {
            barColor = "bg-destructive";
          } else if (pct > 75) {
            barColor = "bg-yellow-500";
          }

          return (
            <div key={disk.path} className="space-y-1">
              <div className="flex flex-col gap-1 text-sm sm:flex-row sm:justify-between">
                <span className="font-mono break-all">{disk.path}</span>
                <span className="text-muted-foreground shrink-0">
                  {formatBytes(disk.freeSpace)} free /{" "}
                  {formatBytes(disk.totalSpace)} total
                </span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${barColor}`}
                  style={{ width: `${Math.min(pct, 100)}%` }}
                />
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

function SystemStatusPage() {
  const { data: status } = useSuspenseQuery(systemStatusQuery());

  const aboutRows = [
    { label: "Version", value: status.about.version },
    { label: "Bun", value: status.about.runtimeVersion },
    { label: "SQLite", value: status.about.sqliteVersion },
    { label: "Database", value: status.about.databasePath },
    { label: "DB Size", value: formatBytes(status.about.databaseSize) },
    { label: "OS", value: status.about.osInfo },
    { label: "Docker", value: status.about.isDocker ? "Yes" : "No" },
    { label: "Uptime", value: formatUptime(status.about.uptimeSeconds) },
    {
      label: "Start Time",
      value: new Date(status.about.startTime).toLocaleString(),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Status"
        description="Health checks, disk space, and system information."
      />

      <HealthSection checks={status.health} />
      <DiskSpaceSection disks={status.diskSpace} />

      <Card>
        <CardHeader>
          <CardTitle>About</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3">
            {aboutRows.map((row) => (
              <div
                key={row.label}
                className="flex justify-between gap-4 text-sm"
              >
                <span className="text-muted-foreground">{row.label}</span>
                <span className="font-mono text-right break-all">
                  {row.value}
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
