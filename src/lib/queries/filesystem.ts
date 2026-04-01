import { queryOptions } from "@tanstack/react-query";
import { browseDirectoryFn } from "src/server/filesystem";
import { queryKeys } from "../query-keys";

export const browseDirectoryQuery = (path: string, showHidden = true) =>
	queryOptions({
		queryKey: [...queryKeys.filesystem.browse(path), showHidden],
		queryFn: () => browseDirectoryFn({ data: { path, showHidden } }),
		// Keep previously fetched directory data visible while loading the new path
		staleTime: 5000,
	});
