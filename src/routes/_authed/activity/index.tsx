import { createFileRoute } from "@tanstack/react-router";
import PageHeader from "src/components/shared/page-header";
import QueueTab from "src/components/activity/queue-tab";

export const Route = createFileRoute("/_authed/activity/")({
  component: QueuePage,
});

function QueuePage() {
  return (
    <div>
      <PageHeader title="Queue" description="Active and pending downloads" />
      <QueueTab />
    </div>
  );
}
