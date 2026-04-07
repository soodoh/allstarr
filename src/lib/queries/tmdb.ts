import { queryOptions } from "@tanstack/react-query";
import { searchTmdbMoviesFn, searchTmdbShowsFn } from "src/server/tmdb/search";
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
