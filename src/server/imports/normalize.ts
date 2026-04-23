import type { ImportSourceKind, RawImportSnapshot } from "./types";

export type ImportResourceType =
	| "setting"
	| "profile"
	| "movie"
	| "show"
	| "book"
	| "history"
	| "queue"
	| "blocklist"
	| "unsupported";

export type NormalizedImportItem = {
	sourceId: number;
	sourceKey: string;
	resourceType: ImportResourceType;
	title: string;
	payload: Record<string, unknown>;
};

export type NormalizedImportSnapshot = {
	sourceId: number;
	kind: ImportSourceKind;
	fetchedAt: string;
	settings: {
		items: NormalizedImportItem[];
		qualityProfiles: NormalizedImportItem[];
		metadataProfiles: NormalizedImportItem[];
	};
	library: {
		movies: NormalizedImportItem[];
		shows: NormalizedImportItem[];
		books: NormalizedImportItem[];
	};
	activity: {
		history: NormalizedImportItem[];
		queue: NormalizedImportItem[];
		blocklist: NormalizedImportItem[];
	};
	unsupported: NormalizedImportItem[];
};

type RawRecord = Record<string, unknown>;
type RawField = { name?: string; value?: unknown };

function isRecord(value: unknown): value is RawRecord {
	return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function toRecords(value: unknown): RawRecord[] {
	if (!Array.isArray(value)) {
		return [];
	}
	return value.filter(
		(item): item is RawRecord => Boolean(item) && typeof item === "object",
	);
}

function readString(record: RawRecord, keys: string[]): string | null {
	for (const key of keys) {
		const value = record[key];
		if (typeof value === "string" && value.trim().length > 0) {
			return value.trim();
		}
	}
	return null;
}

function readNumber(record: RawRecord, keys: string[]): number | null {
	for (const key of keys) {
		const value = record[key];
		if (typeof value === "number" && Number.isFinite(value)) {
			return value;
		}
		if (typeof value === "string") {
			const parsed = Number(value);
			if (Number.isFinite(parsed)) {
				return parsed;
			}
		}
	}
	return null;
}

function readField(record: RawRecord, name: string): unknown {
	const fields = Array.isArray(record.fields)
		? (record.fields as RawField[])
		: [];
	return fields.find((field) => field?.name === name)?.value;
}

function readBooleanValue(value: unknown): boolean | null {
	if (typeof value === "boolean") {
		return value;
	}
	if (typeof value === "number") {
		return value !== 0;
	}
	if (typeof value === "string") {
		if (value === "true") {
			return true;
		}
		if (value === "false") {
			return false;
		}
	}
	return null;
}

function readStringValue(value: unknown): string | null {
	return typeof value === "string" && value.trim().length > 0
		? value.trim()
		: null;
}

function readNumberValue(value: unknown): number | null {
	if (typeof value === "number" && Number.isFinite(value)) {
		return value;
	}
	if (typeof value === "string") {
		const parsed = Number(value);
		if (Number.isFinite(parsed)) {
			return parsed;
		}
	}
	return null;
}

function readYearValue(value: unknown): number | null {
	if (typeof value === "number" && Number.isInteger(value)) {
		return value;
	}
	if (typeof value === "string") {
		const match = value.trim().match(/^(\d{4})(?:-|$)/);
		if (match) {
			const parsed = Number(match[1]);
			if (Number.isInteger(parsed)) {
				return parsed;
			}
		}
	}
	return null;
}

function extractAllowedQualityGroups(value: unknown): number[][] {
	if (!Array.isArray(value)) {
		return [];
	}

	const groups: number[][] = [];
	for (const item of value) {
		if (!item || typeof item !== "object") {
			continue;
		}
		const record = item as RawRecord;
		const nested = extractAllowedQualityGroups(record.items);
		if (nested.length > 0) {
			groups.push(...nested);
			continue;
		}

		const qualityRecord = isRecord(record.quality) ? record.quality : null;
		const qualityId = qualityRecord ? readNumber(qualityRecord, ["id"]) : null;
		const allowed = readBooleanValue(record.allowed);
		if (qualityId !== null && allowed === true) {
			groups.push([qualityId]);
		}
	}

	return groups;
}

function inferReadarrContentType(record: RawRecord): "audiobook" | "ebook" {
	const allowedQualityIds = new Set(
		extractAllowedQualityGroups(record.items).flat(),
	);
	const hasAudio = [10, 11, 12, 13].some((id) => allowedQualityIds.has(id));
	const hasText = [1, 2, 3, 4].some((id) => allowedQualityIds.has(id));
	return hasAudio && !hasText ? "audiobook" : "ebook";
}

function defaultProfileMetadata(
	kind: ImportSourceKind,
	record: RawRecord,
): { categories: number[]; contentType: string; icon: string } {
	if (kind === "sonarr") {
		return { categories: [18], contentType: "tv", icon: "tv" };
	}
	if (kind === "radarr") {
		return { categories: [2000], contentType: "movie", icon: "film" };
	}
	if (kind === "readarr") {
		const contentType = inferReadarrContentType(record);
		return {
			categories: contentType === "audiobook" ? [3000] : [7020],
			contentType,
			icon: "book-open",
		};
	}
	return {
		categories: [7020],
		contentType: "ebook",
		icon: "book-open",
	};
}

function firstRootFolderPath(rootFolders: unknown): string {
	return (
		toRecords(rootFolders)
			.map((folder) => readString(folder, ["path"]))
			.find((value): value is string => Boolean(value)) ?? ""
	);
}

function buildMappedDownloadClient(
	kind: ImportSourceKind,
	record: RawRecord,
): RawRecord {
	const existingHost = readString(record, ["host"]);
	const existingPort = readNumber(record, ["port"]);
	if (existingHost !== null && existingPort !== null) {
		return {
			...record,
			enabled:
				readBooleanValue(record.enabled) ??
				readBooleanValue(record.enable) ??
				true,
		};
	}

	const categoryFieldName =
		kind === "sonarr"
			? "tvCategory"
			: kind === "radarr"
				? "movieCategory"
				: "musicCategory";
	const settings: RawRecord = {};
	const savePath =
		readStringValue(readField(record, "tvDirectory")) ??
		readStringValue(readField(record, "movieDirectory")) ??
		readStringValue(readField(record, "directory"));
	if (savePath) {
		settings.savePath = savePath;
	}

	const addPaused = readBooleanValue(readField(record, "addPaused"));
	if (addPaused !== null) {
		settings.addPaused = addPaused;
	}

	const sequentialOrder = readBooleanValue(
		readField(record, "sequentialOrder"),
	);
	if (sequentialOrder !== null) {
		settings.sequentialOrder = sequentialOrder;
	}

	const firstAndLastPiecePriority = readBooleanValue(
		readField(record, "firstAndLast"),
	);
	if (firstAndLastPiecePriority !== null) {
		settings.firstAndLastPiecePriority = firstAndLastPiecePriority;
	}

	return {
		apiKey:
			readStringValue(readField(record, "apiKey")) ??
			readString(record, ["apiKey"]),
		category:
			readStringValue(readField(record, categoryFieldName)) ?? "allstarr",
		enabled:
			readBooleanValue(record.enable) ??
			readBooleanValue(record.enabled) ??
			true,
		host:
			readStringValue(readField(record, "host")) ??
			readString(record, ["host"]) ??
			"localhost",
		implementation:
			readString(record, ["implementationName", "implementation"]) ?? "Unknown",
		name: normalizeRecordTitle(record, "download-client"),
		password:
			readStringValue(readField(record, "password")) ??
			readString(record, ["password"]),
		port:
			readNumberValue(readField(record, "port")) ??
			readNumber(record, ["port"]) ??
			0,
		priority: readNumber(record, ["priority"]) ?? 1,
		protocol: readString(record, ["protocol"]) ?? "torrent",
		removeCompletedDownloads:
			readBooleanValue(record.removeCompletedDownloads) ?? true,
		settings: Object.keys(settings).length > 0 ? settings : null,
		tag:
			readStringValue(readField(record, "tag")) ?? readString(record, ["tag"]),
		urlBase:
			readStringValue(readField(record, "urlBase")) ??
			readString(record, ["urlBase"]),
		useSsl:
			readBooleanValue(readField(record, "useSsl")) ??
			readBooleanValue(record.useSsl) ??
			false,
		username:
			readStringValue(readField(record, "username")) ??
			readString(record, ["username"]),
	};
}

function buildMappedQualityProfile(args: {
	kind: ImportSourceKind;
	record: RawRecord;
	rootFolders: unknown;
}): RawRecord {
	const existingRootFolder = readString(args.record, ["rootFolderPath"]);
	if (existingRootFolder !== null) {
		return args.record;
	}

	const defaults = defaultProfileMetadata(args.kind, args.record);
	return {
		categories: defaults.categories,
		contentType: defaults.contentType,
		cutoff: readNumber(args.record, ["cutoff"]) ?? 0,
		icon: defaults.icon,
		items: extractAllowedQualityGroups(args.record.items),
		language: readString(args.record, ["language"]) ?? "en",
		minCustomFormatScore:
			readNumber(args.record, ["minCustomFormatScore", "minFormatScore"]) ?? 0,
		name: normalizeRecordTitle(args.record, "quality profile"),
		rootFolderPath: firstRootFolderPath(args.rootFolders),
		upgradeAllowed: readBooleanValue(args.record.upgradeAllowed) ?? false,
		upgradeUntilCustomFormatScore:
			readNumber(args.record, [
				"upgradeUntilCustomFormatScore",
				"minUpgradeFormatScore",
				"cutoffFormatScore",
			]) ?? 0,
	};
}

function buildMappedMetadataProfile(record: RawRecord): RawRecord {
	return record;
}

function slugify(value: string): string {
	return value
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 80);
}

