import { and, eq } from "drizzle-orm";
import { db } from "src/db";
import {
	downloadClients,
	downloadProfiles,
	importProvenance,
	importReviewItems,
} from "src/db/schema";
import type { DownloadClientSettings } from "src/db/schema/download-clients";
import { upsertSettingValue } from "../settings-store";

export type ApplyImportPlanRow = {
	action: string;
	payload: Record<string, unknown>;
	resourceType: string;
	sourceKey: string;
};

export type ApplyImportPlanArgs = {
	selectedRows: ApplyImportPlanRow[];
	sourceId: number;
};

export type ApplyImportPlanResult = {
	appliedCount: number;
	reviewCount: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function getRowPriority(row: ApplyImportPlanRow): number {
	if (row.action === "unresolved" || row.action === "unsupported") {
		return 4;
	}
	if (row.resourceType === "setting") {
		const group = row.payload.group;
		if (group === "download-client") {
			return 0;
		}
		return 3;
	}
	if (row.resourceType === "profile") {
		const profileKind = row.payload.profileKind;
		if (profileKind === "quality") {
			return 1;
		}
		if (profileKind === "metadata") {
			return 2;
		}
	}
	return 3;
}

function getSourcePayload(row: ApplyImportPlanRow): Record<string, unknown> {
	const raw = row.payload.raw;
	if (isRecord(raw)) {
		return raw;
	}
	return row.payload;
}

function getProvenanceTargetType(row: ApplyImportPlanRow): string {
	if (
		row.resourceType === "setting" &&
		row.payload.group === "download-client"
	) {
		return "download-client";
	}
	if (row.resourceType === "profile" && row.payload.profileKind === "quality") {
		return "download-profile";
	}
	if (
		row.resourceType === "profile" &&
		row.payload.profileKind === "metadata"
	) {
		return "metadata-profile";
	}
	return row.resourceType;
}

function getProvenanceTargetId(
	row: ApplyImportPlanRow,
	value: unknown,
): string {
	if (
		row.resourceType === "profile" &&
		row.payload.profileKind === "metadata"
	) {
		return "metadata.hardcover.profile";
	}
	if (typeof value === "number" && Number.isFinite(value)) {
		return String(value);
	}
	if (typeof value === "string" && value.trim().length > 0) {
		return value.trim();
	}
	return row.sourceKey;
}

function stripId<T extends Record<string, unknown>>(values: T): Omit<T, "id"> {
	const { id: _id, ...rest } = values;
	return rest;
}

async function writeProvenance(args: {
	row: ApplyImportPlanRow;
	sourceId: number;
	targetId: string;
	targetType: string;
	timestamp: Date;
}): Promise<void> {
	db.insert(importProvenance)
		.values({
			lastImportedAt: args.timestamp,
			sourceId: args.sourceId,
			sourceKey: args.row.sourceKey,
			targetId: args.targetId,
			targetType: args.targetType,
		})
		.onConflictDoUpdate({
			target: [importProvenance.sourceId, importProvenance.sourceKey],
			set: {
				lastImportedAt: args.timestamp,
				targetId: args.targetId,
				targetType: args.targetType,
			},
		})
		.run();
}

async function persistReviewItem(args: {
	row: ApplyImportPlanRow;
	sourceId: number;
	timestamp: Date;
}): Promise<void> {
	const existing = db
		.select()
		.from(importReviewItems)
		.where(
			and(
				eq(importReviewItems.sourceId, args.sourceId),
				eq(importReviewItems.sourceKey, args.row.sourceKey),
			),
		)
		.get();

	if (existing) {
		db.update(importReviewItems)
			.set({
				payload: args.row.payload,
				status: "unresolved",
				updatedAt: args.timestamp,
			})
			.where(eq(importReviewItems.id, existing.id))
			.run();
		return;
	}

	db.insert(importReviewItems)
		.values({
			createdAt: args.timestamp,
			payload: args.row.payload,
			resourceType: args.row.resourceType,
			sourceId: args.sourceId,
			sourceKey: args.row.sourceKey,
			status: "unresolved",
			updatedAt: args.timestamp,
		})
		.run();
}

async function applyDownloadClientRow(args: {
	row: ApplyImportPlanRow;
	sourceId: number;
	timestamp: Date;
}): Promise<void> {
	const raw = stripId(getSourcePayload(args.row));
	const values = {
		...(raw as typeof downloadClients.$inferInsert),
		createdAt: args.timestamp.getTime(),
		settings: (isRecord(raw.settings)
			? raw.settings
			: null) as DownloadClientSettings | null,
		updatedAt: args.timestamp.getTime(),
	};
	const inserted = db.insert(downloadClients).values(values).returning().get();

	await writeProvenance({
		row: args.row,
		sourceId: args.sourceId,
		targetId: getProvenanceTargetId(args.row, inserted?.id),
		targetType: getProvenanceTargetType(args.row),
		timestamp: args.timestamp,
	});
}

async function applyDownloadProfileRow(args: {
	row: ApplyImportPlanRow;
	sourceId: number;
	timestamp: Date;
}): Promise<void> {
	const raw = stripId(getSourcePayload(args.row));
	const values = {
		...(raw as typeof downloadProfiles.$inferInsert),
	};
	const inserted = db.insert(downloadProfiles).values(values).returning().get();

	await writeProvenance({
		row: args.row,
		sourceId: args.sourceId,
		targetId: getProvenanceTargetId(args.row, inserted?.id),
		targetType: getProvenanceTargetType(args.row),
		timestamp: args.timestamp,
	});
}

async function applyMetadataProfileRow(args: {
	row: ApplyImportPlanRow;
	sourceId: number;
	timestamp: Date;
}): Promise<void> {
	const raw = getSourcePayload(args.row);
	upsertSettingValue("metadata.hardcover.profile", raw);

	await writeProvenance({
		row: args.row,
		sourceId: args.sourceId,
		targetId: getProvenanceTargetId(args.row, null),
		targetType: getProvenanceTargetType(args.row),
		timestamp: args.timestamp,
	});
}

function isSupportedRow(row: ApplyImportPlanRow): boolean {
	if (row.action === "skip") {
		return false;
	}
	if (row.action === "unresolved" || row.action === "unsupported") {
		return false;
	}
	if (row.resourceType === "setting") {
		return row.payload.group === "download-client";
	}
	if (row.resourceType === "profile") {
		return (
			row.payload.profileKind === "quality" ||
			row.payload.profileKind === "metadata"
		);
	}
	return false;
}

export async function applyImportPlan(
	args: ApplyImportPlanArgs,
): Promise<ApplyImportPlanResult> {
	const timestamp = new Date();
	const selectedRows = [...args.selectedRows].sort(
		(left, right) =>
			getRowPriority(left) - getRowPriority(right) ||
			left.sourceKey.localeCompare(right.sourceKey) ||
			left.resourceType.localeCompare(right.resourceType) ||
			left.action.localeCompare(right.action),
	);

	let appliedCount = 0;
	let reviewCount = 0;

	for (const row of selectedRows) {
		if (row.action === "skip") {
			continue;
		}

		if (row.action === "unresolved" || row.action === "unsupported") {
			await persistReviewItem({
				row,
				sourceId: args.sourceId,
				timestamp,
			});
			reviewCount += 1;
			continue;
		}

		if (!isSupportedRow(row)) {
			await persistReviewItem({
				row,
				sourceId: args.sourceId,
				timestamp,
			});
			reviewCount += 1;
			continue;
		}

		if (row.resourceType === "setting") {
			await applyDownloadClientRow({
				row,
				sourceId: args.sourceId,
				timestamp,
			});
			appliedCount += 1;
			continue;
		}

		if (
			row.resourceType === "profile" &&
			row.payload.profileKind === "quality"
		) {
			await applyDownloadProfileRow({
				row,
				sourceId: args.sourceId,
				timestamp,
			});
			appliedCount += 1;
			continue;
		}

		if (
			row.resourceType === "profile" &&
			row.payload.profileKind === "metadata"
		) {
			await applyMetadataProfileRow({
				row,
				sourceId: args.sourceId,
				timestamp,
			});
			appliedCount += 1;
		}
	}

	return {
		appliedCount,
		reviewCount,
	};
}
