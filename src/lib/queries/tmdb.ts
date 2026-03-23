// oxlint-disable explicit-module-boundary-types -- queryOptions return type is complex generic
import { queryOptions } from "@tanstack/react-query";
import {
  searchTmdbMoviesFn,
  searchTmdbShowsFn,
  searchTmdbFn,
} from "src/server/tmdb/search";
import { queryKeys } from "../query-keys";

export const tmdbSearchMoviesQuery = (query: string) =>
  queryOptions({
    queryKey: queryKeys.tmdb.searchMovies(query),
    queryFn: () => searchTmdbMoviesFn({ data: { query } }),
    enabled: query.length >= 2,
  });

export const tmdbSearchShowsQuery = (query: string) =>
  queryOptions({
    queryKey: queryKeys.tmdb.searchShows(query),
    queryFn: () => searchTmdbShowsFn({ data: { query } }),
    enabled: query.length >= 2,
  });

export const tmdbSearchMultiQuery = (query: string) =>
  queryOptions({
    queryKey: queryKeys.tmdb.searchMulti(query),
    queryFn: () => searchTmdbFn({ data: { query } }),
    enabled: query.length >= 2,
  });
