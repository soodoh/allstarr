// oxlint-disable no-console -- Server-side fire-and-forget logging
// oxlint-disable prefer-await-to-then -- Intentional fire-and-forget pattern
import { createServerFn } from "@tanstack/react-start";
import { db } from "src/db";
import {
  shows,
  seasons,
  episodes,
  episodeFiles,
  showDownloadProfiles,
  episodeDownloadProfiles,
  history,
} from "src/db/schema";
import { eq, sql, and, desc, asc, max, inArray } from "drizzle-orm";
import { requireAuth } from "./middleware";
import {
  addShowSchema,
  updateShowSchema,
  deleteShowSchema,
  monitorEpisodeProfileSchema,
  unmonitorEpisodeProfileSchema,
  bulkMonitorEpisodeProfileSchema,
  bulkUnmonitorEpisodeProfileSchema,
  monitorShowProfileSchema,
  unmonitorShowProfileSchema,
  refreshShowSchema,
} from "src/lib/tmdb-validators";
import { tmdbFetch } from "./tmdb/client";
import { TMDB_IMAGE_BASE } from "./tmdb/types";
import type {
  TmdbShowDetail,
  TmdbSeasonDetail,
  TmdbEpisodeGroupDetail,
} from "./tmdb/types";
import { searchForShow } from "./auto-search";
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

function applyMonitoringOption(
  showId: number,
  option: MonitorOption,
  downloadProfileIds: number[],
): void {
  if (downloadProfileIds.length === 0) {
    return;
  }

  const today = new Date().toISOString().split("T")[0];

  // Get all episodes for the show
  const allEpisodes = db
    .select({
      id: episodes.id,
      seasonId: episodes.seasonId,
      episodeNumber: episodes.episodeNumber,
      airDate: episodes.airDate,
      hasFile: episodes.hasFile,
    })
    .from(episodes)
    .where(eq(episodes.showId, showId))
    .all();

  // Determine which episodes should be monitored based on option
  let monitoredEpisodes: typeof allEpisodes;

  switch (option) {
    case "all": {
      monitoredEpisodes = allEpisodes;
      break;
    }
    case "future": {
      monitoredEpisodes = allEpisodes.filter(
        (ep) =>
          ep.airDate !== null && ep.airDate !== undefined && ep.airDate > today,
      );
      break;
    }
    case "missing": {
      monitoredEpisodes = allEpisodes.filter((ep) => !ep.hasFile);
      break;
    }
    case "existing": {
      monitoredEpisodes = allEpisodes.filter((ep) => ep.hasFile);
      break;
    }
    case "pilot": {
      const pilotSeasonIds = db
        .select({ id: seasons.id })
        .from(seasons)
        .where(and(eq(seasons.showId, showId), eq(seasons.seasonNumber, 1)))
        .all()
        .map((s) => s.id);

      const pilotSet = new Set(pilotSeasonIds);
      monitoredEpisodes = allEpisodes.filter(
        (ep) => pilotSet.has(ep.seasonId) && ep.episodeNumber === 1,
      );
      break;
    }
    case "firstSeason": {
      const firstSeasonIds = db
        .select({ id: seasons.id })
        .from(seasons)
        .where(and(eq(seasons.showId, showId), eq(seasons.seasonNumber, 1)))
        .all()
        .map((s) => s.id);

      const firstSet = new Set(firstSeasonIds);
      monitoredEpisodes = allEpisodes.filter((ep) => firstSet.has(ep.seasonId));
      break;
    }
    case "lastSeason": {
      const maxSeasonRow = db
        .select({ maxNum: max(seasons.seasonNumber) })
        .from(seasons)
        .where(eq(seasons.showId, showId))
        .get();
      const lastNum = maxSeasonRow?.maxNum ?? 0;

      const lastSeasonIds = db
        .select({ id: seasons.id })
        .from(seasons)
        .where(
          and(eq(seasons.showId, showId), eq(seasons.seasonNumber, lastNum)),
        )
        .all()
        .map((s) => s.id);

      const lastSet = new Set(lastSeasonIds);
      monitoredEpisodes = allEpisodes.filter((ep) => lastSet.has(ep.seasonId));
      break;
    }
    case "none": {
      monitoredEpisodes = [];
      break;
    }
    default: {
      monitoredEpisodes = [];
      break;
    }
  }

  // Insert episodeDownloadProfiles rows for each monitored episode × each profile ID
  for (const ep of monitoredEpisodes) {
    for (const profileId of downloadProfileIds) {
      db.insert(episodeDownloadProfiles)
        .values({ episodeId: ep.id, downloadProfileId: profileId })
        .onConflictDoNothing()
        .run();
    }
  }
}

