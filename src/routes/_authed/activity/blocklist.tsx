import { createFileRoute } from "@tanstack/react-router";
import { Suspense } from "react";
import PageHeader from "src/components/shared/page-header";
import { TableSkeleton } from "src/components/shared/loading-skeleton";
import { blocklistListQuery } from "src/lib/queries";
import BlocklistTab from "src/components/activity/blocklist-tab";

export const Route = createFileRoute("/_authed/activity/blocklist")({
  loader: ({ context }) =>
    context.queryClient.ensureQueryData(blocklistListQuery()),
  component: BlocklistPage,
  pendingComponent: TableSkeleton,
});

function BlocklistPage() {
  return (
    <div>
      <PageHeader
        title="Blocklist"
        description="Releases blocked from automatic download"
      />
      <Suspense fallback={<TableSkeleton />}>
        <BlocklistTab />
      </Suspense>
    </div>
  );
}
