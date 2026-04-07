import { queryOptions } from "@tanstack/react-query";
import {
	getCustomFormatsFn,
	getProfileCustomFormatsFn,
} from "src/server/custom-formats";
import { queryKeys } from "../query-keys";

export const customFormatsListQuery = () =>
	queryOptions({
		queryKey: queryKeys.customFormats.lists(),
		queryFn: () => getCustomFormatsFn(),
	});

export const profileCustomFormatsQuery = (profileId: number) =>
	queryOptions({
		queryKey: queryKeys.customFormats.profileScores(profileId),
		queryFn: () => getProfileCustomFormatsFn({ data: { profileId } }),
	});