function computeAbsoluteNumbers(showId: number): void {
  // Only compute for anime shows
  const show = db
    .select({ seriesType: shows.seriesType })
    .from(shows)
    .where(eq(shows.id, showId))
    .get();

  if (!show || show.seriesType !== "anime") {
    return;
  }

  // Get non-specials seasons ordered by season number
  const nonSpecialSeasons = db
    .select({ id: seasons.id, seasonNumber: seasons.seasonNumber })
    .from(seasons)
    .where(and(eq(seasons.showId, showId), sql`${seasons.seasonNumber} > 0`))
    .orderBy(asc(seasons.seasonNumber))
    .all();

  if (nonSpecialSeasons.length === 0) {
    return;
  }

  // Get episodes for each season, ordered by episode number
  const seasonEpisodes = nonSpecialSeasons.map((season) => ({
    season,
    episodes: db
      .select({ id: episodes.id, episodeNumber: episodes.episodeNumber })
      .from(episodes)
      .where(eq(episodes.seasonId, season.id))
      .orderBy(asc(episodes.episodeNumber))
      .all(),
  }));

  // Determine numbering type
  const isSingleSeason = nonSpecialSeasons.length === 1;
  const secondSeasonEpisodes = seasonEpisodes[1]?.episodes;
  const isContinuous =
    !isSingleSeason &&
    secondSeasonEpisodes !== null &&
    secondSeasonEpisodes !== undefined &&
    secondSeasonEpisodes.length > 0 &&
    secondSeasonEpisodes[0].episodeNumber > 1;

  if (isSingleSeason || isContinuous) {
    // Episode number IS the absolute number
    for (const { episodes: eps } of seasonEpisodes) {
      for (const ep of eps) {
        db.update(episodes)
          .set({ absoluteNumber: ep.episodeNumber })
          .where(eq(episodes.id, ep.id))
          .run();
      }
    }
  } else {
    // Multi-season with reset numbering — compute cumulative
    let cumulative = 0;
    for (const { episodes: eps } of seasonEpisodes) {
      for (const ep of eps) {
        cumulative += 1;
        db.update(episodes)
          .set({ absoluteNumber: cumulative })
          .where(eq(episodes.id, ep.id))
          .run();
      }
    }
  }
}

async function importDefaultSeasons(
  showId: number,
  tmdbId: number,
): Promise<void> {
  const raw = await tmdbFetch<TmdbShowDetail>(`/tv/${tmdbId}`, {
    append_to_response: "external_ids",
  });
  for (const seasonSummary of raw.seasons) {
    const seasonDetail = await tmdbFetch<TmdbSeasonDetail>(
      `/tv/${tmdbId}/season/${seasonSummary.season_number}`,
    );
    const season = db
      .insert(seasons)
      .values({
        showId,
        seasonNumber: seasonSummary.season_number,
        overview: seasonSummary.overview || null,
        posterUrl: transformImagePath(seasonSummary.poster_path, "w500"),
      })
      .returning()
      .get();
    if (seasonDetail.episodes.length > 0) {
      db.insert(episodes)
        .values(
          seasonDetail.episodes.map((ep) => ({
            showId,
            seasonId: season.id,
            episodeNumber: ep.episode_number,
            title: ep.name,
            overview: ep.overview || null,
            airDate: ep.air_date,
            runtime: ep.runtime,
            tmdbId: ep.id,
            hasFile: false,
          })),
        )
        .run();
    }
  }
}

