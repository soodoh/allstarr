import { createServerFn } from "@tanstack/react-start";
import { db } from "src/db";
import {
  shows,
  seasons,
  episodes,
  episodeFiles,
  showDownloadProfiles,
  history,
} from "src/db/schema";
import { eq, sql, and, desc, max } from "drizzle-orm";
import { requireAuth } from "./middleware";
import {
  addShowSchema,
  updateShowSchema,
  deleteShowSchema,
} from "src/lib/tmdb-validators";
import { tmdbFetch } from "./tmdb/client";
import { TMDB_IMAGE_BASE } from "./tmdb/types";
import type { TmdbShowDetail, TmdbSeasonDetail } from "./tmdb/types";
import * as fs from "node:fs";

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

function generateSortTitle(title: string): string {
  return title.replace(/^(The|A|An)\s+/i, "");
}

type MonitorOption =
  | "all"
  | "future"
  | "missing"
  | "existing"
  | "pilot"
  | "firstSeason"
  | "lastSeason"
  | "none";

function applyMonitoringOption(showId: number, option: MonitorOption): void {
  const today = new Date().toISOString().split("T")[0];

  switch (option) {
    case "all": {
      // All episodes default to monitored=true, nothing to do
      break;
    }
    case "future": {
      db.update(episodes)
        .set({ monitored: false })
        .where(
          and(
            eq(episodes.showId, showId),
            sql`(${episodes.airDate} IS NULL OR ${episodes.airDate} <= ${today})`,
          ),
        )
        .run();
      break;
    }
    case "missing": {
      db.update(episodes)
        .set({ monitored: false })
        .where(and(eq(episodes.showId, showId), eq(episodes.hasFile, true)))
        .run();
      break;
    }
    case "existing": {
      db.update(episodes)
        .set({ monitored: false })
        .where(and(eq(episodes.showId, showId), eq(episodes.hasFile, false)))
        .run();
      break;
    }
    case "pilot": {
      applyPilotMonitoring(showId);
      break;
    }
    case "firstSeason": {
      applySeasonMonitoring(showId, 1);
      break;
    }
    case "lastSeason": {
      const maxSeasonRow = db
        .select({ maxNum: max(seasons.seasonNumber) })
        .from(seasons)
        .where(eq(seasons.showId, showId))
        .get();
      applySeasonMonitoring(showId, maxSeasonRow?.maxNum ?? 0);
      break;
    }
    case "none": {
      db.update(episodes)
        .set({ monitored: false })
        .where(eq(episodes.showId, showId))
        .run();
      break;
    }
    default: {
      // Exhaustive check — all monitor options handled above
      break;
    }
  }
}

function applyPilotMonitoring(showId: number): void {
  const pilotSeasonIds = db
    .select({ id: seasons.id })
    .from(seasons)
    .where(and(eq(seasons.showId, showId), eq(seasons.seasonNumber, 1)))
    .all()
    .map((s) => s.id);

  if (pilotSeasonIds.length > 0) {
    db.update(episodes)
      .set({ monitored: false })
      .where(
        and(
          eq(episodes.showId, showId),
          sql`NOT (${episodes.seasonId} IN (${sql.join(pilotSeasonIds.map((id) => sql`${id}`))}) AND ${episodes.episodeNumber} = 1)`,
        ),
      )
      .run();
  } else {
    db.update(episodes)
      .set({ monitored: false })
      .where(eq(episodes.showId, showId))
      .run();
  }
}

function applySeasonMonitoring(showId: number, seasonNumber: number): void {
  const seasonIds = db
    .select({ id: seasons.id })
    .from(seasons)
    .where(
      and(eq(seasons.showId, showId), eq(seasons.seasonNumber, seasonNumber)),
    )
    .all()
    .map((s) => s.id);

  if (seasonIds.length > 0) {
    db.update(episodes)
      .set({ monitored: false })
      .where(
        and(
          eq(episodes.showId, showId),
          sql`${episodes.seasonId} NOT IN (${sql.join(seasonIds.map((id) => sql`${id}`))})`,
        ),
      )
      .run();
  }
}

