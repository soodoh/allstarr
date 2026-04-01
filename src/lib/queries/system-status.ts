import { queryOptions } from "@tanstack/react-query";
import { getSystemStatusFn } from "src/server/system-status";
import { queryKeys } from "../query-keys";

export type {
	DiskSpaceEntry,
	HealthCheck,
	SystemAbout,
	SystemStatus,
} from "src/server/system-status";

export const systemStatusQuery = () =>
	queryOptions({
		queryKey: queryKeys.systemStatus.detail(),
		queryFn: () => getSystemStatusFn(),
	});