function buildSourceKey(
	kind: ImportSourceKind,
	sourceId: number,
	resourceType: ImportResourceType,
	identity: string,
): string {
	return `${kind}:${sourceId}:${resourceType}:${identity}`;
}

function normalizeRecordTitle(record: RawRecord, fallback: string): string {
	return (
		readString(record, [
			"title",
			"name",
			"label",
			"path",
			"seriesName",
			"authorName",
			"bookTitle",
		]) ?? fallback
	);
}

function createItem(args: {
	kind: ImportSourceKind;
	sourceId: number;
	resourceType: ImportResourceType;
	identity: string;
	title: string;
	payload: Record<string, unknown>;
}): NormalizedImportItem {
	return {
		sourceId: args.sourceId,
		sourceKey: buildSourceKey(
			args.kind,
			args.sourceId,
			args.resourceType,
			args.identity,
		),
		resourceType: args.resourceType,
		title: args.title,
		payload: args.payload,
	};
}

function normalizeSettingsItems(args: {
	kind: ImportSourceKind;
	sourceId: number;
	snapshot: RawImportSnapshot;
}): NormalizedImportItem[] {
	const items: NormalizedImportItem[] = [];
	const { kind, sourceId, snapshot } = args;

	const naming = snapshot.settings?.naming;
	if (naming && typeof naming === "object") {
		const record = naming as RawRecord;
		items.push(
			createItem({
				kind,
				sourceId,
				resourceType: "setting",
				identity: "naming",
				title: "Naming",
				payload: { group: "naming", raw: record },
			}),
		);
	}

	const mediaManagement = snapshot.settings?.mediaManagement;
	if (mediaManagement && typeof mediaManagement === "object") {
		const record = mediaManagement as RawRecord;
		items.push(
			createItem({
				kind,
				sourceId,
				resourceType: "setting",
				identity: "media-management",
				title: "Media Management",
				payload: { group: "mediaManagement", raw: record },
			}),
		);
	}

	for (const [group, rawValue] of [
		["download-client", snapshot.settings?.downloadClients],
		["indexer", snapshot.settings?.indexers],
		["root-folder", snapshot.rootFolders],
	] as const) {
		for (const record of toRecords(rawValue)) {
			const id = readNumber(record, ["id"]);
			const title = normalizeRecordTitle(record, group);
			items.push(
				createItem({
					kind,
					sourceId,
					resourceType: "setting",
					identity: `${group}:${id ?? slugify(title)}`,
					title,
					payload: {
						group,
						id,
						title,
						mapped:
							group === "download-client"
								? buildMappedDownloadClient(kind, record)
								: record,
						raw: record,
					},
				}),
			);
		}
	}

	return items.sort((left, right) =>
		left.sourceKey.localeCompare(right.sourceKey),
	);
}

