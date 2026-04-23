import { createServerFn } from "@tanstack/react-start";
import { eq } from "drizzle-orm";
import { db } from "src/db";
import {
	books,
	booksAuthors,
	type ImportSource,
	importProvenance,
	importReviewItems,
	importSnapshots,
	importSources,
	movies,
	shows,
} from "src/db/schema";
import {
	applyImportPlanSchema,
	createImportSourceSchema,
	deleteImportSourceSchema,
	refreshImportSourceSchema,
	resolveImportReviewItemSchema,
	updateImportSourceSchema,
} from "src/lib/validators";
import { z } from "zod";
import { applyImportPlan } from "./imports/apply";
import { fetchBookshelfSnapshot } from "./imports/connectors/bookshelf";
import { fetchRadarrSnapshot } from "./imports/connectors/radarr";
import { fetchReadarrSnapshot } from "./imports/connectors/readarr";
import { fetchSonarrSnapshot } from "./imports/connectors/sonarr";
import { buildBookFingerprint } from "./imports/match";
import { normalizeImportSnapshot } from "./imports/normalize";
import {
	buildImportPlan,
	type ImportPlanPayload,
	type ImportPlanRow,
} from "./imports/plan";
import type { ImportSourceKind, RawImportSnapshot } from "./imports/types";
import { requireAdmin } from "./middleware";

const importSourceIdSchema = z.object({
	sourceId: z.number(),
});

type ImportPlanReadRow = {
	action: string;
	payload: ImportPlanPayload;
	reason: string | null;
	resourceType: string;
	selectable: boolean;
	sourceKey: string;
	sourceSummary: string;
	target: {
		id: number | null;
		label: string | null;
	};
	title: string;
};

type ImportReviewReadRow = {
	action: string;
	payload: ImportPlanPayload;
	reason: string | null;
	resourceType: string;
	sourceKey: string;
	sourceSummary: string;
	status: "ready" | "blocked" | "unresolved";
	target: {
		id: number | null;
		label: string | null;
	};
	title: string;
};

function flattenPlanRows(
	plan: ReturnType<typeof buildImportPlan>,
): ImportPlanRow[] {
	return [
		...plan.settings.items,
		...plan.qualityProfiles.items,
		...plan.metadataProfiles.items,
		...plan.library.items,
		...plan.activity.items,
		...plan.unresolved.items,
		...plan.unsupported.items,
	];
}

