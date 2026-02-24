// oxlint-disable explicit-module-boundary-types -- queryOptions return type is complex generic
import { queryOptions } from "@tanstack/react-query";
import {
  getQualityProfilesFn,
  getQualityDefinitionsFn,
} from "~/server/quality-profiles";
import { queryKeys } from "../query-keys";

export const qualityProfilesListQuery = () =>
  queryOptions({
    queryKey: queryKeys.qualityProfiles.lists(),
    queryFn: () => getQualityProfilesFn(),
  });

export const qualityDefinitionsListQuery = () =>
  queryOptions({
    queryKey: queryKeys.qualityDefinitions.lists(),
    queryFn: () => getQualityDefinitionsFn(),
  });
