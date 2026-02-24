// oxlint-disable explicit-module-boundary-types -- queryOptions return type is complex generic
// oxlint-disable import/prefer-default-export -- barrel-imported; default export would break re-exports
import { queryOptions } from "@tanstack/react-query";
import { getHistoryFn } from "~/server/history";

type HistoryParams = {
  page?: number;
  limit?: number;
  eventType?: string;
};

// Manually typed to avoid the 'Register' duplicate issue with server functions
export type HistoryItem = {
  id: number;
  eventType: string;
  bookId: number | undefined;
  authorId: number | undefined;
  data: Record<string, unknown> | undefined;
  date: string;
  authorName: string | undefined;
  authorSlug: string | undefined;
  bookTitle: string | undefined;
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
    ] as const,
    // Cast needed because createServerFn types are affected by the pre-existing
    // duplicate 'Register' type issue in this project
    queryFn: () => getHistoryFn({ data: params }) as Promise<HistoryResult>,
  });
