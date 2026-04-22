import { queryOptions } from "@tanstack/react-query";
import { getImportSourcesFn } from "src/server/import-sources";
import { queryKeys } from "../query-keys";

export type ImportSourceRecord = Awaited<
	ReturnType<typeof getImportSourcesFn>
>[number];

export const importSourcesQuery = () =>
	queryOptions({
		queryKey: queryKeys.imports.sources(),
		queryFn: () => getImportSourcesFn(),
	});

// Task 6 will replace these placeholders with read-side plan/review endpoints.
export const importPlanQuery = (sourceId: number) =>
	queryOptions<never[]>({
		queryKey: queryKeys.imports.plan(sourceId),
		queryFn: async () => [],
		enabled: false,
	});

export const importReviewQuery = (sourceId: number) =>
	queryOptions<never[]>({
		queryKey: queryKeys.imports.review(sourceId),
		queryFn: async () => [],
		enabled: false,
	});
