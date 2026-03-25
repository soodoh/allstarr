import { z } from "zod";
import { monitorNewItemsEnum } from "./validators";

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
});

export const updateShowSchema = z.object({
  id: z.number(),
  downloadProfiles: z
    .array(
      z.object({
        downloadProfileId: z.number(),
        monitorNewSeasons: monitorNewItemsEnum,
      }),
    )
    .optional(),
  useSeasonFolder: z.boolean().optional(),
  seriesType: z.enum(["standard", "daily", "anime"]).optional(),
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
});

export const addMovieImportExclusionSchema = z.object({
  tmdbId: z.number(),
  title: z.string(),
  year: z.number().optional(),
});
