import { queryOptions } from "@tanstack/react-query";
import { getMetadataProfileFn, getSettingsFn } from "src/server/settings";
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
