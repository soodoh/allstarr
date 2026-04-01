import { createFileRoute } from "@tanstack/react-router";
import { Suspense } from "react";
import HistoryTab from "src/components/activity/history-tab";
import { TableSkeleton } from "src/components/shared/loading-skeleton";
import PageHeader from "src/components/shared/page-header";
import { historyListQuery } from "src/lib/queries";

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
