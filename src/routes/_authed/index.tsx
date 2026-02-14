import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "~/components/shared/page-header";
import { LibraryStats } from "~/components/dashboard/library-stats";
import { RecentActivity } from "~/components/dashboard/recent-activity";
import { CalendarWidget } from "~/components/dashboard/calendar-widget";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { DashboardSkeleton } from "~/components/shared/loading-skeleton";
import { getDashboardStatsFn } from "~/server/dashboard";

export const Route = createFileRoute("/_authed/")({
  loader: () => getDashboardStatsFn(),
  component: DashboardPage,
  pendingComponent: DashboardSkeleton,
});

function formatBytes(bytes: number) {
  if (!bytes) return "0 GB";
  const gb = bytes / (1024 * 1024 * 1024);
  return `${gb.toFixed(1)} GB`;
}

function DashboardPage() {
  const stats = Route.useLoaderData();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        description="Welcome to Allstarr"
      />

      <LibraryStats
        authorCount={stats.authorCount}
        bookCount={stats.bookCount}
        monitoredAuthors={stats.monitoredAuthors}
        monitoredBooks={stats.monitoredBooks}
        editionCount={stats.editionCount}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <RecentActivity recentBooks={stats.recentBooks} />
        <CalendarWidget upcomingBooks={stats.upcomingBooks} />
      </div>

      {stats.rootFolders.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Disk Space</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {stats.rootFolders.map((folder) => {
              const used = (folder.totalSpace || 0) - (folder.freeSpace || 0);
              const pct =
                folder.totalSpace && folder.totalSpace > 0
                  ? (used / folder.totalSpace) * 100
                  : 0;
              return (
                <div key={folder.id} className="space-y-1">
                  <div className="flex justify-between text-sm">
                    <span className="font-mono">{folder.path}</span>
                    <span className="text-muted-foreground">
                      {formatBytes(folder.freeSpace || 0)} free /{" "}
                      {formatBytes(folder.totalSpace || 0)} total
                    </span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary rounded-full transition-all"
                      style={{ width: `${Math.min(pct, 100)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
