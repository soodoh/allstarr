// oxlint-disable explicit-module-boundary-types -- queryOptions return type is complex generic
// oxlint-disable import/prefer-default-export -- barrel-imported; default export would break re-exports
import { queryOptions } from "@tanstack/react-query";
import { getDownloadClientsFn } from "src/server/download-clients";
import { queryKeys } from "../query-keys";

export const downloadClientsListQuery = () =>
  queryOptions({
    queryKey: queryKeys.downloadClients.lists(),
    queryFn: () => getDownloadClientsFn(),
  });
