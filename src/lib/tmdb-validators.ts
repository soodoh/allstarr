import { z } from "zod";

export const addShowSchema = z.object({
  tmdbId: z.number(),
  downloadProfileId: z.number(),
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
  monitored: z.boolean().optional(),
  seriesType: z.enum(["standard", "daily", "anime"]).optional(),
});

export const deleteShowSchema = z.object({
  id: z.number(),
  deleteFiles: z.boolean().default(false),
});

export const addMovieSchema = z.object({
  tmdbId: z.number(),
  downloadProfileId: z.number(),
  minimumAvailability: z
    .enum(["announced", "inCinemas", "released"])
    .default("released"),
});

export const updateMovieSchema = z.object({
  id: z.number(),
  monitored: z.boolean().optional(),
  minimumAvailability: z
    .enum(["announced", "inCinemas", "released"])
    .optional(),
});

export const deleteMovieSchema = z.object({
  id: z.number(),
  deleteFiles: z.boolean().default(false),
});
