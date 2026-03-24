import { createServerFn } from "@tanstack/react-start";
import { db } from "src/db";
import {
  movies,
  movieFiles,
  movieDownloadProfiles,
  history,
} from "src/db/schema";
import { eq, sql } from "drizzle-orm";
import { requireAuth } from "./middleware";
import {
  addMovieSchema,
  updateMovieSchema,
  deleteMovieSchema,
  refreshMovieSchema,
} from "src/lib/tmdb-validators";
import { tmdbFetch } from "./tmdb/client";
import { TMDB_IMAGE_BASE } from "./tmdb/types";
import type { TmdbMovieDetail } from "./tmdb/types";
import * as fs from "node:fs";

type MovieStatus = "tba" | "announced" | "inCinemas" | "released" | "deleted";

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
    default: {
      return "announced";
    }
  }
}

function transformImagePath(path: string | null, size: string): string | null {
  return path === null ? null : `${TMDB_IMAGE_BASE}/${size}${path}`;
}

function generateSortTitle(title: string): string {
  return title.replace(/^(The|A|An)\s+/i, "");
}

export const addMovieFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => addMovieSchema.parse(d))
  .handler(async ({ data }) => {
    await requireAuth();

    // Check if movie already exists
    const existing = db
      .select({ id: movies.id })
      .from(movies)
      .where(eq(movies.tmdbId, data.tmdbId))
      .get();

    if (existing) {
      throw new Error("Movie already exists");
    }

    // Fetch movie detail from TMDB
    const raw = await tmdbFetch<TmdbMovieDetail>(`/movie/${data.tmdbId}`);

    const title = raw.title;
    const sortTitle = generateSortTitle(title);
    const status = mapMovieStatus(raw.status);
    const studio = raw.production_companies[0]?.name ?? "";
    const year = raw.release_date
      ? Number.parseInt(raw.release_date.split("-")[0], 10)
      : 0;
    const runtime = raw.runtime ?? 0;
    const genres = raw.genres.map((g) => g.name);
    const posterUrl = transformImagePath(raw.poster_path, "w500") ?? "";
    const fanartUrl = transformImagePath(raw.backdrop_path, "original") ?? "";
    const imdbId = raw.imdb_id ?? null;

    // Insert movie
    const movie = db
      .insert(movies)
      .values({
        title,
        sortTitle,
        overview: raw.overview,
        tmdbId: data.tmdbId,
        imdbId,
        status,
        studio,
        year,
        runtime,
        genres,
        posterUrl,
        fanartUrl,
        minimumAvailability: data.minimumAvailability,
      })
      .returning()
      .get();

    // Insert join table for download profiles
    for (const profileId of data.downloadProfileIds) {
      db.insert(movieDownloadProfiles)
        .values({ movieId: movie.id, downloadProfileId: profileId })
        .run();
    }

    // Insert history event
    db.insert(history)
      .values({
        eventType: "movieAdded",
        movieId: movie.id,
        data: { title },
      })
      .run();

    return movie;
  });

export const getMoviesFn = createServerFn({ method: "GET" }).handler(
  async () => {
    await requireAuth();

    const rows = db
      .select({
        id: movies.id,
        title: movies.title,
        sortTitle: movies.sortTitle,
        overview: movies.overview,
        tmdbId: movies.tmdbId,
        imdbId: movies.imdbId,
        status: movies.status,
        studio: movies.studio,
        year: movies.year,
        runtime: movies.runtime,
        genres: movies.genres,
        tags: movies.tags,
        posterUrl: movies.posterUrl,
        fanartUrl: movies.fanartUrl,
        minimumAvailability: movies.minimumAvailability,
        path: movies.path,
        createdAt: movies.createdAt,
        updatedAt: movies.updatedAt,
        hasFile: sql<boolean>`CASE WHEN COUNT(${movieFiles.id}) > 0 THEN 1 ELSE 0 END`,
      })
      .from(movies)
      .leftJoin(movieFiles, eq(movieFiles.movieId, movies.id))
      .groupBy(movies.id)
      .all();

    return rows;
  },
);

