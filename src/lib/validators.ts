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

export const browseDirectorySchema = z.object({
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
  ratings: z.object({ value: z.number(), votes: z.number() }).optional(),
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

// Download Clients
export const downloadClientImplementationEnum = z.enum([
  "qBittorrent",
  "Transmission",
  "Deluge",
  "rTorrent",
  "SABnzbd",
  "NZBGet",
  "Blackhole",
]);

export const downloadClientProtocolEnum = z.enum(["torrent", "usenet"]);

export const createDownloadClientSchema = z.object({
  name: z.string().min(1, "Name is required"),
  implementation: downloadClientImplementationEnum,
  protocol: downloadClientProtocolEnum,
  enabled: z.boolean().default(true),
  priority: z.number().int().min(1).default(1),
  host: z.string().default("localhost"),
  port: z.number().int().min(1).max(65_535),
  useSsl: z.boolean().default(false),
  urlBase: z.string().optional(),
  username: z.string().optional(),
  password: z.string().optional(),
  apiKey: z.string().optional(),
  category: z.string().default("allstarr"),
  settings: z.record(z.string(), z.unknown()).optional(),
});

export const updateDownloadClientSchema = createDownloadClientSchema.extend({
  id: z.number(),
});

export const testDownloadClientSchema = z.object({
  implementation: downloadClientImplementationEnum,
  host: z.string().default("localhost"),
  port: z.number().int().min(1).max(65_535),
  useSsl: z.boolean().default(false),
  urlBase: z.string().optional(),
  username: z.string().optional(),
  password: z.string().optional(),
  apiKey: z.string().optional(),
});
