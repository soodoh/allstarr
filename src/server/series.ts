import { createServerFn } from "@tanstack/react-start";
import { eq, inArray, sql } from "drizzle-orm";
import { db } from "src/db";
import {
	authors,
	bookImportListExclusions,
	books,
	editionDownloadProfiles,
	editions,
	history,
	series,
	seriesBookLinks,
	seriesDownloadProfiles,
} from "src/db/schema";
import { refreshSeriesSchema, updateSeriesSchema } from "src/lib/validators";
import { fetchSeriesComplete } from "./hardcover/import-queries";
import { ensureEditionProfileLinks, importAuthorInternal } from "./import";
import { requireAuth } from "./middleware";
import getProfileLanguages from "./profile-languages";

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

// ─── Refresh Series (internal) ─────────────────────────────────────────

export async function refreshSeriesInternal(seriesId?: number): Promise<{
	seriesRefreshed: number;
	booksAdded: number;
	authorsImported: number;
	errors: string[];
}> {
	// Query monitored series (or a single series by id)
	const monitoredSeries = seriesId
		? db.select().from(series).where(eq(series.id, seriesId)).all()
		: db.select().from(series).where(eq(series.monitored, true)).all();

	const stats = {
		seriesRefreshed: 0,
		booksAdded: 0,
		authorsImported: 0,
		errors: [] as string[],
	};

	if (monitoredSeries.length === 0) {
		return stats;
	}

	const langCodes = getProfileLanguages();

	// Load all excluded foreign book IDs
	const excludedForeignBookIds = new Set(
		db
			.select({ foreignBookId: bookImportListExclusions.foreignBookId })
			.from(bookImportListExclusions)
			.all()
			.map((r) => r.foreignBookId),
	);

	// Filter to series with a foreign ID and batch-fetch from Hardcover
	const seriesWithForeignId = monitoredSeries.filter(
		(s) => s.foreignSeriesId !== null,
	);
	if (seriesWithForeignId.length === 0) {
		return stats;
	}

	const foreignIdToLocal = new Map(
		seriesWithForeignId.map((s) => [Number(s.foreignSeriesId), s]),
	);
	const foreignSeriesIds = seriesWithForeignId.map((s) =>
		Number(s.foreignSeriesId),
	);

	let rawSeriesList;
	try {
		rawSeriesList = await fetchSeriesComplete(foreignSeriesIds, langCodes, 0);
	} catch (err) {
		stats.errors.push(
			`Failed to fetch series from Hardcover: ${err instanceof Error ? err.message : String(err)}`,
		);
		return stats;
	}

	for (const rawSeries of rawSeriesList) {
		const localSeries = foreignIdToLocal.get(rawSeries.id);
		if (!localSeries) {
			continue;
		}

		try {
			// Update series metadata
			db.update(series)
				.set({
					title: rawSeries.title,
					slug: rawSeries.slug,
					isCompleted: rawSeries.isCompleted,
					metadataUpdatedAt: new Date(),
					updatedAt: new Date(),
				})
				.where(eq(series.id, localSeries.id))
				.run();

			// Load download profile IDs for this series
			const profileLinks = db
				.select({ downloadProfileId: seriesDownloadProfiles.downloadProfileId })
				.from(seriesDownloadProfiles)
				.where(eq(seriesDownloadProfiles.seriesId, localSeries.id))
				.all();
			const downloadProfileIds = profileLinks.map((p) => p.downloadProfileId);

			// Find existing local book foreign IDs for this series
			const existingBookLinks = db
				.select({ bookId: seriesBookLinks.bookId })
				.from(seriesBookLinks)
				.where(eq(seriesBookLinks.seriesId, localSeries.id))
				.all();
			const existingBookIds = new Set(existingBookLinks.map((l) => l.bookId));

			// Also look up all local books by foreignBookId so we can detect ones
			// already in the library but not yet linked to this series
			const allLocalBooks = db
				.select({ id: books.id, foreignBookId: books.foreignBookId })
				.from(books)
				.all();
			const foreignToLocalBook = new Map(
				allLocalBooks
					.filter((b) => b.foreignBookId !== null)
					.map((b) => [b.foreignBookId as string, b.id]),
			);

			for (const rawBook of rawSeries.books) {
				const foreignBookIdStr = String(rawBook.bookId);

				// Skip excluded books
				if (excludedForeignBookIds.has(foreignBookIdStr)) {
					continue;
				}

				// Check if book is already linked to this series
				const existingLocalBookId = foreignToLocalBook.get(foreignBookIdStr);
				if (existingLocalBookId && existingBookIds.has(existingLocalBookId)) {
					continue;
				}

				// If book exists locally but isn't linked to this series, link it
				// and ensure edition profile links
				if (existingLocalBookId) {
					db.insert(seriesBookLinks)
						.values({
							seriesId: localSeries.id,
							bookId: existingLocalBookId,
							position: rawBook.position,
						})
						.onConflictDoNothing()
						.run();

					if (downloadProfileIds.length > 0) {
						ensureEditionProfileLinks(existingLocalBookId, downloadProfileIds);
					}
					continue;
				}

				// New book — need to import via its author
				if (!rawBook.authorId) {
					stats.errors.push(
						`Book "${rawBook.bookTitle}" (HC #${rawBook.bookId}) has no author — skipped`,
					);
					continue;
				}

				// Check if the author already exists locally
				const localAuthor = db
					.select({ id: authors.id })
					.from(authors)
					.where(eq(authors.foreignAuthorId, String(rawBook.authorId)))
					.get();

				if (!localAuthor) {
					// Import the author (which also imports all their books)
					try {
						await importAuthorInternal({
							foreignAuthorId: rawBook.authorId,
							downloadProfileIds: [],
							monitorOption: "none",
							monitorNewBooks: "none",
						});
						stats.authorsImported += 1;
					} catch (err) {
						// Author might already exist from a concurrent import — continue
						const msg = err instanceof Error ? err.message : String(err);
						if (!msg.includes("already on your bookshelf")) {
							stats.errors.push(
								`Failed to import author "${rawBook.authorName}" for book "${rawBook.bookTitle}": ${msg}`,
							);
							continue;
						}
					}
				}

				// After author import, the book should now exist locally
				const newLocalBook = db
					.select({ id: books.id })
					.from(books)
					.where(eq(books.foreignBookId, foreignBookIdStr))
					.get();

				if (!newLocalBook) {
					stats.errors.push(
						`Book "${rawBook.bookTitle}" (HC #${rawBook.bookId}) not found after author import — skipped`,
					);
					continue;
				}

				// Link book to series
				db.insert(seriesBookLinks)
					.values({
						seriesId: localSeries.id,
						bookId: newLocalBook.id,
						position: rawBook.position,
					})
					.onConflictDoNothing()
					.run();

				// Monitor the book with the series' download profiles
				if (downloadProfileIds.length > 0) {
					ensureEditionProfileLinks(newLocalBook.id, downloadProfileIds);
				}

				// Log history
				db.insert(history)
					.values({
						eventType: "bookAdded",
						bookId: newLocalBook.id,
						data: {
							title: rawBook.bookTitle,
							source: "series-refresh",
							seriesId: localSeries.id,
							seriesTitle: localSeries.title,
						},
					})
					.run();

				stats.booksAdded += 1;
			}

			stats.seriesRefreshed += 1;
		} catch (err) {
			stats.errors.push(
				`Error refreshing series "${localSeries.title}": ${err instanceof Error ? err.message : String(err)}`,
			);
		}
	}

	return stats;
}

// ─── Refresh Series (server function) ──────────────────────────────────

export const refreshSeriesFn = createServerFn({ method: "POST" })
	.inputValidator((d: unknown) => refreshSeriesSchema.parse(d))
	.handler(async ({ data }) => {
		await requireAuth();
		return refreshSeriesInternal(data.seriesId);
	});
