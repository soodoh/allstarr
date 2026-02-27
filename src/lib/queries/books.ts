// oxlint-disable explicit-module-boundary-types -- queryOptions return type is complex generic
import { queryOptions, infiniteQueryOptions } from "@tanstack/react-query";
import {
  getBooksFn,
  getPaginatedBooksFn,
  getBookFn,
  checkBooksExistFn,
} from "src/server/books";
import { queryKeys } from "../query-keys";

export const booksListQuery = () =>
  queryOptions({
    queryKey: queryKeys.books.lists(),
    queryFn: () => getBooksFn(),
  });

export const booksInfiniteQuery = (search = "") =>
  infiniteQueryOptions({
    queryKey: queryKeys.books.infinite(search),
    queryFn: ({ pageParam }) =>
      getPaginatedBooksFn({
        data: { page: pageParam, pageSize: 25, search: search || undefined },
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
