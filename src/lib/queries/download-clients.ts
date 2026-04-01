import { queryOptions } from "@tanstack/react-query";
import { getDownloadClientsFn } from "src/server/download-clients";
import { queryKeys } from "../query-keys";

export const downloadClientsListQuery = () =>
	queryOptions({
		queryKey: queryKeys.downloadClients.lists(),
		queryFn: () => getDownloadClientsFn(),
	});
