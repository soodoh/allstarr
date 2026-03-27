// oxlint-disable explicit-module-boundary-types
import { queryOptions } from "@tanstack/react-query";
import {
  getMangasFn,
  getMangaDetailFn,
  checkMangaExistsFn,
} from "src/server/manga";
import { queryKeys } from "../query-keys";

export const mangaListQuery = () =>
  queryOptions({
    queryKey: queryKeys.manga.lists(),
    queryFn: () => getMangasFn(),
  });

export const mangaDetailQuery = (id: number) =>
  queryOptions({
    queryKey: queryKeys.manga.detail(id),
    queryFn: () => getMangaDetailFn({ data: { id } }),
  });

export const mangaExistenceQuery = (mangaUpdatesId: number) =>
  queryOptions({
    queryKey: queryKeys.manga.existence(mangaUpdatesId),
    queryFn: () => checkMangaExistsFn({ data: { mangaUpdatesId } }),
    enabled: mangaUpdatesId > 0,
  });
