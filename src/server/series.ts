import { createServerFn } from "@tanstack/react-start";
import { desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "src/db";
import {
	authors,
	bookFiles,
	bookImportListExclusions,
	books,
	booksAuthors,
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
import { requireAdmin, requireAuth } from "./middleware";
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
			return { series: [], books: [], availableLanguages: [] };
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

		// Collect all book IDs across all series
		const allBookIds = [...new Set(allLinks.map((l) => l.bookId))];

		// Batch-fetch book details
		const allBooks =
			allBookIds.length > 0
				? db
						.select({
							id: books.id,
							title: books.title,
							slug: books.slug,
							description: books.description,
							releaseDate: books.releaseDate,
							releaseYear: books.releaseYear,
							foreignBookId: books.foreignBookId,
							images: books.images,
							rating: books.rating,
							ratingsCount: books.ratingsCount,
							usersCount: books.usersCount,
							tags: books.tags,
							metadataSourceMissingSince: books.metadataSourceMissingSince,
						})
						.from(books)
						.where(inArray(books.id, allBookIds))
						.all()
				: [];

		// Batch-fetch booksAuthors for all books
		const allBookAuthorEntries =
			allBookIds.length > 0
				? db
						.select({
							bookId: booksAuthors.bookId,
							authorId: booksAuthors.authorId,
							foreignAuthorId: booksAuthors.foreignAuthorId,
							authorName: booksAuthors.authorName,
							isPrimary: booksAuthors.isPrimary,
						})
						.from(booksAuthors)
						.where(inArray(booksAuthors.bookId, allBookIds))
						.all()
				: [];

		const bookAuthorsMap = new Map<
			number,
			Array<{
				authorId: number | null;
				foreignAuthorId: string;
				authorName: string;
				isPrimary: boolean;
			}>
		>();
		for (const entry of allBookAuthorEntries) {
			const arr = bookAuthorsMap.get(entry.bookId) ?? [];
			arr.push({
				authorId: entry.authorId,
				foreignAuthorId: entry.foreignAuthorId,
				authorName: entry.authorName,
				isPrimary: entry.isPrimary,
			});
			bookAuthorsMap.set(entry.bookId, arr);
		}

		// Batch-fetch editions for all books
		const allEditions =
			allBookIds.length > 0
				? db
						.select({
							id: editions.id,
							bookId: editions.bookId,
							title: editions.title,
							releaseDate: editions.releaseDate,
							format: editions.format,
							pageCount: editions.pageCount,
							isbn10: editions.isbn10,
							isbn13: editions.isbn13,
							asin: editions.asin,
							usersCount: editions.usersCount,
							score: editions.score,
							languageCode: editions.languageCode,
							images: editions.images,
							isDefaultCover: editions.isDefaultCover,
							metadataSourceMissingSince: editions.metadataSourceMissingSince,
						})
						.from(editions)
						.where(inArray(editions.bookId, allBookIds))
						.orderBy(desc(editions.usersCount))
						.all()
				: [];

		// Batch-fetch edition download profile links
		const allEditionIds = allEditions.map((e) => e.id);
		const editionProfileLinks =
			allEditionIds.length > 0
				? db
						.select({
							editionId: editionDownloadProfiles.editionId,
							downloadProfileId: editionDownloadProfiles.downloadProfileId,
						})
						.from(editionDownloadProfiles)
						.where(inArray(editionDownloadProfiles.editionId, allEditionIds))
						.all()
				: [];

		const editionProfilesMap = new Map<number, number[]>();
		for (const link of editionProfileLinks) {
			const arr = editionProfilesMap.get(link.editionId) ?? [];
			arr.push(link.downloadProfileId);
			editionProfilesMap.set(link.editionId, arr);
		}

		// Group editions by bookId
		const bookEditionsMap = new Map<
			number,
			Array<(typeof allEditions)[number] & { downloadProfileIds: number[] }>
		>();
		for (const ed of allEditions) {
			const arr = bookEditionsMap.get(ed.bookId) ?? [];
			arr.push({
				...ed,
				downloadProfileIds: editionProfilesMap.get(ed.id) ?? [],
			});
			bookEditionsMap.set(ed.bookId, arr);
		}

		// Batch-fetch file counts
		const fileCountsMap = new Map<number, number>();
		if (allBookIds.length > 0) {
			const fileCounts = db
				.select({
					bookId: bookFiles.bookId,
					count: sql<number>`count(*)`,
				})
				.from(bookFiles)
				.where(inArray(bookFiles.bookId, allBookIds))
				.groupBy(bookFiles.bookId)
				.all();
			for (const fc of fileCounts) {
				fileCountsMap.set(fc.bookId, fc.count);
			}
		}

		// Get available languages across all series books
		const availableLanguages =
			allBookIds.length > 0
				? (db
						.select({
							languageCode: editions.languageCode,
							language: editions.language,
							totalReaders: sql<number>`COALESCE(SUM(${books.usersCount}), 0)`,
						})
						.from(editions)
						.innerJoin(books, eq(editions.bookId, books.id))
						.where(inArray(books.id, allBookIds))
						.groupBy(editions.languageCode, editions.language)
						.orderBy(desc(sql`COALESCE(SUM(${books.usersCount}), 0)`))
						.all()
						.filter((l) => l.languageCode && l.language) as Array<{
						languageCode: string;
						language: string;
						totalReaders: number;
					}>)
				: [];

		// Build enriched book map
		const enrichedBooks = new Map<
			number,
			(typeof allBooks)[number] & {
				bookAuthors: Array<{
					authorId: number | null;
					foreignAuthorId: string;
					authorName: string;
					isPrimary: boolean;
				}>;
				authorName: string | null;
				authorForeignId: string | null;
				downloadProfileIds: number[];
				languageCodes: string[];
				editions: Array<
					(typeof allEditions)[number] & { downloadProfileIds: number[] }
				>;
				fileCount: number;
				missingEditionsCount: number;
			}
		>();
		for (const b of allBooks) {
			const ba = bookAuthorsMap.get(b.id) ?? [];
			const primaryAuthor = ba.find((a) => a.isPrimary);
			const bookEditions = bookEditionsMap.get(b.id) ?? [];
			const bookDownloadProfileIds = [
				...new Set(bookEditions.flatMap((e) => e.downloadProfileIds)),
			];
			enrichedBooks.set(b.id, {
				...b,
				bookAuthors: ba,
				authorName: primaryAuthor?.authorName ?? null,
				authorForeignId: primaryAuthor?.foreignAuthorId ?? null,
				downloadProfileIds: bookDownloadProfileIds,
				languageCodes: [
					...new Set(bookEditions.map((e) => e.languageCode).filter(Boolean)),
				] as string[],
				editions: bookEditions,
				fileCount: fileCountsMap.get(b.id) ?? 0,
				missingEditionsCount: bookEditions.filter(
					(e) => e.metadataSourceMissingSince !== null,
				).length,
			});
		}

		const seriesList = seriesRecords.map((s) => {
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

		return {
			series: seriesList,
			books: [...enrichedBooks.values()],
			availableLanguages,
		};
	},
);

// ─── Update Series ──────────────────────────────────────────────────────

export const updateSeriesFn = createServerFn({ method: "POST" })
	.inputValidator((d: unknown) => updateSeriesSchema.parse(d))
	.handler(async ({ data }) => {
		await requireAdmin();

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

	let rawSeriesList: Awaited<ReturnType<typeof fetchSeriesComplete>>;
	try {
		rawSeriesList = await fetchSeriesComplete(foreignSeriesIds, langCodes, 0);
	} catch (err) {
		stats.errors.push(
			`Failed to fetch series from Hardcover: ${err instanceof Error ? err.message : String(err)}`,
		);
		return stats;
	}

	// Build a map of foreignBookId → local book ID (hoisted outside loop)
	const allLocalBooks = db
		.select({ id: books.id, foreignBookId: books.foreignBookId })
		.from(books)
		.all();
	const foreignToLocalBook = new Map(
		allLocalBooks
			.filter((b) => b.foreignBookId !== null)
			.map((b) => [b.foreignBookId as string, b.id]),
	);

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

				// Update the map so subsequent series iterations see this book
				foreignToLocalBook.set(foreignBookIdStr, newLocalBook.id);
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
		await requireAdmin();
		return refreshSeriesInternal(data.seriesId);
	});
