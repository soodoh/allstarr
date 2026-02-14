import { z } from "zod";

// Quality Profiles
export const qualityItemSchema = z.object({
  quality: z.object({
    id: z.number(),
    name: z.string(),
  }),
  allowed: z.boolean(),
});

export const createQualityProfileSchema = z.object({
  name: z.string().min(1, "Name is required"),
  cutoff: z.number().default(0),
  items: z.array(qualityItemSchema).default([]),
  upgradeAllowed: z.boolean().default(false),
});

export const updateQualityProfileSchema = createQualityProfileSchema.extend({
  id: z.number(),
});

// Quality Definitions
export const updateQualityDefinitionSchema = z.object({
  id: z.number(),
  title: z.string().min(1),
  weight: z.number(),
  minSize: z.number().default(0),
  maxSize: z.number().default(0),
  preferredSize: z.number().default(0),
});

// Root Folders
export const createRootFolderSchema = z.object({
  path: z.string().min(1, "Path is required"),
});

// Settings
export const updateSettingSchema = z.object({
  key: z.string().min(1),
  value: z.unknown(),
});

// Authors
export const createAuthorSchema = z.object({
  name: z.string().min(1, "Name is required"),
  sortName: z.string().min(1),
  overview: z.string().optional(),
  status: z.string().default("continuing"),
  monitored: z.boolean().default(true),
  qualityProfileId: z.number().optional(),
  rootFolderPath: z.string().optional(),
  foreignAuthorId: z.string().optional(),
  images: z
    .array(z.object({ url: z.string(), coverType: z.string() }))
    .optional(),
  tags: z.array(z.number()).optional(),
});

export const updateAuthorSchema = createAuthorSchema.extend({
  id: z.number(),
});

// Books
export const createBookSchema = z.object({
  title: z.string().min(1, "Title is required"),
  authorId: z.number(),
  overview: z.string().optional(),
  isbn: z.string().optional(),
  asin: z.string().optional(),
  releaseDate: z.string().optional(),
  monitored: z.boolean().default(true),
  foreignBookId: z.string().optional(),
  images: z
    .array(z.object({ url: z.string(), coverType: z.string() }))
    .optional(),
  ratings: z
    .object({ value: z.number(), votes: z.number() })
    .optional(),
  tags: z.array(z.number()).optional(),
});

export const updateBookSchema = createBookSchema.extend({
  id: z.number(),
});

// Editions
export const createEditionSchema = z.object({
  bookId: z.number(),
  title: z.string().min(1, "Title is required"),
  isbn: z.string().optional(),
  asin: z.string().optional(),
  format: z.string().optional(),
  pageCount: z.number().optional(),
  publisher: z.string().optional(),
  releaseDate: z.string().optional(),
  foreignEditionId: z.string().optional(),
  monitored: z.boolean().default(true),
});

export const updateEditionSchema = createEditionSchema.extend({
  id: z.number(),
});
