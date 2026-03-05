import { z } from "zod";

// Download Profiles
const downloadProfileBaseSchema = z.object({
  name: z.string().min(1, "Name is required"),
  rootFolderPath: z.string().min(1, "Root folder is required"),
  cutoff: z.number().default(0),
  items: z.array(z.number()).min(1, "At least one quality must be added"),
  upgradeAllowed: z.boolean().default(false),
  icon: z.string().min(1, "Icon is required"),
  categories: z.array(z.number()).default([]),
});

export const createDownloadProfileSchema = downloadProfileBaseSchema.refine(
  (data) => !data.upgradeAllowed || data.cutoff > 0,
  { message: "Upgrade cutoff quality is required", path: ["cutoff"] },
);

export const updateDownloadProfileSchema = downloadProfileBaseSchema
  .extend({ id: z.number() })
  .refine((data) => !data.upgradeAllowed || data.cutoff > 0, {
    message: "Upgrade cutoff quality is required",
    path: ["cutoff"],
  });

// Download Formats
export const specificationSchema = z.object({
  type: z.enum(["releaseTitle", "releaseGroup", "size", "indexerFlag"]),
  value: z.string().default(""),
  min: z.number().optional(),
  max: z.number().optional(),
  negate: z.boolean().default(false),
  required: z.boolean().default(true),
});

export const createDownloadFormatSchema = z.object({
  title: z.string().min(1),
  weight: z.number().default(1),
  color: z.string().default("gray"),
  minSize: z.number().default(0),
  maxSize: z.number().default(0),
  preferredSize: z.number().default(0),
  specifications: z.array(specificationSchema).default([]),
});

export const updateDownloadFormatSchema = z.object({
  id: z.number(),
  title: z.string().min(1),
  weight: z.number(),
  color: z.string().default("gray"),
  minSize: z.number().default(0),
  maxSize: z.number().default(0),
  preferredSize: z.number().default(0),
  specifications: z.array(specificationSchema).default([]),
});

export const browseDirectorySchema = z.object({
  path: z.string().min(1, "Path is required"),
  showHidden: z.boolean().default(true),
});

// Settings
export const updateSettingSchema = z.object({
  key: z.string().min(1),
  value: z.unknown(),
});

// Metadata Profile
export const metadataProfileSchema = z.object({
  allowedLanguages: z
    .array(z.string())
    .min(1, "At least one language required"),
  skipMissingReleaseDate: z.boolean().default(false),
  skipMissingIsbnAsin: z.boolean().default(false),
  skipCompilations: z.boolean().default(false),
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
  downloadProfileIds: z.array(z.number()).default([]),
  foreignAuthorId: z.string().nullable(),
  images: z
    .array(z.object({ url: z.string(), coverType: z.string() }))
    .default([]),
  tags: z.array(z.number()).default([]),
});

export const updateAuthorSchema = z.object({
  id: z.number(),
  downloadProfileIds: z.array(z.number()),
});

// Books
export const createBookSchema = z.object({
  title: z.string().min(1, "Title is required"),
  slug: z.string().nullable(),
  authorId: z.number(),
  description: z.string().nullable(),
  releaseDate: z.string().nullable(),
  releaseYear: z.number().nullable(),
  foreignBookId: z.string().nullable(),
  images: z
    .array(z.object({ url: z.string(), coverType: z.string() }))
    .default([]),
  rating: z.number().nullable(),
  ratingsCount: z.number().nullable(),
  usersCount: z.number().nullable(),
  tags: z.array(z.number()).default([]),
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
    .default([]),
});

export const updateEditionSchema = createEditionSchema.partial().extend({
  id: z.number(),
});

export const toggleEditionProfileSchema = z.object({
  editionId: z.number(),
  downloadProfileId: z.number(),
});

export const toggleBookProfileSchema = z.object({
  bookId: z.number(),
  downloadProfileId: z.number(),
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
export const indexerImplementationEnum = z.enum(["Newznab", "Torznab"]);
export const indexerProtocolEnum = z.enum(["torrent", "usenet"]);

export const createIndexerSchema = z.object({
  name: z.string().min(1, "Name is required"),
  implementation: indexerImplementationEnum,
  protocol: indexerProtocolEnum,
  baseUrl: z.string().min(1, "Base URL is required"),
  apiPath: z.string().default("/api"),
  apiKey: z.string().min(1, "API Key is required"),
  categories: z.array(z.number()).default([]),
  enableRss: z.boolean().default(true),
  enableAutomaticSearch: z.boolean().default(true),
  enableInteractiveSearch: z.boolean().default(true),
  priority: z.number().int().min(1).default(25),
  downloadClientId: z.number().nullable().default(null),
});

export const updateIndexerSchema = createIndexerSchema.extend({
  id: z.number(),
});

export const testIndexerSchema = z.object({
  baseUrl: z.string().min(1, "Base URL is required"),
  apiPath: z.string().default("/api"),
  apiKey: z.string().min(1, "API Key is required"),
});

export const updateSyncedIndexerSchema = z.object({
  id: z.number(),
  downloadClientId: z.number().nullable(),
});

// Blocklist
export const addToBlocklistSchema = z.object({
  bookId: z.number().nullable(),
  authorId: z.number().nullable(),
  sourceTitle: z.string().min(1),
  protocol: z.enum(["torrent", "usenet"]).nullable(),
  indexer: z.string().nullable(),
  message: z.string().nullable(),
  source: z.enum(["automatic", "manual"]).default("manual"),
});

export const removeFromBlocklistSchema = z.object({
  id: z.number(),
});

export const bulkRemoveFromBlocklistSchema = z.object({
  ids: z.array(z.number()).min(1),
});

export const searchIndexersSchema = z.object({
  query: z.string().min(1, "Query is required"),
  bookId: z.number().nullable(),
  categories: z.array(z.number()).nullable(),
});

export const removeFromQueueSchema = z.object({
  downloadClientId: z.number(),
  downloadItemId: z.string().min(1),
  removeFromClient: z.boolean().default(true),
  addToBlocklist: z.boolean().default(false),
  sourceTitle: z.string().optional(),
  protocol: z.enum(["torrent", "usenet"]).optional(),
});

export const grabReleaseSchema = z.object({
  guid: z.string().min(1),
  indexerId: z.number(),
  indexerSource: z.enum(["manual", "synced"]),
  title: z.string().min(1),
  downloadUrl: z.string().min(1),
  protocol: z.enum(["torrent", "usenet"]),
  size: z.number(),
  bookId: z.number().nullable(),
  downloadClientId: z.number().nullable(),
});
