// oxlint-disable explicit-module-boundary-types -- queryOptions return type is complex generic
// oxlint-disable import/prefer-default-export -- barrel-imported; default export would break re-exports
import { queryOptions } from "@tanstack/react-query";
import { getSystemStatusFn } from "src/server/system-status";
import { queryKeys } from "../query-keys";

export type {
  SystemStatus,
  HealthCheck,
  DiskSpaceEntry,
  SystemAbout,
} from "src/server/system-status";

export const systemStatusQuery = () =>
  queryOptions({
    queryKey: queryKeys.systemStatus.detail(),
    queryFn: () => getSystemStatusFn(),
  });