async function switchEpisodeGroup(
  showId: number,
  tmdbId: number,
  newGroupId: string | null,
): Promise<void> {
  // 1. Snapshot existing file records and profile links by tmdbId
  const existingEpisodes = db
    .select({ id: episodes.id, tmdbId: episodes.tmdbId })
    .from(episodes)
    .where(eq(episodes.showId, showId))
    .all();

  const snapshot = new Map<
    number,
    {
      files: Array<typeof episodeFiles.$inferSelect>;
      profileIds: number[];
    }
  >();
  for (const ep of existingEpisodes) {
    const files = db
      .select()
      .from(episodeFiles)
      .where(eq(episodeFiles.episodeId, ep.id))
      .all();
    const profiles = db
      .select({
        downloadProfileId: episodeDownloadProfiles.downloadProfileId,
      })
      .from(episodeDownloadProfiles)
      .where(eq(episodeDownloadProfiles.episodeId, ep.id))
      .all();
    snapshot.set(ep.tmdbId, {
      files,
      profileIds: profiles.map((p) => p.downloadProfileId),
    });
  }

  // 2. Delete existing seasons (cascades to episodes, files, profiles)
  db.delete(seasons).where(eq(seasons.showId, showId)).run();

  // 3. Re-import from new source
  if (newGroupId) {
    const groupDetail = await tmdbFetch<TmdbEpisodeGroupDetail>(
      `/tv/episode_group/${newGroupId}`,
    );
    await importFromEpisodeGroup(showId, groupDetail);
  } else {
    await importDefaultSeasons(showId, tmdbId);
  }

  // 4. Re-link files and profiles by tmdbId
  const newEpisodes = db
    .select({ id: episodes.id, tmdbId: episodes.tmdbId })
    .from(episodes)
    .where(eq(episodes.showId, showId))
    .all();

  for (const [epTmdbId, links] of snapshot) {
    const newEp = newEpisodes.find((e) => e.tmdbId === epTmdbId);
    if (newEp) {
      for (const file of links.files) {
        db.insert(episodeFiles)
          .values({
            episodeId: newEp.id,
            path: file.path,
            size: file.size,
            quality: file.quality,
            dateAdded: file.dateAdded,
            sceneName: file.sceneName,
            duration: file.duration,
            codec: file.codec,
            container: file.container,
          })
          .run();
        db.update(episodes)
          .set({ hasFile: true })
          .where(eq(episodes.id, newEp.id))
          .run();
      }
      for (const profileId of links.profileIds) {
        db.insert(episodeDownloadProfiles)
          .values({ episodeId: newEp.id, downloadProfileId: profileId })
          .onConflictDoNothing()
          .run();
      }
    }
  }

  // 5. Update episodeGroupId
  db.update(shows)
    .set({ episodeGroupId: newGroupId })
    .where(eq(shows.id, showId))
    .run();

  // 6. Recompute absolute numbers
  computeAbsoluteNumbers(showId);
}

