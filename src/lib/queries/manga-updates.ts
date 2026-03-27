// oxlint-disable explicit-module-boundary-types -- queryOptions return type is complex generic
// oxlint-disable import/prefer-default-export -- consistent with other query files in this directory
import { queryOptions } from "@tanstack/react-query";
import { searchMangaFn } from "src/server/manga-search";
import { queryKeys } from "../query-keys";

export const mangaUpdatesSearchQuery = (query: string) =>
  queryOptions({
    queryKey: queryKeys.mangaUpdates.search(query),
    queryFn: () => searchMangaFn({ data: { query } }),
    enabled: query.length >= 2,
  });
