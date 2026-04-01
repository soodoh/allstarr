import { queryOptions } from "@tanstack/react-query";
import { getMovieCollectionsFn } from "src/server/movie-collections";
import { queryKeys } from "../query-keys";

export const movieCollectionsListQuery = (): ReturnType<typeof queryOptions> =>
	queryOptions({
		queryKey: queryKeys.movieCollections.list(),
		queryFn: () => getMovieCollectionsFn(),
	});
