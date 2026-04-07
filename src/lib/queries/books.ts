import { infiniteQueryOptions, queryOptions } from "@tanstack/react-query";
import {
	checkBooksExistFn,
	getBookEditionsPaginatedFn,
	getBookFn,
	getPaginatedBooksFn,
} from "src/server/books";
import { queryKeys } from "../query-keys";

export const booksInfiniteQuery = (
	search = "",
	monitored?: boolean,
	sortKey?: string,
	sortDir?: string,
) =>
	infiniteQueryOptions({
		queryKey: queryKeys.books.infinite(search, monitored, sortKey, sortDir),
		queryFn: ({ pageParam }) =>
			getPaginatedBooksFn({
				data: {
					page: pageParam,
					pageSize: 25,
					search: search || undefined,
					monitored,
					sortKey,
					sortDir,
				},
			}),
		initialPageParam: 1,
		getNextPageParam: (lastPage) =>
			lastPage.page < lastPage.totalPages ? lastPage.page + 1 : undefined,
	});

export const bookEditionsInfiniteQuery = (
	bookId: number,
	sortKey?: string,
	sortDir?: string,
) =>
	infiniteQueryOptions({
		queryKey: queryKeys.books.editionsInfinite(bookId, sortKey, sortDir),
		queryFn: ({ pageParam }) =>
			getBookEditionsPaginatedFn({
				data: {
					bookId,
					page: pageParam,
					pageSize: 25,
					sortKey,
					sortDir,
				},
			}),
		initialPageParam: 1,
		getNextPageParam: (lastPage) =>
			lastPage.page < lastPage.totalPages ? lastPage.page + 1 : undefined,
	});

export const bookDetailQuery = (id: number) =>
	queryOptions({
		queryKey: queryKeys.books.detail(id),
		queryFn: () => getBookFn({ data: { id } }),
	});

export const booksExistQuery = (foreignBookIds: string[]) =>
	queryOptions({
		queryKey: queryKeys.books.existence(foreignBookIds),
		queryFn: () => checkBooksExistFn({ data: { foreignBookIds } }),
		enabled: foreignBookIds.length > 0,
	});
