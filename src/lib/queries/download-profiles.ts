// oxlint-disable explicit-module-boundary-types -- queryOptions return type is complex generic
import { queryOptions } from "@tanstack/react-query";
import {
  getDownloadProfilesFn,
  getDownloadFormatsFn,
} from "src/server/download-profiles";
import { queryKeys } from "../query-keys";

export const downloadProfilesListQuery = () =>
  queryOptions({
    queryKey: queryKeys.downloadProfiles.lists(),
    queryFn: () => getDownloadProfilesFn(),
  });

export const downloadFormatsListQuery = () =>
  queryOptions({
    queryKey: queryKeys.downloadFormats.lists(),
    queryFn: () => getDownloadFormatsFn(),
  });
