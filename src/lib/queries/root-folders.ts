// oxlint-disable explicit-module-boundary-types -- queryOptions return type is complex generic
// oxlint-disable import/prefer-default-export -- barrel-imported; default export would break re-exports
import { queryOptions } from "@tanstack/react-query";
import { getRootFoldersFn } from "src/server/root-folders";
import { queryKeys } from "../query-keys";

export const rootFoldersListQuery = () =>
  queryOptions({
    queryKey: queryKeys.rootFolders.lists(),
    queryFn: () => getRootFoldersFn(),
  });
