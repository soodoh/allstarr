// oxlint-disable explicit-module-boundary-types -- queryOptions return type is complex generic
import { queryOptions } from "@tanstack/react-query";
import {
  getHardcoverAuthorFn,
  getHardcoverAuthorSeriesFn,
  getHardcoverSeriesBooksFn,
  getHardcoverBookEditionsFn,
  getHardcoverBookLanguagesFn,
  getHardcoverBookDetailFn,
} from "src/server/search";
import type { EditionSortKey } from "src/server/search";
import { getSeriesFromHardcoverFn } from "src/server/authors";
import { queryKeys } from "../query-keys";

type HardcoverAuthorParams = {
  page: number;
  pageSize: number;
  language: string;
  sortBy: "title" | "year" | "rating";
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

export const hardcoverAuthorSeriesQuery = (slug: string, lang: string) =>
  queryOptions({
    queryKey: queryKeys.hardcover.authorSeries(slug, lang),
    queryFn: () =>
      getHardcoverAuthorSeriesFn({ data: { slug, language: lang } }),
  });

export const hardcoverSeriesBooksQuery = (seriesId: number, language: string) =>
  queryOptions({
    queryKey: queryKeys.hardcover.seriesBooks(seriesId, language),
    queryFn: () => getHardcoverSeriesBooksFn({ data: { seriesId, language } }),
  });

type HardcoverBookEditionsParams = {
  page: number;
  pageSize: number;
  sortBy: EditionSortKey;
  sortDir: "asc" | "desc";
};

export const hardcoverBookEditionsQuery = (
  foreignBookId: number,
  params: HardcoverBookEditionsParams,
) =>
  queryOptions({
    queryKey: queryKeys.hardcover.bookEditions(foreignBookId, params),
    queryFn: () =>
      getHardcoverBookEditionsFn({
        data: { foreignBookId, ...params },
      }),
  });

export const hardcoverBookLanguagesQuery = (foreignBookId: number) =>
  queryOptions({
    queryKey: queryKeys.hardcover.bookLanguages(foreignBookId),
    queryFn: () =>
      getHardcoverBookLanguagesFn({ data: { foreignBookId } }),
  });

export const hardcoverSingleBookQuery = (foreignBookId: number) =>
  queryOptions({
    queryKey: queryKeys.hardcover.bookDetail(foreignBookId),
    queryFn: () =>
      getHardcoverBookDetailFn({ data: { foreignBookId } }),
  });

export const hardcoverSeriesCompleteQuery = (foreignSeriesIds: number[]) =>
  queryOptions({
    queryKey: queryKeys.hardcover.seriesComplete(foreignSeriesIds),
    queryFn: () =>
      getSeriesFromHardcoverFn({ data: { foreignSeriesIds } }),
    staleTime: 1000 * 60 * 30, // 30 minutes
  });
