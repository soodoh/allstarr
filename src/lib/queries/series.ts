import { queryOptions } from "@tanstack/react-query";
import { getSeriesListFn } from "src/server/series";
import { queryKeys } from "../query-keys";

export const seriesListQuery = () =>
	queryOptions({
		queryKey: queryKeys.series.list(),
		queryFn: () => getSeriesListFn(),
	});
