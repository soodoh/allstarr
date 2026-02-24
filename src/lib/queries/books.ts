// oxlint-disable explicit-module-boundary-types -- queryOptions return type is complex generic
import { queryOptions } from "@tanstack/react-query";
import { getBooksFn, getBookFn, checkBooksExistFn } from "~/server/books";
import { queryKeys } from "../query-keys";

export const booksListQuery = () =>
  queryOptions({
    queryKey: queryKeys.books.lists(),
    queryFn: () => getBooksFn(),
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
