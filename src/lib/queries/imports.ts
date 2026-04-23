import { queryOptions } from "@tanstack/react-query";
import {
	getImportPlanFn,
	getImportReviewFn,
	getImportSourcesFn,
} from "src/server/import-sources";
import { queryKeys } from "../query-keys";

export type ImportSourceRecord = Awaited<
	ReturnType<typeof getImportSourcesFn>
>[number];

export const importSourcesQuery = () =>
	queryOptions({
		queryKey: queryKeys.imports.sources(),
		queryFn: () => getImportSourcesFn(),
	});

export const importPlanQuery = (sourceId: number | null) =>
	queryOptions({
		queryKey: queryKeys.imports.plan(sourceId ?? 0),
		queryFn: () => getImportPlanFn({ data: { sourceId: sourceId as number } }),
		enabled: sourceId !== null,
	});

export const importReviewQuery = (sourceId: number | null) =>
	queryOptions({
		queryKey: queryKeys.imports.review(sourceId ?? 0),
		queryFn: () =>
			getImportReviewFn({ data: { sourceId: sourceId as number } }),
		enabled: sourceId !== null,
	});
