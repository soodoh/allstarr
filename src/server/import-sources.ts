import { createServerFn } from "@tanstack/react-start";
import { eq } from "drizzle-orm";
import { db } from "src/db";
import {
	type ImportSource,
	importProvenance,
	importReviewItems,
	importSnapshots,
	importSources,
} from "src/db/schema";
import {
	applyImportPlanSchema,
	createImportSourceSchema,
	deleteImportSourceSchema,
	refreshImportSourceSchema,
	resolveImportReviewItemSchema,
	updateImportSourceSchema,
} from "src/lib/validators";
import { applyImportPlan } from "./imports/apply";
import { fetchBookshelfSnapshot } from "./imports/connectors/bookshelf";
import { fetchRadarrSnapshot } from "./imports/connectors/radarr";
import { fetchReadarrSnapshot } from "./imports/connectors/readarr";
import { fetchSonarrSnapshot } from "./imports/connectors/sonarr";
import type { NormalizedImportSnapshot } from "./imports/normalize";
import { normalizeImportSnapshot } from "./imports/normalize";
import type { ImportPlan, ImportPlanRow } from "./imports/plan";
import { buildImportPlan } from "./imports/plan";
import type { ImportSourceKind, RawImportSnapshot } from "./imports/types";
import { requireAdmin } from "./middleware";

type ImportPlanSectionName = keyof ImportPlan;

type SerializedImportPlanRow = Omit<ImportPlanRow, "targetId"> & {
	section: ImportPlanSectionName;
	sourceKind: ImportSourceKind;
	sourceLabel: string;
	targetId: number | string | null;
	targetLabel: string | null;
};

type SerializedImportReviewRow = {
	createdAt: string;
	id: number;
	payload: Record<string, unknown>;
	resourceType: string;
	sourceId: number;
	sourceKind: ImportSourceKind;
	sourceKey: string;
	sourceLabel: string;
	status: string;
	updatedAt: string;
};

type LatestSnapshotRecord = {
	fetchedAt: Date | null;
	id: number;
	payload: NormalizedImportSnapshot;
	sourceId: number;
};

type ImportProvenanceRecord = {
	lastImportedAt: Date | null;
	sourceId: number;
	sourceKey: string;
	targetId: string;
	targetType: string;
};

function toClientImportSource(source: ImportSource) {
	const { apiKey, ...safeSource } = source;
	return {
		...safeSource,
		hasApiKey: apiKey.trim().length > 0,
	};
}

function getTargetLabel(targetType: string): string | null {
	switch (targetType) {
		case "download-client":
			return "Download client";
		case "download-profile":
			return "Download profile";
		case "metadata-profile":
			return "Metadata profile";
		case "movie":
			return "Movie";
		case "show":
			return "Show";
		case "book":
			return "Book";
		default:
			return null;
	}
}

function normalizeTargetId(targetId: unknown): number | string | null {
	if (typeof targetId === "number" && Number.isFinite(targetId)) {
		return targetId;
	}
	if (typeof targetId === "string") {
		const trimmed = targetId.trim();
		if (trimmed.length === 0) {
			return null;
		}
		const parsed = Number(trimmed);
		if (Number.isInteger(parsed)) {
			return parsed;
		}
		return trimmed;
	}
	return null;
}

function toTimestamp(value: Date | null | undefined): number {
	return value?.getTime() ?? 0;
}

function getLatestSnapshot(sourceId: number): LatestSnapshotRecord | null {
	const snapshots = db
		.select()
		.from(importSnapshots)
		.where(eq(importSnapshots.sourceId, sourceId))
		.all() as LatestSnapshotRecord[];

	return (
		snapshots
			.slice()
			.sort(
				(left, right) =>
					toTimestamp(right.fetchedAt) - toTimestamp(left.fetchedAt) ||
					right.id - left.id,
			)[0] ?? null
	);
}

function getSourceForImport(sourceId: number): ImportSource {
	const source = db
		.select()
		.from(importSources)
		.where(eq(importSources.id, sourceId))
		.get();

	if (!source) {
		throw new Error("Import source not found");
	}

	return source;
}

