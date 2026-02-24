// oxlint-disable explicit-module-boundary-types -- queryOptions return type is complex generic
import { queryOptions } from "@tanstack/react-query";
import {
  getHardcoverAuthorFn,
  getHardcoverAuthorSeriesFn,
  getHardcoverSeriesBooksFn,
} from "~/server/search";
import { queryKeys } from "../query-keys";

type HardcoverAuthorParams = {
  page: number;
  pageSize: number;
  language: string;
  sortBy: "title" | "year" | "rating";
  sortDir: "asc" | "desc";
};

export const hardcoverAuthorQuery = (
  slug: string,
  params: HardcoverAuthorParams,
) =>
  queryOptions({
    queryKey: queryKeys.hardcover.author(slug, params),
    queryFn: () =>
      getHardcoverAuthorFn({
        data: { slug, ...params },
      }),
  });

export const hardcoverAuthorSeriesQuery = (slug: string, lang: string) =>
  queryOptions({
    queryKey: queryKeys.hardcover.authorSeries(slug, lang),
    queryFn: () =>
      getHardcoverAuthorSeriesFn({ data: { slug, language: lang } }),
  });

export const hardcoverSeriesBooksQuery = (
  seriesId: number,
  language: string,
) =>
  queryOptions({
    queryKey: queryKeys.hardcover.seriesBooks(seriesId, language),
    queryFn: () =>
      getHardcoverSeriesBooksFn({ data: { seriesId, language } }),
  });
