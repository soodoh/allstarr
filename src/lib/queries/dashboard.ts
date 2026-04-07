import { queryOptions } from "@tanstack/react-query";
import {
	getDashboardContentStatsFn,
	getDashboardQualityBreakdownFn,
	getDashboardRecentActivityFn,
	getDashboardStorageStatsFn,
} from "src/server/dashboard";
import { queryKeys } from "../query-keys";

export const dashboardContentStatsQuery = () =>
	queryOptions({
		queryKey: queryKeys.dashboard.contentStats(),
		queryFn: () => getDashboardContentStatsFn(),
	});

export const dashboardQualityBreakdownQuery = () =>
	queryOptions({
		queryKey: queryKeys.dashboard.qualityBreakdown(),
		queryFn: () => getDashboardQualityBreakdownFn(),
	});

export const dashboardStorageQuery = () =>
	queryOptions({
		queryKey: queryKeys.dashboard.storage(),
		queryFn: () => getDashboardStorageStatsFn(),
	});

export const dashboardRecentActivityQuery = () =>
	queryOptions({
		queryKey: queryKeys.dashboard.recentActivity(),
		queryFn: () => getDashboardRecentActivityFn(),
	});
