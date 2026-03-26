import { z } from "zod";

export const addShowSchema = z.object({
  tmdbId: z.number(),
  downloadProfileIds: z.array(z.number()),
  monitorOption: z.enum([
    "all",
    "future",
    "missing",
    "existing",
    "pilot",
    "firstSeason",
    "lastSeason",
    "none",
  ]),
  seriesType: z.enum(["standard", "daily", "anime"]).default("standard"),
  useSeasonFolder: z.boolean().default(true),
  searchOnAdd: z.boolean().default(false),
  searchCutoffUnmet: z.boolean().default(false),
  episodeGroupId: z.string().nullable().default(null),
});

export const updateShowSchema = z.object({
  id: z.number(),
  downloadProfileIds: z.array(z.number()).optional(),
  monitorNewSeasons: z.enum(["all", "none", "new"]).optional(),
  useSeasonFolder: z.boolean().optional(),
  seriesType: z.enum(["standard", "daily", "anime"]).optional(),
  episodeGroupId: z.string().nullable().optional(),
});

export const deleteShowSchema = z.object({
  id: z.number(),
  deleteFiles: z.boolean().default(false),
});

export const addMovieSchema = z.object({
  tmdbId: z.number(),
  downloadProfileIds: z.array(z.number()),
  minimumAvailability: z
    .enum(["announced", "inCinemas", "released"])
    .default("released"),
  monitorOption: z
    .enum(["movieOnly", "movieAndCollection", "none"])
    .default("movieOnly"),
  searchOnAdd: z.boolean().default(false),
});

export const updateMovieSchema = z.object({
  id: z.number(),
  minimumAvailability: z
    .enum(["announced", "inCinemas", "released"])
    .optional(),
  downloadProfileIds: z.array(z.number()).optional(),
});

export const deleteMovieSchema = z.object({
  id: z.number(),
  deleteFiles: z.boolean().default(false),
  addImportExclusion: z.boolean().default(false),
});

export const monitorEpisodeProfileSchema = z.object({
  episodeId: z.number(),
  downloadProfileId: z.number(),
});

export const unmonitorEpisodeProfileSchema = z.object({
  episodeId: z.number(),
  downloadProfileId: z.number(),
  deleteFiles: z.boolean(),
});

export const bulkMonitorEpisodeProfileSchema = z.object({
  episodeIds: z.array(z.number()),
  downloadProfileId: z.number(),
});

export const bulkUnmonitorEpisodeProfileSchema = z.object({
  episodeIds: z.array(z.number()),
  downloadProfileId: z.number(),
  deleteFiles: z.boolean(),
});

export const refreshMovieSchema = z.object({
  movieId: z.number(),
});

export const monitorMovieProfileSchema = z.object({
  movieId: z.number(),
  downloadProfileId: z.number(),
});

export const unmonitorMovieProfileSchema = z.object({
  movieId: z.number(),
  downloadProfileId: z.number(),
});

export const monitorShowProfileSchema = z.object({
  showId: z.number(),
  downloadProfileId: z.number(),
});

export const unmonitorShowProfileSchema = z.object({
  showId: z.number(),
  downloadProfileId: z.number(),
});

export const refreshShowSchema = z.object({
  showId: z.number(),
});

export const updateMovieCollectionSchema = z.object({
  id: z.number(),
  monitored: z.boolean().optional(),
  downloadProfileIds: z.array(z.number()).optional(),
  minimumAvailability: z
    .enum(["announced", "inCinemas", "released"])
    .optional(),
});

export const addMissingCollectionMoviesSchema = z.object({
  collectionId: z.number(),
  downloadProfileIds: z.array(z.number()),
  minimumAvailability: z
    .enum(["announced", "inCinemas", "released"])
    .default("released"),
  monitorOption: z
    .enum(["movieOnly", "movieAndCollection", "none"])
    .default("movieAndCollection"),
  searchOnAdd: z.boolean().default(false),
});

export const addMovieImportExclusionSchema = z.object({
  tmdbId: z.number(),
  title: z.string(),
  year: z.number().optional(),
});