function normalizeProfiles(args: {
	kind: ImportSourceKind;
	sourceId: number;
	items: RawRecord[];
	profileKind: "quality" | "metadata";
	rootFolders?: unknown;
}): NormalizedImportItem[] {
	const { kind, sourceId, items, profileKind, rootFolders } = args;
	const defaultMetadataProfileIds = new Set(
		profileKind === "metadata"
			? toRecords(rootFolders)
					.map((folder) => readNumber(folder, ["defaultMetadataProfileId"]))
					.filter((id): id is number => id !== null)
			: [],
	);
	const fallbackDefaultMetadataProfile =
		profileKind === "metadata" &&
		defaultMetadataProfileIds.size === 0 &&
		items.length === 1;
	return items
		.map((record) => {
			const id = readNumber(record, ["id"]);
			const title = normalizeRecordTitle(record, `${profileKind} profile`);
			const isDefault =
				profileKind === "metadata"
					? id !== null
						? defaultMetadataProfileIds.size > 0
							? defaultMetadataProfileIds.has(id)
							: fallbackDefaultMetadataProfile
						: fallbackDefaultMetadataProfile
					: true;
			return createItem({
				kind,
				sourceId,
				resourceType: "profile",
				identity: `${profileKind}:${id ?? slugify(title)}`,
				title,
				payload: {
					isDefault,
					profileKind,
					id,
					title,
					mapped:
						profileKind === "quality"
							? buildMappedQualityProfile({
									kind,
									record,
									rootFolders,
								})
							: buildMappedMetadataProfile(record),
					raw: record,
				},
			});
		})
		.sort((left, right) => left.sourceKey.localeCompare(right.sourceKey));
}

