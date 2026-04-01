import { queryOptions } from "@tanstack/react-query";
import {
	getCustomFormatFn,
	getCustomFormatsFn,
	getProfileCustomFormatsFn,
} from "src/server/custom-formats";
import { queryKeys } from "../query-keys";

export const customFormatsListQuery = () =>
	queryOptions({
		queryKey: queryKeys.customFormats.lists(),
		queryFn: () => getCustomFormatsFn(),
	});

export const customFormatDetailQuery = (id: number) =>
	queryOptions({
		queryKey: queryKeys.customFormats.detail(id),
		queryFn: () => getCustomFormatFn({ data: { id } }),
	});

export const profileCustomFormatsQuery = (profileId: number) =>
	queryOptions({
		queryKey: queryKeys.customFormats.profileScores(profileId),
		queryFn: () => getProfileCustomFormatsFn({ data: { profileId } }),
	});
