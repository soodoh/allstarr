// oxlint-disable import/prefer-default-export -- named export used by movie detail pages
import { createServerFn } from "@tanstack/react-start";
import { requireAuth } from "../middleware";
import { tmdbFetch, TMDB_IMAGE_BASE } from "./client";
import type { TmdbMovieDetail } from "./types";

type MovieStatus = "tba" | "announced" | "released" | "canceled";

function mapMovieStatus(tmdbStatus: string): MovieStatus {
  switch (tmdbStatus) {
    case "Rumored":
    case "Planned": {
      return "tba";
    }
    case "In Production":
    case "Post Production": {
      return "announced";
    }
    case "Released": {
      return "released";
    }
    case "Canceled": {
      return "canceled";
    }
    default: {
      return "announced";
    }
  }
}

function transformImagePath(path: string | null, size: string): string | null {
  return path === null ? null : `${TMDB_IMAGE_BASE}/${size}${path}`;
}

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