function normalizeMovies(args: {
	kind: ImportSourceKind;
	sourceId: number;
	items: RawRecord[];
}): NormalizedImportItem[] {
	const { kind, sourceId, items } = args;
	return items
		.map((record, index) => {
			const sourceRecordId = readNumber(record, ["id", "movieId"]);
			const tmdbId = readNumber(record, ["tmdbId", "tmdb_id"]);
			const title = normalizeRecordTitle(record, `Movie ${index + 1}`);
			return createItem({
				kind,
				sourceId,
				resourceType: "movie",
				identity:
					sourceRecordId !== null
						? String(sourceRecordId)
						: tmdbId !== null
							? String(tmdbId)
							: slugify(title) || `movie-${index + 1}`,
				title,
				payload: {
					tmdbId,
					title,
					year: readNumber(record, ["year", "releaseYear"]),
					raw: record,
				},
			});
		})
		.sort((left, right) => left.sourceKey.localeCompare(right.sourceKey));
}

function normalizeShows(args: {
	kind: ImportSourceKind;
	sourceId: number;
	items: RawRecord[];
}): NormalizedImportItem[] {
	const { kind, sourceId, items } = args;
	return items
		.map((record, index) => {
			const sourceRecordId = readNumber(record, ["id", "seriesId"]);
			const tvdbId = readNumber(record, ["tvdbId", "tvdb_id"]);
			const tmdbId = readNumber(record, ["tmdbId", "tmdb_id"]);
			const title = normalizeRecordTitle(record, `Show ${index + 1}`);
			return createItem({
				kind,
				sourceId,
				resourceType: "show",
				identity:
					sourceRecordId !== null
						? String(sourceRecordId)
						: tmdbId !== null
							? String(tmdbId)
							: tvdbId !== null
								? String(tvdbId)
								: slugify(title) || `show-${index + 1}`,
				title,
				payload: {
					sourceRecordId,
					tmdbId,
					tvdbId,
					title,
					year: readNumber(record, ["year", "firstAirYear", "releaseYear"]),
					raw: record,
				},
			});
		})
		.sort((left, right) => left.sourceKey.localeCompare(right.sourceKey));
}

