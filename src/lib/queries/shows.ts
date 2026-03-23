// oxlint-disable explicit-module-boundary-types -- queryOptions return type is complex generic
import { queryOptions } from "@tanstack/react-query";
import {
  getShowsFn,
  getShowDetailFn,
  checkShowExistsFn,
} from "src/server/shows";
import { queryKeys } from "../query-keys";

export const showsListQuery = () =>
  queryOptions({
    queryKey: queryKeys.shows.lists(),
    queryFn: () => getShowsFn(),
  });

export const showDetailQuery = (id: number) =>
  queryOptions({
    queryKey: queryKeys.shows.detail(id),
    queryFn: () => getShowDetailFn({ data: { id } }),
  });

export const showExistenceQuery = (tmdbId: number) =>
  queryOptions({
    queryKey: queryKeys.shows.existence(tmdbId),
    queryFn: () => checkShowExistsFn({ data: { tmdbId } }),
    enabled: tmdbId > 0,
  });
