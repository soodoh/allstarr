// oxlint-disable explicit-module-boundary-types -- queryOptions return type is complex generic
import { queryOptions } from "@tanstack/react-query";
import {
  getMoviesFn,
  getMovieDetailFn,
  checkMovieExistsFn,
} from "src/server/movies";
import { queryKeys } from "../query-keys";

export const moviesListQuery = () =>
  queryOptions({
    queryKey: queryKeys.movies.lists(),
    queryFn: () => getMoviesFn(),
  });

export const movieDetailQuery = (id: number) =>
  queryOptions({
    queryKey: queryKeys.movies.detail(id),
    queryFn: () => getMovieDetailFn({ data: { id } }),
  });

export const movieExistenceQuery = (tmdbId: number) =>
  queryOptions({
    queryKey: queryKeys.movies.existence(tmdbId),
    queryFn: () => checkMovieExistsFn({ data: { tmdbId } }),
    enabled: tmdbId > 0,
  });