function normalizeBooks(args: {
	kind: ImportSourceKind;
	sourceId: number;
	items: RawRecord[];
	authorsById?: Map<number, string>;
}): NormalizedImportItem[] {
	const { authorsById, kind, sourceId, items } = args;
	return items
		.map((record, index) => {
			const sourceRecordId = readNumber(record, ["id", "bookId"]);
			const foreignBookId = readString(record, [
				"foreignBookId",
				"hardcoverId",
				"bookId",
			]);
			const title = normalizeRecordTitle(record, `Book ${index + 1}`);
			const nestedAuthor = isRecord(record.author) ? record.author : null;
			const authorId = readNumber(record, ["authorId"]);
			const authorName =
				readString(record, ["authorName"]) ??
				(nestedAuthor
					? readString(nestedAuthor, ["authorName", "name"])
					: null) ??
				(authorId !== null ? (authorsById?.get(authorId) ?? null) : null);
			const year =
				readNumber(record, ["year", "releaseYear"]) ??
				readYearValue(record.releaseDate);
			return createItem({
				kind,
				sourceId,
				resourceType: "book",
				identity:
					sourceRecordId !== null
						? String(sourceRecordId)
						: (foreignBookId ?? (slugify(title) || `book-${index + 1}`)),
				title,
				payload: {
					sourceRecordId,
					foreignBookId,
					title,
					authorName,
					year,
					raw: record,
				},
			});
		})
		.sort((left, right) => left.sourceKey.localeCompare(right.sourceKey));
}

function normalizeActivity(args: {
	kind: ImportSourceKind;
	sourceId: number;
	items: RawRecord[];
	resourceType: "history" | "queue" | "blocklist";
}): NormalizedImportItem[] {
	const { kind, sourceId, items, resourceType } = args;
	return items
		.map((record, index) => {
			const id = readNumber(record, ["id"]);
			const title = normalizeRecordTitle(
				record,
				`${resourceType} ${index + 1}`,
			);
			return createItem({
				kind,
				sourceId,
				resourceType,
				identity:
					id !== null
						? String(id)
						: `${slugify(title) || resourceType}-${index + 1}`,
				title,
				payload: {
					title,
					raw: record,
				},
			});
		})
		.sort((left, right) => left.sourceKey.localeCompare(right.sourceKey));
}

function normalizeUnsupportedBuckets(args: {
	kind: ImportSourceKind;
	sourceId: number;
	snapshot: RawImportSnapshot;
}): NormalizedImportItem[] {
	const unsupported: NormalizedImportItem[] = [];
	const snapshotRecord = args.snapshot as RawRecord;
	const sections: Array<{
		bucket: string;
		allowedKeys: string[];
		value: unknown;
	}> = [
		{
			bucket: "settings",
			allowedKeys: [
				"naming",
				"mediaManagement",
				"downloadClients",
				"indexers",
				"metadataProfiles",
			],
			value: args.snapshot.settings,
		},
		{
			bucket: "library",
			allowedKeys: ["movies", "series", "books"],
			value: args.snapshot.library,
		},
		{
			bucket: "activity",
			allowedKeys: ["history", "queue", "blocklist"],
			value: args.snapshot.activity,
		},
	];

	for (const section of sections) {
		const record = section.value as RawRecord;
		if (!record || typeof record !== "object") {
			continue;
		}

		for (const [key, value] of Object.entries(record)) {
			if (section.allowedKeys.includes(key)) {
				continue;
			}
			for (const item of toRecords(value)) {
				const id = readNumber(item, ["id"]);
				const title = normalizeRecordTitle(item, key);
				unsupported.push(
					createItem({
						kind: args.kind,
						sourceId: args.sourceId,
						resourceType: "unsupported",
						identity: `${section.bucket}:${key}:${id ?? (slugify(title) || "item")}`,
						title,
						payload: {
							bucket: section.bucket,
							key,
							id,
							title,
							raw: item,
						},
					}),
				);
			}
		}
	}

	for (const [key, value] of Object.entries(snapshotRecord)) {
		if (
			[
				"kind",
				"fetchedAt",
				"settings",
				"rootFolders",
				"profiles",
				"library",
				"activity",
			].includes(key)
		) {
			continue;
		}
		for (const item of toRecords(value)) {
			const id = readNumber(item, ["id"]);
			const title = normalizeRecordTitle(item, key);
			unsupported.push(
				createItem({
					kind: args.kind,
					sourceId: args.sourceId,
					resourceType: "unsupported",
					identity: `snapshot:${key}:${id ?? (slugify(title) || "item")}`,
					title,
					payload: {
						bucket: "snapshot",
						key,
						id,
						title,
						raw: item,
					},
				}),
			);
		}
	}

	return unsupported.sort((left, right) =>
		left.sourceKey.localeCompare(right.sourceKey),
	);
}

