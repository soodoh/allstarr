// oxlint-disable import/prefer-default-export -- named exports used by show detail pages
import { createServerFn } from "@tanstack/react-start";
import { requireAuth } from "../middleware";
import { tmdbFetch, TMDB_IMAGE_BASE } from "./client";
import type { TmdbShowDetail, TmdbSeasonDetail } from "./types";

type ShowStatus = "continuing" | "ended" | "canceled" | "upcoming";

function mapShowStatus(tmdbStatus: string): ShowStatus {
  switch (tmdbStatus) {
    case "Returning Series": {
      return "continuing";
    }
    case "Ended": {
      return "ended";
    }
    case "Canceled": {
      return "canceled";
    }
    case "In Production":
    case "Planned": {
      return "upcoming";
    }
    default: {
      return "continuing";
    }
  }
}

function transformImagePath(path: string | null, size: string): string | null {
  return path === null ? null : `${TMDB_IMAGE_BASE}/${size}${path}`;
}

export const getTmdbShowDetailFn = createServerFn({ method: "GET" })
  .inputValidator((d: { tmdbId: number }) => d)
  .handler(async ({ data }) => {
    await requireAuth();
    const raw = await tmdbFetch<TmdbShowDetail>(`/tv/${data.tmdbId}`, {
      append_to_response: "external_ids",
    });
    return {
      ...raw,
      status: mapShowStatus(raw.status),
      poster_path: transformImagePath(raw.poster_path, "w500"),
      backdrop_path: transformImagePath(raw.backdrop_path, "original"),
      seasons: raw.seasons.map((season) =>
        Object.assign(season, {
          poster_path: transformImagePath(season.poster_path, "w500"),
        }),
      ),
    };
  });

export const getTmdbSeasonDetailFn = createServerFn({ method: "GET" })
  .inputValidator((d: { tmdbId: number; seasonNumber: number }) => d)
  .handler(async ({ data }) => {
    await requireAuth();
    const raw = await tmdbFetch<TmdbSeasonDetail>(
      `/tv/${data.tmdbId}/season/${data.seasonNumber}`,
    );
    return {
      ...raw,
      poster_path: transformImagePath(raw.poster_path, "w500"),
      episodes: raw.episodes.map((episode) =>
        Object.assign(episode, {
          still_path: transformImagePath(episode.still_path, "w500"),
        }),
      ),
    };
  });
