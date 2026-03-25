// oxlint-disable import/prefer-default-export -- named export used by movie detail pages
import { createServerFn } from "@tanstack/react-start";
import { requireAuth } from "../middleware";
import { tmdbFetch } from "./client";
import type { TmdbMovieDetail } from "./types";
import { mapMovieStatus, transformImagePath } from "../utils/movie-helpers";

export const getTmdbMovieDetailFn = createServerFn({ method: "GET" })
  .inputValidator((d: { tmdbId: number }) => d)
  .handler(async ({ data }) => {
    await requireAuth();
    const raw = await tmdbFetch<TmdbMovieDetail>(`/movie/${data.tmdbId}`);
    const studio = raw.production_companies[0]?.name ?? "";
    return {
      ...raw,
      status: mapMovieStatus(raw.status),
      studio,
      poster_path: transformImagePath(raw.poster_path, "w500"),
      backdrop_path: transformImagePath(raw.backdrop_path, "original"),
    };
  });
