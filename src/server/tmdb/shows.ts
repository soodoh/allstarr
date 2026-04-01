import { createServerFn } from "@tanstack/react-start";
import { requireAuth } from "../middleware";
import { TMDB_IMAGE_BASE, tmdbFetch } from "./client";
import type {
	TmdbEpisodeGroupDetail,
	TmdbEpisodeGroupsResponse,
	TmdbSeasonDetail,
	TmdbShowDetail,
} from "./types";

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
			backdrop_path: transformImagePath(raw.backdrop_path, "w1280"),
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

export const getTmdbEpisodeGroupsFn = createServerFn({ method: "GET" })
	.inputValidator((d: { tmdbId: number }) => d)
	.handler(async ({ data }) => {
		await requireAuth();
		const raw = await tmdbFetch<TmdbEpisodeGroupsResponse>(
			`/tv/${data.tmdbId}/episode_groups`,
		);
		return raw.results;
	});

export const getTmdbEpisodeGroupDetailFn = createServerFn({ method: "GET" })
	.inputValidator((d: { groupId: string }) => d)
	.handler(async ({ data }) => {
		await requireAuth();
		const raw = await tmdbFetch<TmdbEpisodeGroupDetail>(
			`/tv/episode_group/${data.groupId}`,
		);
		return {
			...raw,
			groups: raw.groups
				.toSorted((a, b) => a.order - b.order)
				.map((group) => {
					group.episodes = group.episodes
						.toSorted((a, b) => a.order - b.order)
						.map((ep) => {
							ep.still_path = transformImagePath(ep.still_path, "w500");
							return ep;
						});
					return group;
				}),
		};
	});
