// oxlint-disable explicit-module-boundary-types -- queryOptions return type is complex generic
// oxlint-disable import/prefer-default-export -- barrel-imported; default export would break re-exports
import { queryOptions } from "@tanstack/react-query";
import {
  getIndexersFn,
  getSyncedIndexersFn,
  hasEnabledIndexersFn,
} from "src/server/indexers";
import { queryKeys } from "../query-keys";

export const indexersListQuery = () =>
  queryOptions({
    queryKey: queryKeys.indexers.lists(),
    queryFn: () => getIndexersFn(),
  });

export const syncedIndexersListQuery = () =>
  queryOptions({
    queryKey: queryKeys.syncedIndexers.lists(),
    queryFn: () => getSyncedIndexersFn(),
  });

export const hasEnabledIndexersQuery = () =>
  queryOptions({
    queryKey: queryKeys.indexers.hasEnabled(),
    queryFn: () => hasEnabledIndexersFn(),
  });
