// oxlint-disable explicit-module-boundary-types
import { queryOptions } from "@tanstack/react-query";
import { getMangasFn, getMangaDetailFn } from "src/server/manga";
import {
  checkMangaExistsFn,
  searchMangaSourcesFn,
  getMangaSourceListFn,
} from "src/server/manga-search";
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

export const mangaExistenceQuery = (sourceId: string, sourceMangaUrl: string) =>
  queryOptions({
    queryKey: queryKeys.manga.existence(sourceId, sourceMangaUrl),
    queryFn: () => checkMangaExistsFn({ data: { sourceId, sourceMangaUrl } }),
    enabled: sourceId.length > 0 && sourceMangaUrl.length > 0,
  });

export const mangaSourcesSearchQuery = (query: string) =>
  queryOptions({
    queryKey: queryKeys.mangaSources.search(query),
    queryFn: () => searchMangaSourcesFn({ data: { query } }),
    enabled: query.length >= 2,
  });

export const mangaSourceListQuery = () =>
  queryOptions({
    queryKey: queryKeys.mangaSources.list(),
    queryFn: () => getMangaSourceListFn(),
  });