export const addShowFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => addShowSchema.parse(d))
  .handler(async ({ data }) => {
    await requireAuth();

    // Check if show already exists
    const existing = db
      .select({ id: shows.id })
      .from(shows)
      .where(eq(shows.tmdbId, data.tmdbId))
      .get();

    if (existing) {
      throw new Error("Show already exists");
    }

    // Fetch show detail from TMDB
    const raw = await tmdbFetch<TmdbShowDetail>(`/tv/${data.tmdbId}`, {
      append_to_response: "external_ids",
    });

    const title = raw.name;
    const sortTitle = generateSortTitle(title);
    const status = mapShowStatus(raw.status);
    const network = raw.networks[0]?.name ?? "";
    const year = raw.first_air_date
      ? Number.parseInt(raw.first_air_date.split("-")[0], 10)
      : 0;
    const runtime = raw.episode_run_time[0] ?? 0;
    const genres = raw.genres.map((g) => g.name);
    const posterUrl = transformImagePath(raw.poster_path, "w500") ?? "";
    const fanartUrl = transformImagePath(raw.backdrop_path, "original") ?? "";
    const imdbId = raw.external_ids?.imdb_id ?? null;

    // Insert show
    const show = db
      .insert(shows)
      .values({
        title,
        sortTitle,
        overview: raw.overview,
        tmdbId: data.tmdbId,
        imdbId,
        status,
        seriesType: "standard",
        network,
        year,
        runtime,
        genres,
        posterUrl,
        fanartUrl,
        monitored: true,
      })
      .returning()
      .get();

    // Insert join table for download profile
    db.insert(showDownloadProfiles)
      .values({
        showId: show.id,
        downloadProfileId: data.downloadProfileId,
      })
      .run();

    // Fetch and insert seasons and episodes
    for (const seasonSummary of raw.seasons) {
      const seasonDetail = await tmdbFetch<TmdbSeasonDetail>(
        `/tv/${data.tmdbId}/season/${seasonSummary.season_number}`,
      );

      const season = db
        .insert(seasons)
        .values({
          showId: show.id,
          seasonNumber: seasonSummary.season_number,
          monitored: true,
          overview: seasonSummary.overview || null,
          posterUrl: transformImagePath(seasonSummary.poster_path, "w500"),
        })
        .returning()
        .get();

      // Insert episodes for this season
      if (seasonDetail.episodes.length > 0) {
        db.insert(episodes)
          .values(
            seasonDetail.episodes.map((ep) => ({
              showId: show.id,
              seasonId: season.id,
              episodeNumber: ep.episode_number,
              title: ep.name,
              overview: ep.overview || null,
              airDate: ep.air_date,
              runtime: ep.runtime,
              tmdbId: ep.id,
              hasFile: false,
              monitored: true,
            })),
          )
          .run();
      }
    }

    // Apply monitoring option
    applyMonitoringOption(show.id, data.monitorOption);

    // Insert history event
    db.insert(history)
      .values({
        eventType: "showAdded",
        showId: show.id,
        data: { title },
      })
      .run();

    return show;
  });

export const getShowsFn = createServerFn({ method: "GET" }).handler(
  async () => {
    await requireAuth();

    const rows = db
      .select({
        id: shows.id,
        title: shows.title,
        sortTitle: shows.sortTitle,
        overview: shows.overview,
        tmdbId: shows.tmdbId,
        imdbId: shows.imdbId,
        status: shows.status,
        seriesType: shows.seriesType,
        network: shows.network,
        year: shows.year,
        runtime: shows.runtime,
        genres: shows.genres,
        tags: shows.tags,
        posterUrl: shows.posterUrl,
        fanartUrl: shows.fanartUrl,
        monitored: shows.monitored,
        path: shows.path,
        createdAt: shows.createdAt,
        updatedAt: shows.updatedAt,
        seasonCount: sql<number>`COUNT(DISTINCT ${seasons.id})`,
        episodeCount: sql<number>`COUNT(${episodes.id})`,
        episodeFileCount: sql<number>`SUM(CASE WHEN ${episodes.hasFile} = 1 THEN 1 ELSE 0 END)`,
      })
      .from(shows)
      .leftJoin(seasons, eq(seasons.showId, shows.id))
      .leftJoin(episodes, eq(episodes.showId, shows.id))
      .groupBy(shows.id)
      .orderBy(desc(shows.createdAt))
      .all();

    return rows;
  },
);