async function importFromEpisodeGroup(
  showId: number,
  groupDetail: TmdbEpisodeGroupDetail,
): Promise<void> {
  const sortedGroups = groupDetail.groups.toSorted((a, b) => a.order - b.order);

  for (const group of sortedGroups) {
    const season = db
      .insert(seasons)
      .values({
        showId,
        seasonNumber: group.order,
        overview: null,
        posterUrl: null,
      })
      .returning()
      .get();

    if (group.episodes.length > 0) {
      db.insert(episodes)
        .values(
          group.episodes
            .toSorted((a, b) => a.order - b.order)
            .map((ep) => ({
              showId,
              seasonId: season.id,
              episodeNumber: ep.order + 1,
              title: ep.name,
              overview: ep.overview || null,
              airDate: ep.air_date,
              runtime: ep.runtime,
              tmdbId: ep.id,
              hasFile: false,
            })),
        )
        .run();
    }
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
    const fanartUrl = transformImagePath(raw.backdrop_path, "w1280") ?? "";
    const imdbId = raw.external_ids?.imdb_id ?? null;

    // Pre-fetch all TMDB data before the transaction
    let groupDetail: TmdbEpisodeGroupDetail | null = null;
    const seasonDetails: Array<{
      summary: (typeof raw.seasons)[0];
      detail: TmdbSeasonDetail;
    }> = [];

    if (data.episodeGroupId) {
      groupDetail = await tmdbFetch<TmdbEpisodeGroupDetail>(
        `/tv/episode_group/${data.episodeGroupId}`,
      );
    } else {
      for (const seasonSummary of raw.seasons) {
        const detail = await tmdbFetch<TmdbSeasonDetail>(
          `/tv/${data.tmdbId}/season/${seasonSummary.season_number}`,
        );
        seasonDetails.push({ summary: seasonSummary, detail });
      }
    }

    // All DB writes in a single transaction
    const show = db.transaction((tx) => {
      const showRow = tx
        .insert(shows)
        .values({
          title,
          sortTitle,
          overview: raw.overview,
          tmdbId: data.tmdbId,
          imdbId,
          status,
          seriesType: data.seriesType,
          useSeasonFolder: data.useSeasonFolder ? 1 : 0,
          network,
          year,
          runtime,
          genres,
          posterUrl,
          fanartUrl,
          episodeGroupId: data.episodeGroupId,
        })
        .returning()
        .get();

      // Insert join table for download profiles
      for (const profileId of data.downloadProfileIds) {
        tx.insert(showDownloadProfiles)
          .values({ showId: showRow.id, downloadProfileId: profileId })
          .run();
      }

      // Insert seasons and episodes
      if (groupDetail) {
        const sortedGroups = groupDetail.groups.toSorted(
          (a, b) => a.order - b.order,
        );
        for (const group of sortedGroups) {
          const season = tx
            .insert(seasons)
            .values({
              showId: showRow.id,
              seasonNumber: group.order,
              overview: null,
              posterUrl: null,
            })
            .returning()
            .get();

          if (group.episodes.length > 0) {
            tx.insert(episodes)
              .values(
                group.episodes
                  .toSorted((a, b) => a.order - b.order)
                  .map((ep) => ({
                    showId: showRow.id,
                    seasonId: season.id,
                    episodeNumber: ep.order + 1,
                    title: ep.name,
                    overview: ep.overview || null,
                    airDate: ep.air_date,
                    runtime: ep.runtime,
                    tmdbId: ep.id,
                    hasFile: false,
                  })),
              )
              .run();
          }
        }
      } else {
        for (const { summary, detail } of seasonDetails) {
          const season = tx
            .insert(seasons)
            .values({
              showId: showRow.id,
              seasonNumber: summary.season_number,
              overview: summary.overview || null,
              posterUrl: transformImagePath(summary.poster_path, "w500"),
            })
            .returning()
            .get();

          if (detail.episodes.length > 0) {
            tx.insert(episodes)
              .values(
                detail.episodes.map((ep) => ({
                  showId: showRow.id,
                  seasonId: season.id,
                  episodeNumber: ep.episode_number,
                  title: ep.name,
                  overview: ep.overview || null,
                  airDate: ep.air_date,
                  runtime: ep.runtime,
                  tmdbId: ep.id,
                  hasFile: false,
                })),
              )
              .run();
          }
        }
      }

      // Apply monitoring option
      applyMonitoringOption(
        showRow.id,
        data.monitorOption,
        data.downloadProfileIds,
      );

      // Compute absolute episode numbers for anime shows
      computeAbsoluteNumbers(showRow.id);

      // Insert history event
      tx.insert(history)
        .values({
          eventType: "showAdded",
          showId: showRow.id,
          data: { title },
        })
        .run();

      return showRow;
    });

    // Fire-and-forget search if requested (outside transaction)
    if (data.searchOnAdd || data.searchCutoffUnmet) {
      void searchForShow(show.id, data.searchCutoffUnmet).catch((error) =>
        console.error("Search after add failed:", error),
      );
    }

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

    // Fetch show-level download profile links
    const showProfileLinks = db
      .select({
        showId: showDownloadProfiles.showId,
        downloadProfileId: showDownloadProfiles.downloadProfileId,
      })
      .from(showDownloadProfiles)
      .all();

    const profilesByShow = new Map<number, number[]>();
    for (const link of showProfileLinks) {
      const arr = profilesByShow.get(link.showId) ?? [];
      arr.push(link.downloadProfileId);
      profilesByShow.set(link.showId, arr);
    }

    return rows.map((row) =>
      Object.assign(row, {
        downloadProfileIds: profilesByShow.get(row.id) ?? [],
      }),
    );
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

    // Get episode download profile IDs
    const episodeIds = showEpisodes.map((ep) => ep.id);
    const episodeProfileLinks =
      episodeIds.length > 0
        ? db
            .select({
              episodeId: episodeDownloadProfiles.episodeId,
              downloadProfileId: episodeDownloadProfiles.downloadProfileId,
            })
            .from(episodeDownloadProfiles)
            .where(inArray(episodeDownloadProfiles.episodeId, episodeIds))
            .all()
        : [];

    // Group profile IDs by episode
    const profilesByEpisode = new Map<number, number[]>();
    for (const link of episodeProfileLinks) {
      const arr = profilesByEpisode.get(link.episodeId) ?? [];
      arr.push(link.downloadProfileId);
      profilesByEpisode.set(link.episodeId, arr);
    }

    // Attach downloadProfileIds to each episode
    const episodesWithProfiles = showEpisodes.map((ep) =>
      Object.assign(ep, {
        downloadProfileIds: profilesByEpisode.get(ep.id) ?? [],
      }),
    );

    // Group episodes by season
    const episodesBySeasonId = new Map<number, typeof episodesWithProfiles>();
    for (const ep of episodesWithProfiles) {
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

    const {
      id,
      downloadProfileIds,
      monitorNewSeasons,
      useSeasonFolder,
      seriesType,
      episodeGroupId,
    } = data;

    const show = db.select().from(shows).where(eq(shows.id, id)).get();

    if (!show) {
      throw new Error("Show not found");
    }

    // Update show-level fields
    const showUpdates: Record<string, unknown> = {
      updatedAt: new Date(),
    };
    if (useSeasonFolder !== undefined) {
      showUpdates.useSeasonFolder = useSeasonFolder ? 1 : 0;
    }
    if (monitorNewSeasons) {
      showUpdates.monitorNewSeasons = monitorNewSeasons;
    }
    if (seriesType) {
      showUpdates.seriesType = seriesType;
    }
    db.update(shows).set(showUpdates).where(eq(shows.id, id)).run();

    // Handle episode group change
    if (episodeGroupId !== undefined) {
      const currentGroupId = show.episodeGroupId ?? null;
      if (currentGroupId !== episodeGroupId) {
        await switchEpisodeGroup(id, show.tmdbId, episodeGroupId);
      }
    }

    // Recompute absolute numbers if series type changed (and episode group didn't already recompute)
    if (
      seriesType &&
      seriesType !== show.seriesType &&
      episodeGroupId === undefined
    ) {
      computeAbsoluteNumbers(id);
    }

    // Update download profiles if provided
    if (downloadProfileIds !== undefined) {
      // Find which profiles were previously assigned
      const previousLinks = db
        .select({
          downloadProfileId: showDownloadProfiles.downloadProfileId,
        })
        .from(showDownloadProfiles)
        .where(eq(showDownloadProfiles.showId, id))
        .all();
      const previousProfileIds = previousLinks.map((l) => l.downloadProfileId);

      const newSet = new Set(downloadProfileIds);
      const removedProfileIds = previousProfileIds.filter(
        (pid) => !newSet.has(pid),
      );

      // Delete episode download profiles for removed profiles (PRESERVE THIS CASCADE LOGIC)
      if (removedProfileIds.length > 0) {
        const showEpisodeIds = db
          .select({ id: episodes.id })
          .from(episodes)
          .where(eq(episodes.showId, id))
          .all()
          .map((e) => e.id);

        if (showEpisodeIds.length > 0) {
          for (const removedId of removedProfileIds) {
            db.delete(episodeDownloadProfiles)
              .where(
                and(
                  inArray(episodeDownloadProfiles.episodeId, showEpisodeIds),
                  eq(episodeDownloadProfiles.downloadProfileId, removedId),
                ),
              )
              .run();
          }
        }
      }

      // Replace show download profiles
      db.delete(showDownloadProfiles)
        .where(eq(showDownloadProfiles.showId, id))
        .run();
      for (const profileId of downloadProfileIds) {
        db.insert(showDownloadProfiles)
          .values({ showId: id, downloadProfileId: profileId })
          .run();
      }
    } // end if (downloadProfileIds !== undefined)

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
          .where(inArray(episodeFiles.episodeId, episodeIds))
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

export const monitorEpisodeProfileFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => monitorEpisodeProfileSchema.parse(d))
  .handler(async ({ data }) => {
    await requireAuth();

    db.insert(episodeDownloadProfiles)
      .values({
        episodeId: data.episodeId,
        downloadProfileId: data.downloadProfileId,
      })
      .onConflictDoNothing()
      .run();

    return { success: true };
  });

export const unmonitorEpisodeProfileFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => unmonitorEpisodeProfileSchema.parse(d))
  .handler(async ({ data }) => {
    await requireAuth();

    db.delete(episodeDownloadProfiles)
      .where(
        and(
          eq(episodeDownloadProfiles.episodeId, data.episodeId),
          eq(episodeDownloadProfiles.downloadProfileId, data.downloadProfileId),
        ),
      )
      .run();

    return { success: true };
  });

export const bulkMonitorEpisodeProfileFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => bulkMonitorEpisodeProfileSchema.parse(d))
  .handler(async ({ data }) => {
    await requireAuth();

    for (const episodeId of data.episodeIds) {
      db.insert(episodeDownloadProfiles)
        .values({
          episodeId,
          downloadProfileId: data.downloadProfileId,
        })
        .onConflictDoNothing()
        .run();
    }

    return { success: true };
  });

export const bulkUnmonitorEpisodeProfileFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => bulkUnmonitorEpisodeProfileSchema.parse(d))
  .handler(async ({ data }) => {
    await requireAuth();

    if (data.episodeIds.length > 0) {
      db.delete(episodeDownloadProfiles)
        .where(
          and(
            inArray(episodeDownloadProfiles.episodeId, data.episodeIds),
            eq(
              episodeDownloadProfiles.downloadProfileId,
              data.downloadProfileId,
            ),
          ),
        )
        .run();
    }

    return { success: true };
  });

export const monitorShowProfileFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => monitorShowProfileSchema.parse(d))
  .handler(async ({ data }) => {
    await requireAuth();

    db.insert(showDownloadProfiles)
      .values({
        showId: data.showId,
        downloadProfileId: data.downloadProfileId,
      })
      .onConflictDoNothing()
      .run();

    return { success: true };
  });

export const unmonitorShowProfileFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => unmonitorShowProfileSchema.parse(d))
  .handler(async ({ data }) => {
    await requireAuth();

    db.delete(showDownloadProfiles)
      .where(
        and(
          eq(showDownloadProfiles.showId, data.showId),
          eq(showDownloadProfiles.downloadProfileId, data.downloadProfileId),
        ),
      )
      .run();

    return { success: true };
  });

