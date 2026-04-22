import type {
	getDashboardContentStatsFn,
	getDashboardQualityBreakdownFn,
	getDashboardRecentActivityFn,
	getDashboardStorageStatsFn,
} from "src/server/dashboard";
import type { getSystemStatusFn } from "src/server/system-status";

export * from "./authors";
export * from "./blocklist";
export * from "./books";
export * from "./dashboard";
export * from "./download-clients";
export * from "./download-profiles";
export * from "./filesystem";
export * from "./hardcover";
export * from "./history";
export * from "./imports";
export * from "./indexers";
export * from "./movies";
export * from "./queue";
export * from "./series";
export * from "./settings";
export * from "./shows";
export * from "./system-status";
export * from "./tasks";
export * from "./unmapped-files";
export * from "./user-settings";

export type DashboardContentStats = Awaited<
	ReturnType<typeof getDashboardContentStatsFn>
>;
export type DashboardContentStat =
	DashboardContentStats[keyof DashboardContentStats];
export type DashboardQualityBreakdown = Awaited<
	ReturnType<typeof getDashboardQualityBreakdownFn>
>;
export type QualityBreakdownItem =
	DashboardQualityBreakdown[keyof DashboardQualityBreakdown][number];
export type DashboardStorage = Awaited<
	ReturnType<typeof getDashboardStorageStatsFn>
>;
export type DashboardRecentActivity = Awaited<
	ReturnType<typeof getDashboardRecentActivityFn>
>;
export type RecentActivityItem = DashboardRecentActivity[number];

export type SystemStatus = Awaited<ReturnType<typeof getSystemStatusFn>>;
export type HealthCheck = SystemStatus["health"][number];
export type DiskSpaceEntry = SystemStatus["diskSpace"][number];
export type SystemAbout = SystemStatus["about"];
