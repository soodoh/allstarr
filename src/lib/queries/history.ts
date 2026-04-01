import { queryOptions } from "@tanstack/react-query";
import { getHistoryFn } from "src/server/history";

type HistoryParams = {
	page?: number;
	limit?: number;
	eventType?: string;
	bookId?: number;
};

export type HistoryItem = {
	id: number;
	eventType: string;
	bookId: number | null;
	authorId: number | null;
	data: Record<string, string | number | boolean | null> | null;
	date: Date;
	authorName: string | null;
	bookTitle: string | null;
};

export type HistoryResult = {
	items: HistoryItem[];
	total: number;
	page: number;
	totalPages: number;
};

export const historyListQuery = (params: HistoryParams = {}) =>
	queryOptions<HistoryResult>({
		queryKey: [
			"history",
			"list",
			params.page ?? 1,
			params.eventType ?? "all",
			params.bookId,
		] as const,
		queryFn: () => getHistoryFn({ data: params }) as Promise<HistoryResult>,
	});