export const refreshShowMetadataFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => refreshShowSchema.parse(d))
  .handler(async ({ data }) => {
    await requireAuth();

    const show = db
      .select({ id: shows.id, tmdbId: shows.tmdbId })
      .from(shows)
      .where(eq(shows.id, data.showId))
      .get();

    if (!show) {
      throw new Error("Show not found");
    }

    const raw = await tmdbFetch<TmdbShowDetail>(`/tv/${show.tmdbId}`, {
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
    const fanartUrl = transformImagePath(raw.backdrop_path, "w1280") ?? "";
    const imdbId = raw.external_ids?.imdb_id ?? null;

    db.update(shows)
      .set({
        title,
        sortTitle,
        overview: raw.overview,
        imdbId,
        status,
        network,
        year,
        runtime,
        genres,
        posterUrl,
        fanartUrl,
      })
      .where(eq(shows.id, data.showId))
      .run();

    for (const seasonSummary of raw.seasons) {
      const seasonDetail = await tmdbFetch<TmdbSeasonDetail>(
        `/tv/${show.tmdbId}/season/${seasonSummary.season_number}`,
      );

      const existingSeason = db
        .select({ id: seasons.id })
        .from(seasons)
        .where(
          and(
            eq(seasons.showId, show.id),
            eq(seasons.seasonNumber, seasonSummary.season_number),
          ),
        )
        .get();

      let seasonId: number;

      if (existingSeason) {
        db.update(seasons)
          .set({
            overview: seasonSummary.overview || null,
            posterUrl: transformImagePath(seasonSummary.poster_path, "w500"),
          })
          .where(eq(seasons.id, existingSeason.id))
          .run();
        seasonId = existingSeason.id;
      } else {
        const newSeason = db
          .insert(seasons)
          .values({
            showId: show.id,
            seasonNumber: seasonSummary.season_number,
            overview: seasonSummary.overview || null,
            posterUrl: transformImagePath(seasonSummary.poster_path, "w500"),
          })
          .returning()
          .get();
        seasonId = newSeason.id;
      }

      for (const ep of seasonDetail.episodes) {
        const existingEpisode = db
          .select({ id: episodes.id })
          .from(episodes)
          .where(
            and(
              eq(episodes.seasonId, seasonId),
              eq(episodes.episodeNumber, ep.episode_number),
            ),
          )
          .get();

        if (existingEpisode) {
          db.update(episodes)
            .set({
              title: ep.name,
              overview: ep.overview || null,
              airDate: ep.air_date,
              runtime: ep.runtime,
              tmdbId: ep.id,
            })
            .where(eq(episodes.id, existingEpisode.id))
            .run();
        } else {
          db.insert(episodes)
            .values({
              showId: show.id,
              seasonId,
              episodeNumber: ep.episode_number,
              title: ep.name,
              overview: ep.overview || null,
              airDate: ep.air_date,
              runtime: ep.runtime,
              tmdbId: ep.id,
              hasFile: false,
            })
            .run();
        }
      }
    }

    return { success: true };
  });
