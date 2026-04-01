import { createFileRoute } from "@tanstack/react-router";
import { Suspense } from "react";
import HistoryTab from "src/components/activity/history-tab";
import { TableSkeleton } from "src/components/shared/loading-skeleton";
import PageHeader from "src/components/shared/page-header";
import { historyListQuery } from "src/lib/queries";

export const Route = createFileRoute("/_authed/activity/history")({
	loader: ({ context }) =>
		context.queryClient.ensureQueryData(historyListQuery()),
	component: ActivityHistoryPage,
	pendingComponent: TableSkeleton,
});

function ActivityHistoryPage() {
	return (
		<div>
			<PageHeader title="History" description="Activity log for your library" />
			<Suspense fallback={<TableSkeleton />}>
				<HistoryTab />
			</Suspense>
		</div>
	);
}
