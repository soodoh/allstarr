// oxlint-disable explicit-module-boundary-types -- queryOptions return type is complex generic
import { queryOptions, infiniteQueryOptions } from "@tanstack/react-query";
import {
  getAuthorsFn,
  getPaginatedAuthorsFn,
  getAuthorFn,
  checkAuthorExistsFn,
  checkAuthorExistsBySlugFn,
} from "src/server/authors";
import { queryKeys } from "../query-keys";

export const authorsListQuery = () =>
  queryOptions({
    queryKey: queryKeys.authors.lists(),
    queryFn: () => getAuthorsFn(),
  });

export const authorsInfiniteQuery = (search = "") =>
  infiniteQueryOptions({
    queryKey: queryKeys.authors.infinite(search),
    queryFn: ({ pageParam }) =>
      getPaginatedAuthorsFn({
        data: { page: pageParam, pageSize: 25, search: search || undefined },
      }),
    initialPageParam: 1,
    getNextPageParam: (lastPage) =>
      lastPage.page < lastPage.totalPages ? lastPage.page + 1 : undefined,
  });

export const authorDetailQuery = (id: number) =>
  queryOptions({
    queryKey: queryKeys.authors.detail(id),
    queryFn: () => getAuthorFn({ data: { id } }),
  });

export const authorExistsQuery = (foreignAuthorId: string) =>
  queryOptions({
    queryKey: queryKeys.authors.existence(foreignAuthorId),
    queryFn: () => checkAuthorExistsFn({ data: { foreignAuthorId } }),
  });

export const authorExistsBySlugQuery = (slug: string) =>
  queryOptions({
    queryKey: queryKeys.authors.existenceBySlug(slug),
    queryFn: () => checkAuthorExistsBySlugFn({ data: { slug } }),
  });
