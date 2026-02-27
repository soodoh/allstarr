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
  slug: z.string().nullable(),
  bio: z.string().nullable(),
  bornYear: z.number().nullable(),
  deathYear: z.number().nullable(),
  status: z.string().default("continuing"),
  qualityProfileId: z.number().nullable(),
  rootFolderPath: z.string().nullable(),
  foreignAuthorId: z.string().nullable(),
  images: z
    .array(z.object({ url: z.string(), coverType: z.string() }))
    .nullable(),
  tags: z.array(z.number()).nullable(),
});

export const updateAuthorSchema = createAuthorSchema.partial().extend({
  id: z.number(),
});

// Books
export const createBookSchema = z.object({
  title: z.string().min(1, "Title is required"),
  slug: z.string().nullable(),
  authorId: z.number(),
  description: z.string().nullable(),
  releaseDate: z.string().nullable(),
  releaseYear: z.number().nullable(),
  monitored: z.boolean().default(false),
  foreignBookId: z.string().nullable(),
  images: z
    .array(z.object({ url: z.string(), coverType: z.string() }))
    .nullable(),
  rating: z.number().nullable(),
  ratingsCount: z.number().nullable(),
  usersCount: z.number().nullable(),
  tags: z.array(z.number()).nullable(),
});

export const updateBookSchema = createBookSchema.partial().extend({
  id: z.number(),
});

// Editions
export const createEditionSchema = z.object({
  bookId: z.number(),
  title: z.string().min(1, "Title is required"),
  isbn10: z.string().nullable(),
  isbn13: z.string().nullable(),
  asin: z.string().nullable(),
  format: z.string().nullable(),
  pageCount: z.number().nullable(),
  publisher: z.string().nullable(),
  releaseDate: z.string().nullable(),
  language: z.string().nullable(),
  languageCode: z.string().nullable(),
  country: z.string().nullable(),
  usersCount: z.number().nullable(),
  score: z.number().nullable(),
  foreignEditionId: z.string().nullable(),
  contributors: z
    .array(
      z.object({
        authorId: z.string(),
        name: z.string(),
        contribution: z.string().nullable(),
      }),
    )
    .nullable(),
  monitored: z.boolean().default(true),
});

export const updateEditionSchema = createEditionSchema.partial().extend({
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
  urlBase: z.string().nullable(),
  username: z.string().nullable(),
  password: z.string().nullable(),
  apiKey: z.string().nullable(),
  category: z.string().default("allstarr"),
  settings: z.record(z.string(), z.unknown()).nullable(),
});

export const updateDownloadClientSchema = createDownloadClientSchema.extend({
  id: z.number(),
});

export const testDownloadClientSchema = z.object({
  implementation: downloadClientImplementationEnum,
  host: z.string().default("localhost"),
  port: z.number().int().min(1).max(65_535),
  useSsl: z.boolean().default(false),
  urlBase: z.string().nullable(),
  username: z.string().nullable(),
  password: z.string().nullable(),
  apiKey: z.string().nullable(),
});

// Indexers
export const createIndexerSchema = z.object({
  name: z.string().min(1, "Name is required"),
  enabled: z.boolean().default(true),
  priority: z.number().int().min(1).default(25),
  host: z.string().default("localhost"),
  port: z.number().int().min(1).max(65_535).default(9696),
  useSsl: z.boolean().default(false),
  urlBase: z.string().nullable(),
  apiKey: z.string().min(1, "API Key is required"),
  settings: z.object({ categories: z.array(z.number()).nullable() }).nullable(),
});

export const updateIndexerSchema = createIndexerSchema.extend({
  id: z.number(),
});

export const testIndexerSchema = z.object({
  host: z.string().default("localhost"),
  port: z.number().int().min(1).max(65_535).default(9696),
  useSsl: z.boolean().default(false),
  urlBase: z.string().nullable(),
  apiKey: z.string().min(1, "API Key is required"),
});

export const searchIndexersSchema = z.object({
  query: z.string().min(1, "Query is required"),
  bookId: z.number().nullable(),
  categories: z.array(z.number()).nullable(),
});

export const grabReleaseSchema = z.object({
  guid: z.string().min(1),
  indexerId: z.number(),
  title: z.string().min(1),
  downloadUrl: z.string().min(1),
  protocol: z.enum(["torrent", "usenet"]),
  size: z.number(),
  bookId: z.number().nullable(),
  downloadClientId: z.number().nullable(),
});