function toClientImportSource(source: ImportSource) {
	const { apiKey, ...safeSource } = source;
	return {
		...safeSource,
		hasApiKey: apiKey.trim().length > 0,
	};
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

function getLatestSnapshot(sourceId: number) {
	return db
		.select()
		.from(importSnapshots)
		.where(eq(importSnapshots.sourceId, sourceId))
		.orderBy(importSnapshots.fetchedAt)
		.all()
		.at(-1);
}

function getTargetLabel(
	resourceType: string,
	targetId: number | null,
): string | null {
	if (targetId === null) {
		return null;
	}

	if (resourceType === "movie") {
		return (
			db
				.select({ title: movies.title })
				.from(movies)
				.where(eq(movies.id, targetId))
				.get()?.title ?? null
		);
	}

	if (resourceType === "show") {
		return (
			db
				.select({ title: shows.title })
				.from(shows)
				.where(eq(shows.id, targetId))
				.get()?.title ?? null
		);
	}

	if (resourceType === "book") {
		return (
			db
				.select({ title: books.title })
				.from(books)
				.where(eq(books.id, targetId))
				.get()?.title ?? null
		);
	}

	return null;
}

function formatSourceSummary(row: ImportPlanRow): string {
	const payload = row.payload ?? {};

	if (row.resourceType === "show") {
		const tmdbId =
			typeof payload.tmdbId === "number" ? `TMDB ${payload.tmdbId}` : null;
		const tvdbId =
			typeof payload.tvdbId === "number" ? `TVDB ${payload.tvdbId}` : null;
		return [tmdbId, tvdbId].filter(Boolean).join(" | ") || "Mapped show item";
	}

	if (row.resourceType === "movie") {
		return typeof payload.tmdbId === "number"
			? `TMDB ${payload.tmdbId}`
			: "Mapped movie item";
	}

	if (row.resourceType === "book") {
		const author =
			typeof payload.authorName === "string"
				? `Author ${payload.authorName}`
				: null;
		const foreignBookId =
			typeof payload.foreignBookId === "string"
				? `Hardcover ${payload.foreignBookId}`
				: null;
		return (
			[author, foreignBookId].filter(Boolean).join(" | ") || "Mapped book item"
		);
	}

	if (row.resourceType === "profile") {
		return typeof payload.profileKind === "string"
			? `${payload.profileKind} profile`
			: "Profile row";
	}

	if (row.resourceType === "setting") {
		return typeof payload.group === "string" ? payload.group : "Setting row";
	}

	return row.resourceType;
}

function serializePlanRow(row: ImportPlanRow): ImportPlanReadRow {
	return {
		action: row.action,
		payload:
			row.targetId === null
				? row.payload
				: {
						...row.payload,
						targetId: row.targetId,
					},
		reason: row.warning,
		resourceType: row.resourceType,
		selectable: row.selectable,
		sourceKey: row.sourceKey,
		sourceSummary: formatSourceSummary(row),
		target: {
			id: row.targetId,
			label: getTargetLabel(row.resourceType, row.targetId),
		},
		title: row.title,
	};
}

function serializeReviewRow(row: ImportPlanRow): ImportReviewReadRow {
	return {
		action: row.action,
		payload:
			row.targetId === null
				? row.payload
				: {
						...row.payload,
						targetId: row.targetId,
					},
		reason: row.warning,
		resourceType: row.resourceType,
		sourceKey: row.sourceKey,
		sourceSummary: formatSourceSummary(row),
		status: row.action === "unresolved" ? "unresolved" : "blocked",
		target: {
			id: row.targetId,
			label: getTargetLabel(row.resourceType, row.targetId),
		},
		title: row.title,
	};
}

function loadExistingState() {
	const moviesByTmdbId = new Map(
		db
			.select({ id: movies.id, tmdbId: movies.tmdbId })
			.from(movies)
			.all()
			.map((row) => [row.tmdbId, { id: row.id }] as const),
	);

	const showsByTmdbId = new Map(
		db
			.select({ id: shows.id, tmdbId: shows.tmdbId })
			.from(shows)
			.all()
			.map((row) => [row.tmdbId, { id: row.id }] as const),
	);

	const booksByForeignBookId = new Map(
		db
			.select({
				foreignBookId: books.foreignBookId,
				id: books.id,
				releaseYear: books.releaseYear,
				title: books.title,
			})
			.from(books)
			.all()
			.filter(
				(
					row,
				): row is {
					foreignBookId: string;
					id: number;
					releaseYear: number | null;
					title: string;
				} =>
					typeof row.foreignBookId === "string" && row.foreignBookId.length > 0,
			)
			.map((row) => [row.foreignBookId, { id: row.id }] as const),
	);

	const primaryAuthorByBookId = new Map<number, string>();
	for (const row of db
		.select({
			authorName: booksAuthors.authorName,
			bookId: booksAuthors.bookId,
			isPrimary: booksAuthors.isPrimary,
		})
		.from(booksAuthors)
		.all()
		.sort(
			(left, right) =>
				Number(right.isPrimary) - Number(left.isPrimary) ||
				left.bookId - right.bookId,
		)) {
		if (!primaryAuthorByBookId.has(row.bookId)) {
			primaryAuthorByBookId.set(row.bookId, row.authorName);
		}
	}

	const bookFingerprintToId = new Map(
		db
			.select({
				id: books.id,
				releaseYear: books.releaseYear,
				title: books.title,
			})
			.from(books)
			.all()
			.map((row) => {
				const authorName = primaryAuthorByBookId.get(row.id) ?? null;
				const fingerprint = buildBookFingerprint({
					authorName,
					title: row.title,
					year: row.releaseYear,
				});
				return fingerprint.length > 0 ? ([fingerprint, row.id] as const) : null;
			})
			.filter((entry): entry is readonly [string, number] => entry !== null),
	);

	const provenanceBySourceKey = new Map(
		db
			.select({
				sourceKey: importProvenance.sourceKey,
				targetId: importProvenance.targetId,
				targetType: importProvenance.targetType,
			})
			.from(importProvenance)
			.all()
			.map(
				(row) =>
					[
						row.sourceKey,
						{
							targetId: Number(row.targetId),
							targetType: row.targetType,
						},
					] as const,
			)
			.filter((entry) => Number.isInteger(entry[1].targetId)),
	);

	return {
		bookFingerprintToId,
		booksByForeignBookId,
		moviesByTmdbId,
		provenanceBySourceKey,
		showsByTmdbId,
	};
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
		const source = db
			.select()
			.from(importSources)
			.where(eq(importSources.id, data.sourceId))
			.get();

		if (!source) {
			throw new Error("Import source not found");
		}

		const snapshot = getLatestSnapshot(source.id);
		if (!snapshot) {
			throw new Error("Import snapshot not found");
		}

		const plan = buildImportPlan({
			snapshots: [
				snapshot.payload as ReturnType<typeof normalizeImportSnapshot>,
			],
			existingState: loadExistingState(),
		});
		const planRowsBySourceKey = new Map(
			flattenPlanRows(plan).map((row) => [row.sourceKey, row] as const),
		);
		const selectedRows = data.selectedRows.map((row) => {
			const canonical = planRowsBySourceKey.get(row.sourceKey);
			if (!canonical) {
				throw new Error(`Import plan row not found for ${row.sourceKey}`);
			}

			return {
				action: canonical.action,
				payload:
					canonical.targetId === null
						? canonical.payload
						: {
								...canonical.payload,
								targetId: canonical.targetId,
							},
				resourceType: canonical.resourceType,
				sourceKey: canonical.sourceKey,
			};
		});

		return applyImportPlan({
			selectedRows,
			sourceId: data.sourceId,
		});
	});

