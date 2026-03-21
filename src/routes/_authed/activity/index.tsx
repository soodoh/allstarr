import { createFileRoute } from "@tanstack/react-router";
import PageHeader from "src/components/shared/page-header";
import QueueTab from "src/components/activity/queue-tab";
import { useSSEConnection } from "src/hooks/sse-context";

export const Route = createFileRoute("/_authed/activity/")({
  component: QueuePage,
});

function QueuePage() {
  const { isConnected } = useSSEConnection();
  return (
    <div>
      <PageHeader title="Queue" description="Active and pending downloads" />
      <QueueTab isConnected={isConnected} />
    </div>
  );
}
