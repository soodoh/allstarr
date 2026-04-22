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
}): NormalizedImportItem[] {
	const { kind, sourceId, items, profileKind } = args;
	return items
		.map((record) => {
			const id = readNumber(record, ["id"]);
			const title = normalizeRecordTitle(record, `${profileKind} profile`);
			return createItem({
				kind,
				sourceId,
				resourceType: "profile",
				identity: `${profileKind}:${id ?? slugify(title)}`,
				title,
				payload: {
					profileKind,
					id,
					title,
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
			const tmdbId = readNumber(record, ["tmdbId", "tmdb_id", "id"]);
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
			const title = normalizeRecordTitle(record, `Show ${index + 1}`);
			return createItem({
				kind,
				sourceId,
				resourceType: "show",
				identity:
					sourceRecordId !== null
						? String(sourceRecordId)
						: tvdbId !== null
							? String(tvdbId)
							: slugify(title) || `show-${index + 1}`,
				title,
				payload: {
					sourceRecordId,
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
}): NormalizedImportItem[] {
	const { kind, sourceId, items } = args;
	return items
		.map((record, index) => {
			const sourceRecordId = readNumber(record, ["id", "bookId"]);
			const foreignBookId = readString(record, [
				"foreignBookId",
				"hardcoverId",
				"bookId",
			]);
			const title = normalizeRecordTitle(record, `Book ${index + 1}`);
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
					authorName: readString(record, ["authorName"]),
					year: readNumber(record, ["year", "releaseYear"]),
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
	});
	const metadataProfiles = normalizeProfiles({
		kind: args.kind,
		sourceId: args.sourceId,
		items: toRecords(args.snapshot.settings?.metadataProfiles),
		profileKind: "metadata",
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
	const books = normalizeBooks({
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
