import { and, eq } from "drizzle-orm";
import { db } from "src/db";
import {
	downloadClients,
	downloadProfiles,
	importProvenance,
	importReviewItems,
	settings,
} from "src/db/schema";
import type { DownloadClientSettings } from "src/db/schema/download-clients";

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

type DbClient = Pick<typeof db, "insert" | "select" | "update">;

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isSupportedAction(action: string): boolean {
	return action === "create" || action === "update";
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

function getExplicitTargetId(row: ApplyImportPlanRow): number | null {
	const value = row.payload.targetId;
	if (typeof value === "number" && Number.isFinite(value)) {
		return value;
	}
	if (typeof value === "string") {
		const parsed = Number(value.trim());
		return Number.isInteger(parsed) ? parsed : null;
	}
	return null;
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

function getExistingProvenance(args: {
	tx: DbClient;
	sourceId: number;
	sourceKey: string;
}) {
	return args.tx
		.select()
		.from(importProvenance)
		.where(
			and(
				eq(importProvenance.sourceId, args.sourceId),
				eq(importProvenance.sourceKey, args.sourceKey),
			),
		)
		.get();
}

function getTargetIdNumber(targetId: string): number | null {
	const parsed = Number(targetId);
	return Number.isInteger(parsed) ? parsed : null;
}

function writeProvenance(args: {
	tx: DbClient;
	row: ApplyImportPlanRow;
	sourceId: number;
	targetId: string;
	targetType: string;
	timestamp: Date;
}): void {
	args.tx
		.insert(importProvenance)
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
	tx: DbClient;
	row: ApplyImportPlanRow;
	sourceId: number;
	timestamp: Date;
}): Promise<void> {
	const existing = args.tx
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
		args.tx
			.update(importReviewItems)
			.set({
				payload: args.row.payload,
				status: "unresolved",
				updatedAt: args.timestamp,
			})
			.where(eq(importReviewItems.id, existing.id))
			.run();
		return;
	}

	args.tx
		.insert(importReviewItems)
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

function buildDownloadClientValues(args: {
	row: ApplyImportPlanRow;
	timestamp: Date;
	includeCreatedAt: boolean;
}) {
	const raw = stripId(getSourcePayload(args.row));
	const settingsValue = isRecord(raw.settings)
		? (raw.settings as DownloadClientSettings)
		: null;
	return {
		...(raw as typeof downloadClients.$inferInsert),
		...(args.includeCreatedAt ? { createdAt: args.timestamp.getTime() } : {}),
		settings: settingsValue,
		updatedAt: args.timestamp.getTime(),
	};
}

function buildDownloadProfileValues(args: { row: ApplyImportPlanRow }) {
	const raw = stripId(getSourcePayload(args.row));
	return {
		...(raw as typeof downloadProfiles.$inferInsert),
	};
}

async function applyDownloadClientRow(args: {
	tx: DbClient;
	row: ApplyImportPlanRow;
	sourceId: number;
	timestamp: Date;
	provenance: { targetId: string; targetType: string } | undefined;
}): Promise<boolean> {
	const targetId =
		args.provenance?.targetType === "download-client"
			? getTargetIdNumber(args.provenance.targetId)
			: null;
	const existing =
		targetId === null
			? undefined
			: args.tx
					.select()
					.from(downloadClients)
					.where(eq(downloadClients.id, targetId))
					.get();

	if (args.row.action === "update" && !existing) {
		await persistReviewItem({
			row: args.row,
			sourceId: args.sourceId,
			timestamp: args.timestamp,
			tx: args.tx,
		});
		return false;
	}

	if (existing) {
		const updated = args.tx
			.update(downloadClients)
			.set(
				buildDownloadClientValues({
					includeCreatedAt: false,
					row: args.row,
					timestamp: args.timestamp,
				}),
			)
			.where(eq(downloadClients.id, existing.id))
			.returning()
			.get();

		writeProvenance({
			row: args.row,
			sourceId: args.sourceId,
			targetId: getProvenanceTargetId(args.row, updated?.id ?? existing.id),
			targetType: getProvenanceTargetType(args.row),
			timestamp: args.timestamp,
			tx: args.tx,
		});
		return true;
	}

	const inserted = args.tx
		.insert(downloadClients)
		.values(
			buildDownloadClientValues({
				includeCreatedAt: true,
				row: args.row,
				timestamp: args.timestamp,
			}),
		)
		.returning()
		.get();

	writeProvenance({
		row: args.row,
		sourceId: args.sourceId,
		targetId: getProvenanceTargetId(args.row, inserted?.id),
		targetType: getProvenanceTargetType(args.row),
		timestamp: args.timestamp,
		tx: args.tx,
	});
	return true;
}

async function applyDownloadProfileRow(args: {
	tx: DbClient;
	row: ApplyImportPlanRow;
	sourceId: number;
	timestamp: Date;
	provenance: { targetId: string; targetType: string } | undefined;
}): Promise<boolean> {
	const targetId =
		args.provenance?.targetType === "download-profile"
			? getTargetIdNumber(args.provenance.targetId)
			: null;
	const existing =
		targetId === null
			? undefined
			: args.tx
					.select()
					.from(downloadProfiles)
					.where(eq(downloadProfiles.id, targetId))
					.get();

	if (args.row.action === "update" && !existing) {
		await persistReviewItem({
			row: args.row,
			sourceId: args.sourceId,
			timestamp: args.timestamp,
			tx: args.tx,
		});
		return false;
	}

	if (existing) {
		const updated = args.tx
			.update(downloadProfiles)
			.set(
				buildDownloadProfileValues({
					row: args.row,
				}),
			)
			.where(eq(downloadProfiles.id, existing.id))
			.returning()
			.get();

		writeProvenance({
			row: args.row,
			sourceId: args.sourceId,
			targetId: getProvenanceTargetId(args.row, updated?.id ?? existing.id),
			targetType: getProvenanceTargetType(args.row),
			timestamp: args.timestamp,
			tx: args.tx,
		});
		return true;
	}

	const inserted = args.tx
		.insert(downloadProfiles)
		.values(
			buildDownloadProfileValues({
				row: args.row,
			}),
		)
		.returning()
		.get();

	writeProvenance({
		row: args.row,
		sourceId: args.sourceId,
		targetId: getProvenanceTargetId(args.row, inserted?.id),
		targetType: getProvenanceTargetType(args.row),
		timestamp: args.timestamp,
		tx: args.tx,
	});
	return true;
}

async function applyMetadataProfileRow(args: {
	tx: DbClient;
	row: ApplyImportPlanRow;
	sourceId: number;
	timestamp: Date;
}): Promise<boolean> {
	const raw = getSourcePayload(args.row);
	args.tx
		.insert(settings)
		.values({
			key: "metadata.hardcover.profile",
			value: JSON.stringify(raw),
		})
		.onConflictDoUpdate({
			target: settings.key,
			set: {
				value: JSON.stringify(raw),
			},
		})
		.run();

	writeProvenance({
		row: args.row,
		sourceId: args.sourceId,
		targetId: getProvenanceTargetId(args.row, null),
		targetType: getProvenanceTargetType(args.row),
		timestamp: args.timestamp,
		tx: args.tx,
	});
	return true;
}

function isSupportedRow(row: ApplyImportPlanRow): boolean {
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

	return db.transaction(async (tx) => {
		const transactionDb = tx as DbClient;
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
					tx: transactionDb,
				});
				reviewCount += 1;
				continue;
			}

			if (!isSupportedAction(row.action)) {
				await persistReviewItem({
					row,
					sourceId: args.sourceId,
					timestamp,
					tx: transactionDb,
				});
				reviewCount += 1;
				continue;
			}

			if (
				row.resourceType === "movie" ||
				row.resourceType === "show" ||
				row.resourceType === "book"
			) {
				const targetId = getExplicitTargetId(row);
				if (targetId === null) {
					await persistReviewItem({
						row,
						sourceId: args.sourceId,
						timestamp,
						tx: transactionDb,
					});
					reviewCount += 1;
					continue;
				}

				writeProvenance({
					row,
					sourceId: args.sourceId,
					targetId: String(targetId),
					targetType: getProvenanceTargetType(row),
					timestamp,
					tx: transactionDb,
				});
				appliedCount += 1;
				continue;
			}

			if (!isSupportedRow(row)) {
				await persistReviewItem({
					row,
					sourceId: args.sourceId,
					timestamp,
					tx: transactionDb,
				});
				reviewCount += 1;
				continue;
			}

			const provenance = getExistingProvenance({
				sourceId: args.sourceId,
				sourceKey: row.sourceKey,
				tx: transactionDb,
			});

			if (row.resourceType === "setting") {
				const applied = await applyDownloadClientRow({
					provenance:
						provenance?.targetType === "download-client"
							? {
									targetId: provenance.targetId,
									targetType: provenance.targetType,
								}
							: undefined,
					row,
					sourceId: args.sourceId,
					timestamp,
					tx: transactionDb,
				});
				if (applied) {
					appliedCount += 1;
				} else {
					reviewCount += 1;
				}
				continue;
			}

			if (
				row.resourceType === "profile" &&
				row.payload.profileKind === "quality"
			) {
				const applied = await applyDownloadProfileRow({
					provenance:
						provenance?.targetType === "download-profile"
							? {
									targetId: provenance.targetId,
									targetType: provenance.targetType,
								}
							: undefined,
					row,
					sourceId: args.sourceId,
					timestamp,
					tx: transactionDb,
				});
				if (applied) {
					appliedCount += 1;
				} else {
					reviewCount += 1;
				}
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
					tx: transactionDb,
				});
				appliedCount += 1;
			}
		}

		return {
			appliedCount,
			reviewCount,
		};
	});
}
