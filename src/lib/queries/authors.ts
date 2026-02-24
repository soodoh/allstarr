// oxlint-disable explicit-module-boundary-types -- queryOptions return type is complex generic
import { queryOptions } from "@tanstack/react-query";
import {
  getAuthorsFn,
  getAuthorFn,
  checkAuthorExistsFn,
  checkAuthorExistsBySlugFn,
} from "~/server/authors";
import { queryKeys } from "../query-keys";

export const authorsListQuery = () =>
  queryOptions({
    queryKey: queryKeys.authors.lists(),
    queryFn: () => getAuthorsFn(),
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
