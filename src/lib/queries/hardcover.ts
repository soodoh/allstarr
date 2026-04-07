import { queryOptions } from "@tanstack/react-query";
import { getSeriesFromHardcoverFn } from "src/server/authors";
import {
	getHardcoverAuthorFn,
	getHardcoverBookDetailFn,
	getHardcoverBookLanguagesFn,
} from "src/server/search";
import { queryKeys } from "../query-keys";

type HardcoverAuthorParams = {
	page: number;
	pageSize: number;
	language: string;
	sortBy: "title" | "year" | "rating" | "readers";
	sortDir: "asc" | "desc";
};

export const hardcoverAuthorQuery = (
	foreignAuthorId: number,
	params: HardcoverAuthorParams,
) =>
	queryOptions({
		queryKey: queryKeys.hardcover.author(foreignAuthorId, params),
		queryFn: () =>
			getHardcoverAuthorFn({
				data: { foreignAuthorId, ...params },
			}),
	});

export const hardcoverBookLanguagesQuery = (foreignBookId: number) =>
	queryOptions({
		queryKey: queryKeys.hardcover.bookLanguages(foreignBookId),
		queryFn: () => getHardcoverBookLanguagesFn({ data: { foreignBookId } }),
	});

export const hardcoverSingleBookQuery = (foreignBookId: number) =>
	queryOptions({
		queryKey: queryKeys.hardcover.bookDetail(foreignBookId),
		queryFn: () => getHardcoverBookDetailFn({ data: { foreignBookId } }),
	});

export const hardcoverSeriesCompleteQuery = (
	foreignSeriesIds: number[],
	excludeForeignAuthorId?: number,
) =>
	queryOptions({
		queryKey: queryKeys.hardcover.seriesComplete(
			foreignSeriesIds,
			excludeForeignAuthorId,
		),
		queryFn: () =>
			getSeriesFromHardcoverFn({
				data: { foreignSeriesIds, excludeForeignAuthorId },
			}),
		staleTime: 1000 * 60 * 30, // 30 minutes
	});
