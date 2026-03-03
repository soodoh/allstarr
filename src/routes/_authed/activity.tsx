import { createFileRoute } from "@tanstack/react-router";
import { Suspense } from "react";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "src/components/ui/tabs";
import PageHeader from "src/components/shared/page-header";
import { TableSkeleton } from "src/components/shared/loading-skeleton";
import { blocklistListQuery } from "src/lib/queries";
import QueueTab from "src/components/activity/queue-tab";
import BlocklistTab from "src/components/activity/blocklist-tab";

export const Route = createFileRoute("/_authed/activity")({
  loader: ({ context }) =>
    context.queryClient.ensureQueryData(blocklistListQuery()),
  component: ActivityPage,
  pendingComponent: TableSkeleton,
});

function ActivityPage() {
  return (
    <div>
      <PageHeader
        title="Activity"
        description="Download queue and blocked releases"
      />

      <Tabs defaultValue="queue">
        <TabsList>
          <TabsTrigger value="queue">Queue</TabsTrigger>
          <TabsTrigger value="blocklist">Blocklist</TabsTrigger>
        </TabsList>

        <TabsContent value="queue">
          <QueueTab />
        </TabsContent>

        <TabsContent value="blocklist">
          <Suspense fallback={<TableSkeleton />}>
            <BlocklistTab />
          </Suspense>
        </TabsContent>
      </Tabs>
    </div>
  );
}
