import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import ActivityFeed from "src/components/dashboard/activity-feed";
import ContentTypeCard, {
	CONTENT_CONFIGS,
} from "src/components/dashboard/content-type-card";
import SummaryRow from "src/components/dashboard/summary-row";
import PageHeader from "src/components/shared/page-header";
import {
	dashboardContentStatsQuery,
	dashboardQualityBreakdownQuery,
	dashboardRecentActivityQuery,
	dashboardStorageQuery,
} from "src/lib/queries";
import { systemStatusQuery } from "src/lib/queries/system-status";

export const Route = createFileRoute("/_authed/")({
	beforeLoad: async ({ context }) => {
		const role = context.session?.user?.role;
		if (role === "requester") {
			throw redirect({ to: "/requests" });
		}
	},
	loader: async ({ context }) => {
		await Promise.all([
			context.queryClient.ensureQueryData(dashboardContentStatsQuery()),
			context.queryClient.ensureQueryData(dashboardQualityBreakdownQuery()),
			context.queryClient.ensureQueryData(dashboardStorageQuery()),
			context.queryClient.ensureQueryData(dashboardRecentActivityQuery()),
			context.queryClient.ensureQueryData(systemStatusQuery()),
		]);
	},
	component: DashboardPage,
});

function DashboardPage() {
	const { data: contentStats } = useSuspenseQuery(dashboardContentStatsQuery());
	const { data: qualityBreakdown } = useSuspenseQuery(
		dashboardQualityBreakdownQuery(),
	);
	const { data: storage } = useSuspenseQuery(dashboardStorageQuery());
	const { data: activity } = useSuspenseQuery(dashboardRecentActivityQuery());

	return (
		<>
			<PageHeader title="Dashboard" description="Overview of your library" />

			<div className="space-y-8">
				<SummaryRow />

				<div>
					<h2 className="mb-4 text-base font-semibold text-muted-foreground">
						Content Library
					</h2>
					<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
						{CONTENT_CONFIGS.map((config) => {
							const stats = contentStats[config.key];
							const quality = qualityBreakdown[config.key];
							const storageStat = storage.byContentType.find(
								(s) => s.contentType === config.title,
							);
							const recentItems = activity.filter(
								(a) => a.contentType === config.title,
							);
							return (
								<ContentTypeCard
									key={config.key}
									config={config}
									stats={stats}
									qualityBreakdown={quality}
									storageBytes={storageStat?.totalSize ?? 0}
									storageTotalBytes={storage.totalCapacity}
									recentItems={recentItems.slice(0, 3)}
								/>
							);
						})}
					</div>
				</div>

				<ActivityFeed />
			</div>
		</>
	);
}
