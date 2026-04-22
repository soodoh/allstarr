import { createServerFn } from "@tanstack/react-start";
import { eq } from "drizzle-orm";
import { db } from "src/db";
import {
	type ImportSource,
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
import { normalizeImportSnapshot } from "./imports/normalize";
import type { ImportSourceKind, RawImportSnapshot } from "./imports/types";
import { requireAdmin } from "./middleware";

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
