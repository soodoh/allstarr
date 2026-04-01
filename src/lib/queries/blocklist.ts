import { queryOptions } from "@tanstack/react-query";
import { queryKeys } from "src/lib/query-keys";
import { getBlocklistFn } from "src/server/blocklist";

type BlocklistParams = {
	page?: number;
	limit?: number;
};

export type BlocklistItem = {
	id: number;
	bookId: number | null;
	authorId: number | null;
	showId: number | null;
	movieId: number | null;
	sourceTitle: string;
	protocol: string | null;
	indexer: string | null;
	message: string | null;
	source: string;
	date: Date;
	authorName: string | null;
	bookTitle: string | null;
	showTitle: string | null;
	movieTitle: string | null;
};

export type BlocklistResult = {
	items: BlocklistItem[];
	total: number;
	page: number;
	totalPages: number;
};

export const blocklistListQuery = (params: BlocklistParams = {}) =>
	queryOptions<BlocklistResult>({
		queryKey: queryKeys.blocklist.list(params),
		queryFn: () => getBlocklistFn({ data: params }) as Promise<BlocklistResult>,
	});
