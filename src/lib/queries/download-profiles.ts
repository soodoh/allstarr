import { queryOptions } from "@tanstack/react-query";
import {
	getDownloadFormatsFn,
	getDownloadProfilesFn,
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
