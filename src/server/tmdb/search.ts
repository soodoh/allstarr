// oxlint-disable import/prefer-default-export -- named exports used by search UI
import { createServerFn } from "@tanstack/react-start";
import { requireAuth } from "../middleware";
import getMediaSetting from "../settings-reader";
import { tmdbFetch, TMDB_IMAGE_BASE } from "./client";
import type {
  TmdbPaginatedResponse,
  TmdbSearchResult,
  TmdbTvResult,
  TmdbMovieResult,
} from "./types";

function transformImagePaths<
  T extends { poster_path?: string | null; backdrop_path?: string | null },
>(item: T): T {
  return {
    ...item,
    poster_path:
      item.poster_path !== null && item.poster_path !== undefined
        ? `${TMDB_IMAGE_BASE}/w500${item.poster_path}`
        : null,
    backdrop_path:
      item.backdrop_path !== null && item.backdrop_path !== undefined
        ? `${TMDB_IMAGE_BASE}/original${item.backdrop_path}`
        : null,
  };
}

function buildParams(
  query: string,
  includeAdult: boolean,
  page: number | undefined,
): Record<string, string> {
  const params: Record<string, string> = {
    query,
    include_adult: String(includeAdult),
  };
  if (page !== null && page !== undefined) {
    params.page = String(page);
  }
  return params;
}

export const searchTmdbFn = createServerFn({ method: "GET" })
  .inputValidator((d: { query: string; page?: number }) => d)
  .handler(async ({ data }) => {
    await requireAuth();
    const includeAdult = getMediaSetting<boolean>(
      "metadata.tmdb.includeAdult",
      false,
    );
    const params = buildParams(data.query, includeAdult, data.page);
    const response = await tmdbFetch<TmdbPaginatedResponse<TmdbSearchResult>>(
      "/search/multi",
      params,
    );
    return {
      ...response,
      results: response.results.map((item) => transformImagePaths(item)),
    };
  });

export const searchTmdbShowsFn = createServerFn({ method: "GET" })
  .inputValidator((d: { query: string; page?: number }) => d)
  .handler(async ({ data }) => {
    await requireAuth();
    const includeAdult = getMediaSetting<boolean>(
      "metadata.tmdb.includeAdult",
      false,
    );
    const params = buildParams(data.query, includeAdult, data.page);
    const response = await tmdbFetch<TmdbPaginatedResponse<TmdbTvResult>>(
      "/search/tv",
      params,
    );
    return {
      ...response,
      results: response.results.map((item) => transformImagePaths(item)),
    };
  });

export const searchTmdbMoviesFn = createServerFn({ method: "GET" })
  .inputValidator((d: { query: string; page?: number }) => d)
  .handler(async ({ data }) => {
    await requireAuth();
    const includeAdult = getMediaSetting<boolean>(
      "metadata.tmdb.includeAdult",
      false,
    );
    const params = buildParams(data.query, includeAdult, data.page);
    const response = await tmdbFetch<TmdbPaginatedResponse<TmdbMovieResult>>(
      "/search/movie",
      params,
    );
    return {
      ...response,
      results: response.results.map((item) => transformImagePaths(item)),
    };
  });