export const getImportPlanFn = createServerFn({ method: "POST" })
	.inputValidator((data: unknown) => importSourceIdSchema.parse(data))
	.handler(async ({ data }) => {
		await requireAdmin();
		const source = db
			.select()
			.from(importSources)
			.where(eq(importSources.id, data.sourceId))
			.get();

		if (!source) {
			throw new Error("Import source not found");
		}

		const snapshot = getLatestSnapshot(source.id);
		if (!snapshot) {
			return [] as ImportPlanReadRow[];
		}

		const plan = buildImportPlan({
			snapshots: [
				snapshot.payload as ReturnType<typeof normalizeImportSnapshot>,
			],
			existingState: loadExistingState(),
		});

		return [
			...plan.settings.items,
			...plan.qualityProfiles.items,
			...plan.metadataProfiles.items,
			...plan.library.items,
			...plan.activity.items,
		].map(serializePlanRow);
	});

export const getImportReviewFn = createServerFn({ method: "POST" })
	.inputValidator((data: unknown) => importSourceIdSchema.parse(data))
	.handler(async ({ data }) => {
		await requireAdmin();
		const source = db
			.select()
			.from(importSources)
			.where(eq(importSources.id, data.sourceId))
			.get();

		if (!source) {
			throw new Error("Import source not found");
		}

		const snapshot = getLatestSnapshot(source.id);
		if (!snapshot) {
			return [] as ImportReviewReadRow[];
		}

		const plan = buildImportPlan({
			snapshots: [
				snapshot.payload as ReturnType<typeof normalizeImportSnapshot>,
			],
			existingState: loadExistingState(),
		});

		return [
			...plan.unresolved.items,
			...plan.unsupported.items,
			...plan.settings.items.filter((row) => !row.selectable),
			...plan.qualityProfiles.items.filter((row) => !row.selectable),
			...plan.metadataProfiles.items.filter((row) => !row.selectable),
			...plan.library.items.filter((row) => !row.selectable),
			...plan.activity.items.filter((row) => !row.selectable),
		].map(serializeReviewRow);
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