export const getShowDetailFn = createServerFn({ method: "GET" })
  .inputValidator((d: { id: number }) => d)
  .handler(async ({ data }) => {
    await requireAuth();

    const show = db.select().from(shows).where(eq(shows.id, data.id)).get();

    if (!show) {
      throw new Error("Show not found");
    }

    // Get all seasons for this show
    const showSeasons = db
      .select()
      .from(seasons)
      .where(eq(seasons.showId, data.id))
      .orderBy(seasons.seasonNumber)
      .all();

    // Get all episodes for this show
    const showEpisodes = db
      .select()
      .from(episodes)
      .where(eq(episodes.showId, data.id))
      .orderBy(episodes.episodeNumber)
      .all();

    // Group episodes by season
    const episodesBySeasonId = new Map<number, typeof showEpisodes>();
    for (const ep of showEpisodes) {
      const arr = episodesBySeasonId.get(ep.seasonId) ?? [];
      arr.push(ep);
      episodesBySeasonId.set(ep.seasonId, arr);
    }

    const seasonsWithEpisodes = showSeasons.map((season) =>
      Object.assign(season, {
        episodes: episodesBySeasonId.get(season.id) ?? [],
      }),
    );

    // Get download profile IDs
    const profileLinks = db
      .select({
        downloadProfileId: showDownloadProfiles.downloadProfileId,
      })
      .from(showDownloadProfiles)
      .where(eq(showDownloadProfiles.showId, data.id))
      .all();
    const downloadProfileIds = profileLinks.map((l) => l.downloadProfileId);

    return {
      ...show,
      downloadProfileIds,
      seasons: seasonsWithEpisodes,
    };
  });

export const updateShowFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => updateShowSchema.parse(d))
  .handler(async ({ data }) => {
    await requireAuth();

    const { id, downloadProfileId, ...updates } = data;

    const show = db.select().from(shows).where(eq(shows.id, id)).get();

    if (!show) {
      throw new Error("Show not found");
    }

    db.update(shows)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(shows.id, id))
      .run();

    // Update download profile junction if provided
    if (downloadProfileId !== undefined) {
      db.delete(showDownloadProfiles)
        .where(eq(showDownloadProfiles.showId, id))
        .run();
      db.insert(showDownloadProfiles)
        .values({ showId: id, downloadProfileId })
        .run();
    }

    return db.select().from(shows).where(eq(shows.id, id)).get()!;
  });

export const deleteShowFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => deleteShowSchema.parse(d))
  .handler(async ({ data }) => {
    await requireAuth();

    const show = db.select().from(shows).where(eq(shows.id, data.id)).get();

    if (!show) {
      throw new Error("Show not found");
    }

    // If deleteFiles, find and delete all episode files from disk
    if (data.deleteFiles) {
      const showEpisodes = db
        .select({ id: episodes.id })
        .from(episodes)
        .where(eq(episodes.showId, data.id))
        .all();

      const episodeIds = showEpisodes.map((ep) => ep.id);

      if (episodeIds.length > 0) {
        const files = db
          .select({ path: episodeFiles.path })
          .from(episodeFiles)
          .where(
            sql`${episodeFiles.episodeId} IN (${sql.join(episodeIds.map((id) => sql`${id}`))})`,
          )
          .all();

        for (const file of files) {
          try {
            fs.unlinkSync(file.path);
          } catch {
            // File may already be missing — continue
          }
        }
      }
    }

    // Delete show — cascades remove seasons, episodes, episode files, join table
    db.delete(shows).where(eq(shows.id, data.id)).run();

    db.insert(history)
      .values({
        eventType: "showDeleted",
        data: { title: show.title },
      })
      .run();

    return { success: true };
  });

export const checkShowExistsFn = createServerFn({ method: "GET" })
  .inputValidator((d: { tmdbId: number }) => d)
  .handler(async ({ data }) => {
    await requireAuth();
    const show = db
      .select({ id: shows.id, title: shows.title })
      .from(shows)
      .where(eq(shows.tmdbId, data.tmdbId))
      .get();
    return show ?? null;
  });
