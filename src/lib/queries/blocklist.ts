// oxlint-disable explicit-module-boundary-types -- queryOptions return type is complex generic
// oxlint-disable import/prefer-default-export -- barrel-imported; default export would break re-exports
import { queryOptions } from "@tanstack/react-query";
import { getBlocklistFn } from "src/server/blocklist";
import { queryKeys } from "src/lib/query-keys";

type BlocklistParams = {
  page?: number;
  limit?: number;
};

export type BlocklistItem = {
  id: number;
  bookId: number | null;
  authorId: number | null;
  sourceTitle: string;
  protocol: string | null;
  indexer: string | null;
  message: string | null;
  source: string;
  date: Date;
  authorName: string | null;
  bookTitle: string | null;
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