export const getMovieDetailFn = createServerFn({ method: "GET" })
  .inputValidator((d: { id: number }) => d)
  .handler(async ({ data }) => {
    await requireAuth();

    const movie = db.select().from(movies).where(eq(movies.id, data.id)).get();

    if (!movie) {
      throw new Error("Movie not found");
    }

    // Get movie files
    const files = db
      .select()
      .from(movieFiles)
      .where(eq(movieFiles.movieId, data.id))
      .all();

    // Get download profile IDs
    const profileLinks = db
      .select({
        downloadProfileId: movieDownloadProfiles.downloadProfileId,
      })
      .from(movieDownloadProfiles)
      .where(eq(movieDownloadProfiles.movieId, data.id))
      .all();
    const downloadProfileIds = profileLinks.map((l) => l.downloadProfileId);

    return {
      ...movie,
      downloadProfileIds,
      files,
    };
  });

export const updateMovieFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => updateMovieSchema.parse(d))
  .handler(async ({ data }) => {
    await requireAuth();

    const { id, downloadProfileIds, ...updates } = data;

    const movie = db.select().from(movies).where(eq(movies.id, id)).get();

    if (!movie) {
      throw new Error("Movie not found");
    }

    db.update(movies)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(movies.id, id))
      .run();

    // Update download profile junctions if provided
    if (downloadProfileIds !== undefined) {
      db.delete(movieDownloadProfiles)
        .where(eq(movieDownloadProfiles.movieId, id))
        .run();
      for (const profileId of downloadProfileIds) {
        db.insert(movieDownloadProfiles)
          .values({ movieId: id, downloadProfileId: profileId })
          .run();
      }
    }

    return db.select().from(movies).where(eq(movies.id, id)).get()!;
  });

export const deleteMovieFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => deleteMovieSchema.parse(d))
  .handler(async ({ data }) => {
    await requireAuth();

    const movie = db.select().from(movies).where(eq(movies.id, data.id)).get();

    if (!movie) {
      throw new Error("Movie not found");
    }

    // If deleteFiles, find and delete all movie files from disk
    if (data.deleteFiles) {
      const files = db
        .select({ path: movieFiles.path })
        .from(movieFiles)
        .where(eq(movieFiles.movieId, data.id))
        .all();

      for (const file of files) {
        try {
          fs.unlinkSync(file.path);
        } catch {
          // File may already be missing — continue
        }
      }
    }

    // Delete movie — cascades remove files and join table
    db.delete(movies).where(eq(movies.id, data.id)).run();

    db.insert(history)
      .values({
        eventType: "movieDeleted",
        data: { title: movie.title },
      })
      .run();

    return { success: true };
  });

export const checkMovieExistsFn = createServerFn({ method: "GET" })
  .inputValidator((d: { tmdbId: number }) => d)
  .handler(async ({ data }) => {
    await requireAuth();
    const movie = db
      .select({ id: movies.id })
      .from(movies)
      .where(eq(movies.tmdbId, data.tmdbId))
      .get();
    return movie !== undefined;
  });

export const refreshMovieMetadataFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => refreshMovieSchema.parse(d))
  .handler(async ({ data }) => {
    await requireAuth();

    const movie = db
      .select({ id: movies.id, tmdbId: movies.tmdbId })
      .from(movies)
      .where(eq(movies.id, data.movieId))
      .get();

    if (!movie) {
      throw new Error("Movie not found");
    }

    const raw = await tmdbFetch<TmdbMovieDetail>(`/movie/${movie.tmdbId}`);

    const title = raw.title;
    const sortTitle = generateSortTitle(title);
    const status = mapMovieStatus(raw.status);
    const studio = raw.production_companies[0]?.name ?? "";
    const year = raw.release_date
      ? Number.parseInt(raw.release_date.split("-")[0], 10)
      : 0;
    const runtime = raw.runtime ?? 0;
    const genres = raw.genres.map((g) => g.name);
    const posterUrl = transformImagePath(raw.poster_path, "w500") ?? "";
    const fanartUrl = transformImagePath(raw.backdrop_path, "original") ?? "";
    const imdbId = raw.imdb_id ?? null;

    db.update(movies)
      .set({
        title,
        sortTitle,
        overview: raw.overview,
        imdbId,
        status,
        studio,
        year,
        runtime,
        genres,
        posterUrl,
        fanartUrl,
      })
      .where(eq(movies.id, data.movieId))
      .run();

    return { success: true };
  });
