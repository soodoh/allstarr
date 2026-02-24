// oxlint-disable explicit-module-boundary-types -- queryOptions return type is complex generic
// oxlint-disable import/prefer-default-export -- barrel-imported; default export would break re-exports
import { queryOptions } from "@tanstack/react-query";
import { getSettingsFn } from "~/server/settings";
import { queryKeys } from "../query-keys";

export const settingsMapQuery = () =>
  queryOptions({
    queryKey: queryKeys.settings.map(),
    queryFn: () => getSettingsFn(),
  });
