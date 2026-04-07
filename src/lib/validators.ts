import { TABLE_IDS } from "src/lib/table-column-defaults";
import { z } from "zod";

export const monitorNewItemsEnum = z.enum(["all", "none", "new"]);

// Download Profiles
const downloadProfileBaseSchema = z.object({
	name: z.string().min(1, "Name is required"),
	rootFolderPath: z.string().min(1, "Root folder is required"),
	cutoff: z.number().default(0),
	items: z
		.array(z.array(z.number()).min(1))
		.min(1, "At least one quality must be added"),
	upgradeAllowed: z.boolean().default(false),
	icon: z.string().min(1, "Icon is required"),
	categories: z.array(z.number()).default([]),
	contentType: z.enum(["movie", "tv", "ebook", "audiobook"]),
	language: z.string().min(2).max(3),
	minCustomFormatScore: z.number().default(0),
	upgradeUntilCustomFormatScore: z.number().default(0),
});

export const createDownloadProfileSchema = downloadProfileBaseSchema.refine(
	(data) => !data.upgradeAllowed || data.cutoff > 0,
	{
		message: "Upgrade cutoff quality is required",
		path: ["cutoff"],
	},
);

export const updateDownloadProfileSchema = downloadProfileBaseSchema
	.extend({ id: z.number() })
	.refine((data) => !data.upgradeAllowed || data.cutoff > 0, {
		message: "Upgrade cutoff quality is required",
		path: ["cutoff"],
	});

// Custom Formats
export const customFormatContentTypes = [
	"movie",
	"tv",
	"ebook",
	"audiobook",
] as const;

export const customFormatCategories = [
	"Audio Codec",
	"Audio Channels",
	"Video Codec",
	"HDR",
	"Resolution",
	"Source",
	"Quality Modifier",
	"Streaming Service",
	"Release Group",
	"Edition",
	"Release Type",
	"Unwanted",
	"Language",
	"File Format",
	"Audiobook Quality",
	"Publisher",
] as const;

export const cfSpecificationTypes = [
	// Universal
	"releaseTitle",
	"releaseGroup",
	"size",
	"indexerFlag",
	"language",
	// Video
	"videoSource",
	"resolution",
	"qualityModifier",
	"edition",
	"videoCodec",
	"audioCodec",
	"audioChannels",
	"hdrFormat",
	"streamingService",
	"releaseType",
	"year",
	// Book/Audiobook
	"fileFormat",
	"audioBitrate",
	"narrator",
	"publisher",
	"audioDuration",
] as const;

export const cfSpecificationSchema = z.object({
	name: z.string().min(1),
	type: z.enum(cfSpecificationTypes),
	value: z.string().optional(),
	min: z.number().optional(),
	max: z.number().optional(),
	negate: z.boolean().default(false),
	required: z.boolean().default(true),
});

export const createCustomFormatSchema = z.object({
	name: z.string().min(1, "Name is required"),
	category: z.enum(customFormatCategories),
	specifications: z.array(cfSpecificationSchema).default([]),
	defaultScore: z.number().default(0),
	contentTypes: z
		.array(z.enum(customFormatContentTypes))
		.min(1, "At least one content type required"),
	includeInRenaming: z.boolean().default(false),
	description: z.string().nullable().default(null),
});

export const updateCustomFormatSchema = createCustomFormatSchema.extend({
	id: z.number(),
});

export const profileCustomFormatScoreSchema = z.object({
	profileId: z.number(),
	customFormatId: z.number(),
	score: z.number(),
});

export const bulkSetProfileCFScoresSchema = z.object({
	profileId: z.number(),
	scores: z.array(
		z.object({
			customFormatId: z.number(),
			score: z.number(),
		}),
	),
});

export const createDownloadFormatSchema = z.object({
	title: z.string().min(1),
	weight: z.number().default(1),
	color: z.string().default("gray"),
	minSize: z.number().default(0),
	maxSize: z.number().default(0),
	preferredSize: z.number().default(0),
	contentTypes: z
		.array(z.enum(["movie", "tv", "ebook", "audiobook"]))
		.min(1, "At least one content type required"),
	source: z.string().nullable().default(null),
	resolution: z.number().default(0),
	noMaxLimit: z.number().default(0),
	noPreferredLimit: z.number().default(0),
});

export const updateDownloadFormatSchema = z.object({
	id: z.number(),
	title: z.string().min(1),
	weight: z.number(),
	color: z.string().default("gray"),
	minSize: z.number().default(0),
	maxSize: z.number().default(0),
	preferredSize: z.number().default(0),
	contentTypes: z
		.array(z.enum(["movie", "tv", "ebook", "audiobook"]))
		.min(1, "At least one content type required"),
	source: z.string().nullable().default(null),
	resolution: z.number().default(0),
	noMaxLimit: z.number().default(0),
	noPreferredLimit: z.number().default(0),
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
	skipMissingReleaseDate: z.boolean().default(true),
	skipMissingIsbnAsin: z.boolean().default(true),
	skipCompilations: z.boolean().default(false),
	minimumPopularity: z.number().int().min(0).default(10),
	minimumPages: z.number().int().min(0).default(0),
});