function getProvenanceBySourceKey(
	sourceId: number,
): Map<string, ImportProvenanceRecord> {
	const provenanceRows = db
		.select()
		.from(importProvenance)
		.where(eq(importProvenance.sourceId, sourceId))
		.all() as ImportProvenanceRecord[];

	return new Map(provenanceRows.map((row) => [row.sourceKey, row]));
}

function serializeImportPlanRows(args: {
	plan: ImportPlan;
	source: ImportSource;
	provenanceBySourceKey: Map<string, ImportProvenanceRecord>;
}): SerializedImportPlanRow[] {
	const rows: SerializedImportPlanRow[] = [];
	const sections: Array<
		[ImportPlanSectionName, ImportPlan[ImportPlanSectionName]]
	> = [
		["settings", args.plan.settings],
		["qualityProfiles", args.plan.qualityProfiles],
		["metadataProfiles", args.plan.metadataProfiles],
		["library", args.plan.library],
		["activity", args.plan.activity],
		["unresolved", args.plan.unresolved],
		["unsupported", args.plan.unsupported],
	];

	for (const [section, group] of sections) {
		for (const row of group.items) {
			const provenance = args.provenanceBySourceKey.get(row.sourceKey);
			rows.push({
				...row,
				targetId: normalizeTargetId(row.targetId),
				section,
				sourceKind: args.source.kind as ImportSourceKind,
				sourceLabel: args.source.label,
				targetLabel: provenance ? getTargetLabel(provenance.targetType) : null,
			});
		}
	}

	return rows;
}

function serializeImportReviewRows(args: {
	rows: Array<{
		createdAt: Date;
		id: number;
		payload: Record<string, unknown>;
		resourceType: string;
		sourceId: number;
		sourceKey: string;
		status: string;
		updatedAt: Date;
	}>;
	source: ImportSource;
}): SerializedImportReviewRow[] {
	return args.rows.map((row) => ({
		createdAt: row.createdAt.toISOString(),
		id: row.id,
		payload: row.payload,
		resourceType: row.resourceType,
		sourceId: row.sourceId,
		sourceKind: args.source.kind as ImportSourceKind,
		sourceKey: row.sourceKey,
		sourceLabel: args.source.label,
		status: row.status,
		updatedAt: row.updatedAt.toISOString(),
	}));
}

async function fetchImportSourceSnapshot(
	source: ImportSource,
): Promise<RawImportSnapshot> {
	const config = {
		baseUrl: source.baseUrl,
		apiKey: source.apiKey,
	};
	const kind = source.kind as ImportSourceKind;

	switch (kind) {
		case "sonarr": {
			return fetchSonarrSnapshot(config);
		}
		case "radarr": {
			return fetchRadarrSnapshot(config);
		}
		case "readarr": {
			return fetchReadarrSnapshot(config);
		}
		case "bookshelf": {
			return fetchBookshelfSnapshot(config);
		}
	}

	throw new Error(`Unsupported import source kind: ${source.kind}`);
}

export const getImportSourcesFn = createServerFn({ method: "GET" }).handler(
	async () => {
		await requireAdmin();
		return db
			.select()
			.from(importSources)
			.orderBy(importSources.label)
			.all()
			.map(toClientImportSource);
	},
);

export const getImportPlanFn = createServerFn({ method: "GET" })
	.inputValidator((data: { sourceId: number }) => data)
	.handler(async ({ data }) => {
		await requireAdmin();
		const source = getSourceForImport(data.sourceId);
		const latestSnapshot = getLatestSnapshot(source.id);

		if (!latestSnapshot) {
			return [] as SerializedImportPlanRow[];
		}

		const provenanceBySourceKey = getProvenanceBySourceKey(source.id);
		const plan = buildImportPlan({
			snapshots: [latestSnapshot.payload],
			existingState: {
				provenanceBySourceKey,
			},
		});

		return serializeImportPlanRows({
			plan,
			provenanceBySourceKey,
			source,
		});
	});

