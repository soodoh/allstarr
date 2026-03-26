// oxlint-disable import/prefer-default-export -- named export used by collection detail pages
import { createServerFn } from "@tanstack/react-start";
import { requireAuth } from "../middleware";
import { tmdbFetch } from "./client";
import { TMDB_IMAGE_BASE } from "./types";
import type { TmdbCollectionDetail } from "./types";

type CollectionPart = TmdbCollectionDetail["parts"][number];

function transformPart(part: CollectionPart): CollectionPart {
  part.poster_path = part.poster_path
    ? `${TMDB_IMAGE_BASE}/w500${part.poster_path}`
    : null;
  part.backdrop_path = part.backdrop_path
    ? `${TMDB_IMAGE_BASE}/w1280${part.backdrop_path}`
    : null;
  return part;
}

export const getTmdbCollectionDetailFn = createServerFn({ method: "GET" })
  .inputValidator((d: { tmdbId: number }) => d)
  .handler(async ({ data }) => {
    await requireAuth();
    const raw = await tmdbFetch<TmdbCollectionDetail>(
      `/collection/${data.tmdbId}`,
    );
    return {
      ...raw,
      poster_path: raw.poster_path
        ? `${TMDB_IMAGE_BASE}/w500${raw.poster_path}`
        : null,
      backdrop_path: raw.backdrop_path
        ? `${TMDB_IMAGE_BASE}/w1280${raw.backdrop_path}`
        : null,
      parts: raw.parts.map(transformPart),
    };
  });
