// oxlint-disable explicit-module-boundary-types -- queryOptions return type is complex generic
// oxlint-disable import/prefer-default-export -- barrel-imported; default export would break re-exports
import { queryOptions } from "@tanstack/react-query";
import { getDashboardStatsFn } from "src/server/dashboard";
import { queryKeys } from "../query-keys";

export const dashboardStatsQuery = () =>
  queryOptions({
    queryKey: queryKeys.dashboard.stats(),
    queryFn: () => getDashboardStatsFn(),
  });