export const getImportReviewFn = createServerFn({ method: "GET" })
	.inputValidator((data: { sourceId: number }) => data)
	.handler(async ({ data }) => {
		await requireAdmin();
		const source = getSourceForImport(data.sourceId);
		const rows = db
			.select()
			.from(importReviewItems)
			.where(eq(importReviewItems.sourceId, source.id))
			.all() as Array<{
			createdAt: Date;
			id: number;
			payload: Record<string, unknown>;
			resourceType: string;
			sourceId: number;
			sourceKey: string;
			status: string;
			updatedAt: Date;
		}>;

		const sortedRows = rows.slice().sort((left, right) => {
			return (
				toTimestamp(right.updatedAt) - toTimestamp(left.updatedAt) ||
				toTimestamp(right.createdAt) - toTimestamp(left.createdAt) ||
				right.id - left.id
			);
		});

		return serializeImportReviewRows({
			rows: sortedRows,
			source,
		});
	});

export const createImportSourceFn = createServerFn({ method: "POST" })
	.inputValidator((data: unknown) => createImportSourceSchema.parse(data))
	.handler(async ({ data }) => {
		await requireAdmin();
		const source = db
			.insert(importSources)
			.values({
				...data,
				lastSyncStatus: "idle",
				createdAt: new Date(),
				updatedAt: new Date(),
			})
			.returning()
			.get();
		return toClientImportSource(source);
	});

export const updateImportSourceFn = createServerFn({ method: "POST" })
	.inputValidator((data: unknown) => updateImportSourceSchema.parse(data))
	.handler(async ({ data }) => {
		await requireAdmin();
		const { id, ...values } = data;
		const source = db
			.update(importSources)
			.set({
				...values,
				updatedAt: new Date(),
			})
			.where(eq(importSources.id, id))
			.returning()
			.get();
		return toClientImportSource(source);
	});

export const deleteImportSourceFn = createServerFn({ method: "POST" })
	.inputValidator((data: unknown) => deleteImportSourceSchema.parse(data))
	.handler(async ({ data }) => {
		await requireAdmin();
		db.delete(importSources).where(eq(importSources.id, data.id)).run();
		return { success: true };
	});

export const refreshImportSourceFn = createServerFn({ method: "POST" })
	.inputValidator((data: unknown) => refreshImportSourceSchema.parse(data))
	.handler(async ({ data }): Promise<Record<string, never>> => {
		await requireAdmin();
		const source = db
			.select()
			.from(importSources)
			.where(eq(importSources.id, data.id))
			.get();

		if (!source) {
			throw new Error("Import source not found");
		}

		try {
			const snapshot = await fetchImportSourceSnapshot(source);
			const normalized = normalizeImportSnapshot({
				kind: source.kind as ImportSourceKind,
				snapshot,
				sourceId: source.id,
			});
			const fetchedAt = new Date(normalized.fetchedAt);

			db.insert(importSnapshots)
				.values({
					fetchedAt,
					payload: normalized,
					sourceId: source.id,
				})
				.run();

			db.update(importSources)
				.set({
					lastSyncError: null,
					lastSyncedAt: fetchedAt,
					lastSyncStatus: "synced",
					updatedAt: new Date(),
				})
				.where(eq(importSources.id, source.id))
				.returning()
				.get();
			return normalized as unknown as Record<string, never>;
		} catch (error) {
			db.update(importSources)
				.set({
					lastSyncError: error instanceof Error ? error.message : String(error),
					lastSyncStatus: "error",
					updatedAt: new Date(),
				})
				.where(eq(importSources.id, source.id))
				.run();
			throw error;
		}
	});

export const applyImportPlanFn = createServerFn({ method: "POST" })
	.inputValidator((data: unknown) => applyImportPlanSchema.parse(data))
	.handler(async ({ data }) => {
		await requireAdmin();
		return applyImportPlan(data);
	});

export const resolveImportReviewItemFn = createServerFn({ method: "POST" })
	.inputValidator((data: unknown) => resolveImportReviewItemSchema.parse(data))
	.handler(async ({ data }) => {
		await requireAdmin();
		const values: Record<string, unknown> = {
			status: data.status,
			updatedAt: new Date(),
		};

		if (data.payload !== undefined) {
			values.payload = data.payload;
		}

		db.update(importReviewItems)
			.set(values)
			.where(eq(importReviewItems.id, data.id))
			.run();
		return { success: true };
	});
