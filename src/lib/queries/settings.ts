// oxlint-disable explicit-module-boundary-types -- queryOptions return type is complex generic
import { queryOptions } from "@tanstack/react-query";
import { getSettingsFn, getMetadataProfileFn } from "src/server/settings";
import { queryKeys } from "../query-keys";

export const settingsMapQuery = () =>
  queryOptions({
    queryKey: queryKeys.settings.map(),
    queryFn: () => getSettingsFn(),
  });

export const metadataProfileQuery = () =>
  queryOptions({
    queryKey: queryKeys.metadataProfile.all,
    queryFn: () => getMetadataProfileFn(),
  });
