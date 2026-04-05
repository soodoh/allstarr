import { createServerFn } from "@tanstack/react-start";
import { eq, inArray, sql } from "drizzle-orm";
import { db } from "src/db";
import {
	editionDownloadProfiles,
	editions,
	series,
	seriesBookLinks,
	seriesDownloadProfiles,
} from "src/db/schema";
import { updateSeriesSchema } from "src/lib/validators";
import { requireAuth } from "./middleware";

// ─── Get Series List ────────────────────────────────────────────────────

export const getSeriesListFn = createServerFn({ method: "GET" }).handler(
	async () => {
		await requireAuth();

		const seriesWithMonitoredBooks = db
			.selectDistinct({ seriesId: seriesBookLinks.seriesId })
			.from(seriesBookLinks)
			.where(
				sql`EXISTS (
                    SELECT 1 FROM ${editionDownloadProfiles}
                    INNER JOIN ${editions} ON ${editions.id} = ${editionDownloadProfiles.editionId}
                    WHERE ${editions.bookId} = ${seriesBookLinks.bookId}
                )`,
			)
			.all();

		const seriesIds = seriesWithMonitoredBooks.map((r) => r.seriesId);
		if (seriesIds.length === 0) {
			return [];
		}

		const seriesRecords = db
			.select()
			.from(series)
			.where(inArray(series.id, seriesIds))
			.all();

		const allLinks = db
			.select()
			.from(seriesBookLinks)
			.where(inArray(seriesBookLinks.seriesId, seriesIds))
			.all();

		const allProfileLinks = db
			.select()
			.from(seriesDownloadProfiles)
			.where(inArray(seriesDownloadProfiles.seriesId, seriesIds))
			.all();

		return seriesRecords.map((s) => {
			const bookLinks = allLinks.filter((l) => l.seriesId === s.id);
			const profileIds = allProfileLinks
				.filter((pl) => pl.seriesId === s.id)
				.map((pl) => pl.downloadProfileId);

			return {
				...s,
				bookCount: bookLinks.length,
				books: bookLinks.map((l) => ({
					bookId: l.bookId,
					position: l.position,
				})),
				downloadProfileIds: profileIds,
			};
		});
	},
);

// ─── Update Series ──────────────────────────────────────────────────────

export const updateSeriesFn = createServerFn({ method: "POST" })
	.inputValidator((d: unknown) => updateSeriesSchema.parse(d))
	.handler(async ({ data }) => {
		await requireAuth();

		const { id, downloadProfileIds, ...updates } = data;

		db.update(series)
			.set({ ...updates, updatedAt: new Date() })
			.where(eq(series.id, id))
			.run();

		if (downloadProfileIds !== undefined) {
			db.delete(seriesDownloadProfiles)
				.where(eq(seriesDownloadProfiles.seriesId, id))
				.run();
			for (const profileId of downloadProfileIds) {
				db.insert(seriesDownloadProfiles)
					.values({ seriesId: id, downloadProfileId: profileId })
					.run();
			}
		}

		return { success: true };
	});