export const updateAuthorSchema = z.object({
	id: z.number(),
	downloadProfileIds: z.array(z.number()).optional(),
	monitorNewBooks: monitorNewItemsEnum.optional(),
});

export const updateBookSchema = z.object({
	id: z.number(),
	autoSwitchEdition: z.boolean(),
});

export const deleteBookSchema = z.object({
	id: z.number(),
	deleteFiles: z.boolean().default(false),
	addImportExclusion: z.boolean().default(false),
});

export const addImportListExclusionSchema = z.object({
	foreignBookId: z.string(),
	title: z.string(),
	authorName: z.string(),
});

export const removeImportListExclusionSchema = z.object({
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
		.default([]),
});

export const monitorBookProfileSchema = z.object({
	bookId: z.number(),
	downloadProfileId: z.number(),
});

export const unmonitorBookProfileSchema = z.object({
	bookId: z.number(),
	downloadProfileId: z.number(),
	deleteFiles: z.boolean(),
});

export const bulkMonitorBookProfileSchema = z.object({
	bookIds: z.array(z.number()),
	downloadProfileId: z.number(),
});

export const bulkUnmonitorBookProfileSchema = z.object({
	bookIds: z.array(z.number()),
	downloadProfileId: z.number(),
	deleteFiles: z.boolean(),
});

export const setEditionForProfileSchema = z.object({
	editionId: z.number(),
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
	tag: z.string().nullable().default(null),
	removeCompletedDownloads: z.boolean().default(true),
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
	tag: z.string().nullable().default(null),
	downloadClientId: z.number().nullable().default(null),
	requestInterval: z.number().int().min(1000).default(5000),
	dailyQueryLimit: z.number().int().min(0).default(0),
	dailyGrabLimit: z.number().int().min(0).default(0),
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
	tag: z.string().nullable().default(null),
	downloadClientId: z.number().nullable(),
	requestInterval: z.number().int().min(1000).default(5000),
	dailyQueryLimit: z.number().int().min(0).default(0),
	dailyGrabLimit: z.number().int().min(0).default(0),
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

export const pauseDownloadSchema = z.object({
	downloadClientId: z.number(),
	downloadItemId: z.string().min(1),
});

export const resumeDownloadSchema = z.object({
	downloadClientId: z.number(),
	downloadItemId: z.string().min(1),
});

export const setDownloadPrioritySchema = z.object({
	downloadClientId: z.number(),
	downloadItemId: z.string().min(1),
	priority: z.number(),
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

export const removeMovieImportExclusionSchema = z.object({
	id: z.number(),
});

// User Settings
export const tableIdSchema = z.enum(TABLE_IDS);

export const upsertUserSettingsSchema = z.object({
	tableId: tableIdSchema,
	columnOrder: z.array(z.string()).optional(),
	hiddenColumns: z.array(z.string()).optional(),
	viewMode: z.enum(["table", "grid"]).optional(),
	addDefaults: z
		.record(
			z.string(),
			z.union([z.string(), z.number(), z.boolean(), z.null()]),
		)
		.optional(),
});

export const deleteUserSettingsSchema = z.object({
	tableId: tableIdSchema,
});

// ─── Series ──────────────────────────────────────────────────────────────

export const updateSeriesSchema = z.object({
	id: z.number(),
	monitored: z.boolean().optional(),
	downloadProfileIds: z.array(z.number()).optional(),
});

export const refreshSeriesSchema = z.object({
	seriesId: z.number().optional(),
});

// ─── User Management ──────────────────────────────────────────────────────────

export const userRoleSchema = z.enum(["admin", "viewer", "requester"]);

export const setUserRoleSchema = z.object({
	userId: z.string(),
	role: userRoleSchema,
});

export const createUserSchema = z.object({
	name: z.string().min(1),
	email: z.string().email(),
	password: z.string().min(8),
	role: userRoleSchema,
});

export const deleteUserSchema = z.object({
	userId: z.string(),
});

export const updateDefaultRoleSchema = z.object({
	role: z.enum(["viewer", "requester"]),
});

// ─── OIDC Providers ───────────────────────────────────────────────────────────

export const createOidcProviderSchema = z.object({
	providerId: z
		.string()
		.min(1)
		.regex(/^[a-z0-9-]+$/, "Must be lowercase alphanumeric with hyphens"),
	displayName: z.string().min(1),
	clientId: z.string().min(1),
	clientSecret: z.string().min(1),
	discoveryUrl: z.string().url(),
	scopes: z.array(z.string()).default(["openid", "profile", "email"]),
	trusted: z.boolean().default(false),
	enabled: z.boolean().default(true),
});

export const updateOidcProviderSchema = z.object({
	id: z.string(),
	displayName: z.string().min(1).optional(),
	clientId: z.string().min(1).optional(),
	clientSecret: z.string().min(1).optional(),
	discoveryUrl: z.string().url().optional(),
	scopes: z.array(z.string()).optional(),
	trusted: z.boolean().optional(),
	enabled: z.boolean().optional(),
});

export const deleteOidcProviderSchema = z.object({
	id: z.string(),
});
