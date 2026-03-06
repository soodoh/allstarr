import { createFileRoute } from "@tanstack/react-router";
import { Suspense } from "react";
import PageHeader from "src/components/shared/page-header";
import { TableSkeleton } from "src/components/shared/loading-skeleton";
import { historyListQuery } from "src/lib/queries";
import HistoryTab from "src/components/activity/history-tab";

export const Route = createFileRoute("/_authed/system/events")({
  loader: ({ context }) =>
    context.queryClient.ensureQueryData(historyListQuery()),
  component: EventsPage,
  pendingComponent: TableSkeleton,
});

function EventsPage() {
  return (
    <div>
      <PageHeader
        title="Events"
        description="View a log of all events — books added, updated, deleted, and more."
      />
      <Suspense fallback={<TableSkeleton />}>
        <HistoryTab />
      </Suspense>
    </div>
  );
}