export function normalizeImportSnapshot(args: {
	sourceId: number;
	kind: ImportSourceKind;
	snapshot: RawImportSnapshot;
}): NormalizedImportSnapshot {
	const settingsItems = normalizeSettingsItems({
		kind: args.kind,
		sourceId: args.sourceId,
		snapshot: args.snapshot,
	});
	const qualityProfiles = normalizeProfiles({
		kind: args.kind,
		sourceId: args.sourceId,
		items: toRecords(args.snapshot.profiles),
		profileKind: "quality",
		rootFolders: args.snapshot.rootFolders,
	});
	const metadataProfiles = normalizeProfiles({
		kind: args.kind,
		sourceId: args.sourceId,
		items: toRecords(args.snapshot.settings?.metadataProfiles),
		profileKind: "metadata",
		rootFolders: args.snapshot.rootFolders,
	});

	const movies = normalizeMovies({
		kind: args.kind,
		sourceId: args.sourceId,
		items: toRecords(args.snapshot.library?.movies),
	});
	const shows = normalizeShows({
		kind: args.kind,
		sourceId: args.sourceId,
		items: toRecords(args.snapshot.library?.series),
	});
	const authorsById = new Map(
		toRecords(args.snapshot.library?.authors)
			.map((record) => {
				const id = readNumber(record, ["id"]);
				const authorName = readString(record, ["authorName", "name"]);
				return id !== null && authorName ? ([id, authorName] as const) : null;
			})
			.filter((entry): entry is readonly [number, string] => entry !== null),
	);
	const books = normalizeBooks({
		authorsById,
		kind: args.kind,
		sourceId: args.sourceId,
		items: toRecords(args.snapshot.library?.books),
	});
	const history = normalizeActivity({
		kind: args.kind,
		sourceId: args.sourceId,
		items: toRecords(args.snapshot.activity?.history),
		resourceType: "history",
	});
	const queue = normalizeActivity({
		kind: args.kind,
		sourceId: args.sourceId,
		items: toRecords(args.snapshot.activity?.queue),
		resourceType: "queue",
	});
	const blocklist = normalizeActivity({
		kind: args.kind,
		sourceId: args.sourceId,
		items: toRecords(args.snapshot.activity?.blocklist),
		resourceType: "blocklist",
	});

	return {
		sourceId: args.sourceId,
		kind: args.kind,
		fetchedAt: args.snapshot.fetchedAt,
		settings: {
			items: settingsItems,
			qualityProfiles,
			metadataProfiles,
		},
		library: {
			movies,
			shows,
			books,
		},
		activity: {
			history,
			queue,
			blocklist,
		},
		unsupported: normalizeUnsupportedBuckets({
			kind: args.kind,
			sourceId: args.sourceId,
			snapshot: args.snapshot,
		}),
	};
}
