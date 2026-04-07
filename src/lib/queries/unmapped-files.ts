import { queryOptions } from "@tanstack/react-query";
import {
	getUnmappedFileCountFn,
	getUnmappedFilesFn,
} from "src/server/unmapped-files";
import { queryKeys } from "../query-keys";

export const unmappedFilesListQuery = (
	params: { showIgnored?: boolean; contentType?: string; search?: string } = {},
) =>
	queryOptions({
		queryKey: queryKeys.unmappedFiles.list(params),
		queryFn: () => getUnmappedFilesFn({ data: params }),
	});

export const unmappedFilesCountQuery = () =>
	queryOptions({
		queryKey: queryKeys.unmappedFiles.count(),
		queryFn: () => getUnmappedFileCountFn(),
	});
