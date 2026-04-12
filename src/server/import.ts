import { createServerFn } from "@tanstack/react-start";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "src/db";
import {
	authorDownloadProfiles,
	authors,
	bookFiles,
	bookImportListExclusions,
	books,
	booksAuthors,
	downloadProfiles,
	editionDownloadProfiles,
	editions,
	history,
	series,
	seriesBookLinks,
	seriesDownloadProfiles,
} from "src/db/schema";
import { pickBestEditionForProfile } from "src/lib/editions";
import { z } from "zod";
import { searchForAuthorBooks, searchForBook } from "./auto-search";
import type { CommandHandler } from "./commands";
import { submitCommand } from "./commands";
import { NON_AUTHOR_ROLES } from "./hardcover/constants";
import {
	fetchAuthorComplete,
	fetchBatchedEditions,
	fetchBookComplete,
} from "./hardcover/import-queries";
import type { HardcoverRawBook, HardcoverRawEdition } from "./hardcover/types";
import { logError } from "./logger";
import type { MetadataProfile } from "./metadata-profile";
import { getMetadataProfile } from "./metadata-profile";
import { requireAdmin } from "./middleware";
import getProfileLanguages from "./profile-languages";
import { refreshSeriesInternal } from "./series";

// ---------- Metadata profile filtering ----------

/**
 * Filter editions by the metadata profile's allowed languages.
 * If allowedLanguages is empty, all editions pass.
 * Always preserves the default cover edition (by defaultCoverEditionId) if any edition passes.
 */
function filterEditionsByProfile(
	editions: HardcoverRawEdition[],
	profile: MetadataProfile,
	languages: string[],
	defaultCoverEditionId: number | null,
): HardcoverRawEdition[] {
	const hasLanguageFilter = languages.length > 0;
	const hasIsbnAsinFilter = profile.skipMissingIsbnAsin;
	const hasReleaseDateFilter = profile.skipMissingReleaseDate;
	const hasMinPagesFilter = profile.minimumPages > 0;

	if (
		!hasLanguageFilter &&
		!hasIsbnAsinFilter &&
		!hasReleaseDateFilter &&
		!hasMinPagesFilter
	) {
		return editions;
	}

	const allowedSet = hasLanguageFilter ? new Set(languages) : null;

	const filtered = editions.filter((ed) => {
		if (allowedSet && (!ed.languageCode || !allowedSet.has(ed.languageCode))) {
			return false;
		}
		if (hasIsbnAsinFilter && !ed.isbn10 && !ed.isbn13 && !ed.asin) {
			return false;
		}
		if (hasReleaseDateFilter && !ed.releaseDate) {
			return false;
		}
		if (
			hasMinPagesFilter &&
			ed.format !== "Audiobook" &&
			ed.pageCount !== null &&
			ed.pageCount < profile.minimumPages
		) {
			return false;
		}
		return true;
	});

	// Always include the default cover edition if any edition passed
	if (
		filtered.length > 0 &&
		defaultCoverEditionId !== null &&
		defaultCoverEditionId !== undefined &&
		!filtered.some((ed) => ed.id === defaultCoverEditionId)
	) {
		const coverEd = editions.find((ed) => ed.id === defaultCoverEditionId);
		if (coverEd) {
			filtered.push(coverEd);
		}
	}

	return filtered;
}

/**
 * Check if a book should be skipped based on the metadata profile.
 * Returns true if the book should be skipped.
 */
function shouldSkipBook(
	book: HardcoverRawBook,
	filteredEditions: HardcoverRawEdition[],
	profile: MetadataProfile,
	languages: string[],
): boolean {
	if (profile.skipCompilations && book.isCompilation) {
		return true;
	}
	if (profile.skipMissingReleaseDate && !book.releaseDate) {
		return true;
	}
	if (profile.skipMissingIsbnAsin && filteredEditions.length > 0) {
		const hasIsbnOrAsin = filteredEditions.some(
			(ed) => ed.isbn10 || ed.isbn13 || ed.asin,
		);
		if (!hasIsbnOrAsin) {
			return true;
		}
	}
	// If all editions were filtered out by language, skip the book
	if (filteredEditions.length === 0 && languages.length > 0) {
		return true;
	}
	if (
		profile.minimumPopularity > 0 &&
		(book.usersCount ?? 0) < profile.minimumPopularity
	) {
		return true;
	}
	if (profile.minimumPages > 0) {
		const nonAudioEditions = filteredEditions.filter(
			(ed) => ed.format !== "Audiobook",
		);
		if (nonAudioEditions.length > 0) {
			const hasEnoughPages = nonAudioEditions.some(
				(ed) => ed.pageCount !== null && ed.pageCount >= profile.minimumPages,
			);
			if (!hasEnoughPages) {
				return true;
			}
		}
	}
	return false;
}

// ---------- Shared helpers ----------

function deriveSortName(name: string): string {
	const parts = name.trim().split(" ");
	if (parts.length > 1) {
		return `${parts.at(-1)}, ${parts.slice(0, -1).join(" ")}`;
	}
	return name;
}

function toImageArray(
	url: string | null,
): Array<{ url: string; coverType: string }> {
	if (!url) {
		return [];
	}
	return [{ url, coverType: "poster" }];
}

type ContributionEntry = {
	authorId: number;
	authorName: string;
	contribution: string | null;
	position: number;
};

/**
 * Derive author-role contributors from a book's contributions list.
 * Filters out non-author roles (Narrator, Illustrator, etc.).
 * Returns all contributors sorted by position.
 */
function deriveAuthorContributions(
	contributions: ContributionEntry[],
): Array<{ foreignAuthorId: string; name: string }> {
	return contributions
		.filter(
			(c) => c.contribution === null || !NON_AUTHOR_ROLES.has(c.contribution),
		)
		.toSorted((a, b) => a.position - b.position)
		.map((c) => ({ foreignAuthorId: String(c.authorId), name: c.authorName }));
}

/**
 * Insert booksAuthors entries for a book from its Hardcover contributions.
 * The primary author (matching primaryForeignAuthorId) gets authorId set and isPrimary=true.
 * All other author-role contributors get authorId=null and isPrimary=false.
 */
function insertBookAuthors(
	tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
	bookId: number,
	contributions: ContributionEntry[],
	primaryForeignAuthorId: number,
	localAuthorId: number,
): void {
	const authorContribs = deriveAuthorContributions(contributions);
	let primaryFound = false;

	for (const contrib of authorContribs) {
		const isThePrimary =
			contrib.foreignAuthorId === String(primaryForeignAuthorId);
		if (isThePrimary) {
			primaryFound = true;
		}
		tx.insert(booksAuthors)
			.values({
				bookId,
				authorId: isThePrimary ? localAuthorId : null,
				foreignAuthorId: contrib.foreignAuthorId,
				authorName: contrib.name,
				isPrimary: isThePrimary,
			})
			.onConflictDoUpdate({
				target: [booksAuthors.bookId, booksAuthors.foreignAuthorId],
				set: {
					authorId: isThePrimary ? localAuthorId : undefined,
					authorName: contrib.name,
					isPrimary: isThePrimary,
				},
			})
			.run();
	}

	// Fallback: if the importing author wasn't in the (possibly truncated) contributions,
	// ensure they still get a booksAuthors entry since the GraphQL WHERE clause guarantees
	// the relationship exists.
	if (!primaryFound && localAuthorId > 0) {
		const localAuthor = tx
			.select({ name: authors.name })
			.from(authors)
			.where(eq(authors.id, localAuthorId))
			.get();
		if (localAuthor) {
			tx.insert(booksAuthors)
				.values({
					bookId,
					authorId: localAuthorId,
					foreignAuthorId: String(primaryForeignAuthorId),
					authorName: localAuthor.name,
					isPrimary: true,
				})
				.onConflictDoUpdate({
					target: [booksAuthors.bookId, booksAuthors.foreignAuthorId],
					set: {
						authorId: localAuthorId,
						authorName: localAuthor.name,
						isPrimary: true,
					},
				})
				.run();
		}
	}
}

/**
 * Sync booksAuthors entries for an existing book from fresh Hardcover contributions.
 * Upserts all author-role contributors. Handles upgrade for matching local authors.
 */
function syncBookAuthors(
	tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
	bookId: number,
	contributions: ContributionEntry[],
	primaryForeignAuthorId: number,
	localAuthorId: number,
): void {
	const authorContribs = deriveAuthorContributions(contributions);
	let primaryFound = false;

	for (const contrib of authorContribs) {
		const isThePrimary =
			contrib.foreignAuthorId === String(primaryForeignAuthorId);
		if (isThePrimary) {
			primaryFound = true;
		}

		// Check if there's already an entry — if so, update; if not, insert
		const existing = tx
			.select({ id: booksAuthors.id, authorId: booksAuthors.authorId })
			.from(booksAuthors)
			.where(
				and(
					eq(booksAuthors.bookId, bookId),
					eq(booksAuthors.foreignAuthorId, contrib.foreignAuthorId),
				),
			)
			.get();

		if (existing) {
			// Preserve existing authorId if already linked, but upgrade if we're the primary
			tx.update(booksAuthors)
				.set({
					authorName: contrib.name,
					isPrimary: isThePrimary,
					...(isThePrimary ? { authorId: localAuthorId } : {}),
				})
				.where(eq(booksAuthors.id, existing.id))
				.run();
		} else {
			tx.insert(booksAuthors)
				.values({
					bookId,
					authorId: isThePrimary ? localAuthorId : null,
					foreignAuthorId: contrib.foreignAuthorId,
					authorName: contrib.name,
					isPrimary: isThePrimary,
				})
				.run();
		}
	}

	// Fallback: if the importing author wasn't in the (possibly truncated) contributions,
	// ensure they still get a booksAuthors entry.
	if (!primaryFound && localAuthorId > 0) {
		const existing = tx
			.select({ id: booksAuthors.id })
			.from(booksAuthors)
			.where(
				and(
					eq(booksAuthors.bookId, bookId),
					eq(booksAuthors.foreignAuthorId, String(primaryForeignAuthorId)),
				),
			)
			.get();

		if (!existing) {
			const localAuthor = tx
				.select({ name: authors.name })
				.from(authors)
				.where(eq(authors.id, localAuthorId))
				.get();
			if (localAuthor) {
				tx.insert(booksAuthors)
					.values({
						bookId,
						authorId: localAuthorId,
						foreignAuthorId: String(primaryForeignAuthorId),
						authorName: localAuthor.name,
						isPrimary: true,
					})
					.run();
			}
		}
	}
}

/**
 * Ensure edition-profile links exist for a book across the given download profiles.
 * Picks the best edition per profile and inserts links if missing.
 */
export function ensureEditionProfileLinks(
	bookId: number,
	downloadProfileIds: number[],
): void {
	if (downloadProfileIds.length === 0) {
		return;
	}

	const bookEditions = db
		.select()
		.from(editions)
		.where(eq(editions.bookId, bookId))
		.all();
	if (bookEditions.length === 0) {
		return;
	}

	const profiles = db
		.select()
		.from(downloadProfiles)
		.where(inArray(downloadProfiles.id, downloadProfileIds))
		.all();

	for (const profile of profiles) {
		const bestEdition = pickBestEditionForProfile(bookEditions, {
			...profile,
			contentType: profile.contentType as "ebook" | "audiobook",
		});
		if (bestEdition) {
			db.insert(editionDownloadProfiles)
				.values({
					editionId: bestEdition.id,
					downloadProfileId: profile.id,
				})
				.onConflictDoNothing()
				.run();
		}
	}
}

// ---------- Zod schemas ----------

const monitorOptionEnum = z
	.enum(["all", "future", "missing", "existing", "first", "latest", "none"])
	.default("all");

const importAuthorSchema = z.object({
	foreignAuthorId: z.number().int().positive(),
	downloadProfileIds: z.array(z.number().int().positive()).default([]),
	monitorOption: monitorOptionEnum,
	monitorNewBooks: z.enum(["all", "none", "new"]).default("all"),
	searchOnAdd: z.boolean().default(false),
});

const importBookSchema = z.object({
	foreignBookId: z.number().int().positive(),
	downloadProfileIds: z.array(z.number().int().positive()).default([]),
	monitorOption: monitorOptionEnum,
	monitorNewBooks: z.enum(["all", "none", "new"]).default("all"),
	searchOnAdd: z.boolean().default(false),
	monitorSeries: z.boolean().default(false),
});

const refreshAuthorSchema = z.object({
	authorId: z.number().int().positive(),
});

const refreshBookSchema = z.object({
	bookId: z.number().int().positive(),
});

// ---------- Import Author (internal) ----------

/**
 * Core import logic shared between the public server function and cascade imports.
 * Callers must handle auth themselves.
 */
export async function importAuthorInternal(
	data: {
		foreignAuthorId: number;
		downloadProfileIds: number[];
		monitorOption?:
			| "all"
			| "future"
			| "missing"
			| "existing"
			| "first"
			| "latest"
			| "none";
		monitorNewBooks?: "all" | "none" | "new";
	},
	updateProgress: (message: string) => void = () => {},
	setTitle: (title: string) => void = () => {},
): Promise<{
	authorId: number;
	authorName: string;
	booksAdded: number;
	editionsAdded: number;
}> {
	// Duplicate guard — allow upgrading stub authors
	const existing = db
		.select({ id: authors.id, isStub: authors.isStub })
		.from(authors)
		.where(eq(authors.foreignAuthorId, String(data.foreignAuthorId)))
		.get();
	if (existing && !existing.isStub) {
		throw new Error("Author is already on your bookshelf.");
	}

	// ── Server-side fetch ──
	const { author: rawAuthor, books: rawBooks } = await fetchAuthorComplete(
		data.foreignAuthorId,
	);
	setTitle(rawAuthor.name);

	updateProgress(`Fetching editions for ${rawBooks.length} books...`);

	// Fetch editions only for author's own books
	const authorBookIds = rawBooks.map((b) => b.id);
	const editionsMap = await fetchBatchedEditions(authorBookIds);

	// ── DB transaction ──
	return db.transaction((tx) => {
		const now = new Date();

		// Double-check inside transaction to prevent race conditions
		const existingInTx = tx
			.select({ id: authors.id, isStub: authors.isStub })
			.from(authors)
			.where(eq(authors.foreignAuthorId, String(data.foreignAuthorId)))
			.get();
		if (existingInTx && !existingInTx.isStub) {
			throw new Error("Author is already on your bookshelf.");
		}

		let author: { id: number; name: string };

		if (existingInTx) {
			// Upgrade stub author to full author
			tx.update(authors)
				.set({
					name: rawAuthor.name,
					sortName: deriveSortName(rawAuthor.name),
					slug: rawAuthor.slug,
					bio: rawAuthor.bio,
					bornYear: rawAuthor.bornYear,
					deathYear: rawAuthor.deathYear,
					status: rawAuthor.deathYear ? "deceased" : "continuing",
					isStub: false,
					monitored: data.monitorOption !== "none",
					images: toImageArray(rawAuthor.imageUrl),
					metadataUpdatedAt: now,
					updatedAt: now,
				})
				.where(eq(authors.id, existingInTx.id))
				.run();
			author = { id: existingInTx.id, name: rawAuthor.name };

			// Insert download profile join rows
			if (data.monitorOption !== "none") {
				for (const profileId of data.downloadProfileIds) {
					tx.insert(authorDownloadProfiles)
						.values({ authorId: author.id, downloadProfileId: profileId })
						.onConflictDoNothing()
						.run();
				}
			}
		} else {
			// Insert new author
			author = tx
				.insert(authors)
				.values({
					name: rawAuthor.name,
					sortName: deriveSortName(rawAuthor.name),
					slug: rawAuthor.slug,
					bio: rawAuthor.bio,
					bornYear: rawAuthor.bornYear,
					deathYear: rawAuthor.deathYear,
					status: rawAuthor.deathYear ? "deceased" : "continuing",
					isStub: false,
					monitored: data.monitorOption !== "none",
					foreignAuthorId: String(data.foreignAuthorId),
					images: toImageArray(rawAuthor.imageUrl),
					metadataUpdatedAt: now,
				})
				.returning()
				.get();

			// Insert download profile join rows
			if (data.monitorOption !== "none") {
				for (const profileId of data.downloadProfileIds) {
					tx.insert(authorDownloadProfiles)
						.values({ authorId: author.id, downloadProfileId: profileId })
						.run();
				}
			}

			tx.insert(history)
				.values({
					eventType: "authorAdded",
					authorId: author.id,
					data: { name: author.name, source: "hardcover" },
				})
				.run();
		}

		// Upgrade: set authorId on any existing booksAuthors entries matching this author's foreignAuthorId
		tx.update(booksAuthors)
			.set({ authorId: author.id })
			.where(
				and(
					eq(booksAuthors.foreignAuthorId, String(data.foreignAuthorId)),
					eq(booksAuthors.authorId, null as unknown as number),
				),
			)
			.run();

		// Cache: foreignSeriesId → local series id
		const seriesCache = new Map<number, number>();

		// Helper: ensure series exists
		function ensureSeries(
			foreignId: number,
			title: string,
			slug: string | null,
			isCompleted: boolean | null,
		): number {
			const cached = seriesCache.get(foreignId);
			if (cached !== undefined) {
				return cached;
			}

			const existing = tx
				.select({ id: series.id })
				.from(series)
				.where(eq(series.foreignSeriesId, String(foreignId)))
				.get();
			if (existing) {
				seriesCache.set(foreignId, existing.id);
				return existing.id;
			}

			const newSeries = tx
				.insert(series)
				.values({
					title,
					slug,
					foreignSeriesId: String(foreignId),
					isCompleted,
					metadataUpdatedAt: now,
				})
				.returning()
				.get();
			seriesCache.set(foreignId, newSeries.id);
			return newSeries.id;
		}

		// Load metadata profile for filtering
		const metadataProfile = getMetadataProfile();
		const profileLanguages = getProfileLanguages();

		// Set monitorNewBooks on the author (force "none" when monitorOption is "none")
		const effectiveMonitorNewBooks =
			data.monitorOption === "none" ? "none" : data.monitorNewBooks;
		if (effectiveMonitorNewBooks) {
			tx.update(authors)
				.set({ monitorNewBooks: effectiveMonitorNewBooks })
				.where(eq(authors.id, author.id))
				.run();
		}

		// Track newly-added books for monitor option filtering
		const newlyAddedBooks: Array<{ id: number; releaseDate: string | null }> =
			[];

		// Insert all author books
		let booksAdded = 0;
		let editionsAdded = 0;
		for (const [index, rawBook] of rawBooks.entries()) {
			updateProgress(
				`Importing book ${index + 1} of ${rawBooks.length}: ${rawBook.title}`,
			);
			// Check if book already in DB
			const existingBook = tx
				.select({ id: books.id })
				.from(books)
				.where(eq(books.foreignBookId, String(rawBook.id)))
				.get();
			if (existingBook) {
				// Book exists — upgrade: ensure this author has a booksAuthors entry
				syncBookAuthors(
					tx,
					existingBook.id,
					rawBook.contributions,
					data.foreignAuthorId,
					author.id,
				);
				continue;
			}

			// Skip partial editions (books that are splits of a canonical book)
			if (rawBook.canonicalId !== null) {
				continue;
			}

			// Filter editions by metadata profile
			const rawEditions = editionsMap.get(rawBook.id) ?? [];
			const filteredEditions = filterEditionsByProfile(
				rawEditions,
				metadataProfile,
				profileLanguages,
				rawBook.defaultCoverEditionId,
			);

			// Check if book should be skipped
			if (
				shouldSkipBook(
					rawBook,
					filteredEditions,
					metadataProfile,
					profileLanguages,
				)
			) {
				continue;
			}

			const book = tx
				.insert(books)
				.values({
					title: rawBook.title,
					slug: rawBook.slug,
					description: rawBook.description,
					releaseDate: rawBook.releaseDate,
					releaseYear: rawBook.releaseYear,
					foreignBookId: String(rawBook.id),
					images: toImageArray(rawBook.coverUrl),
					rating: rawBook.rating,
					ratingsCount: rawBook.ratingsCount,
					usersCount: rawBook.usersCount,
					metadataUpdatedAt: now,
				})
				.returning()
				.get();

			// Insert booksAuthors entries for all author-role contributors
			insertBookAuthors(
				tx,
				book.id,
				rawBook.contributions,
				data.foreignAuthorId,
				author.id,
			);

			booksAdded += 1;

			// Series links
			for (const s of rawBook.series ?? []) {
				const localSeriesId = ensureSeries(
					s.seriesId,
					s.seriesTitle,
					s.seriesSlug,
					s.isCompleted,
				);
				tx.insert(seriesBookLinks)
					.values({
						seriesId: localSeriesId,
						bookId: book.id,
						position: s.position,
					})
					.run();
			}

			// Editions (use filtered set)
			for (const ed of filteredEditions) {
				tx.insert(editions)
					.values({
						bookId: book.id,
						title: ed.title,
						isbn10: ed.isbn10,
						isbn13: ed.isbn13,
						asin: ed.asin,
						format: ed.format,
						pageCount: ed.pageCount,
						audioLength: ed.audioLength,
						publisher: ed.publisher,
						editionInformation: ed.editionInformation,
						releaseDate: ed.releaseDate,
						language: ed.language,
						languageCode: ed.languageCode,
						country: ed.country,
						usersCount: ed.usersCount,
						score: ed.score,
						foreignEditionId: String(ed.id),
						images: toImageArray(ed.coverUrl),
						contributors: ed.contributors,
						isDefaultCover: ed.id === rawBook.defaultCoverEditionId,
						metadataUpdatedAt: now,
					})
					.run();
			}
			editionsAdded += filteredEditions.length;

			// History event
			tx.insert(history)
				.values({
					eventType: "bookAdded",
					bookId: book.id,
					authorId: author.id,
					data: { title: rawBook.title, source: "hardcover" },
				})
				.run();

			newlyAddedBooks.push({
				id: book.id,
				releaseDate: rawBook.releaseDate,
			});
		}

		// ── Apply monitorOption: create edition-profile links for monitored books ──
		const monitorOption = data.monitorOption;
		if (
			monitorOption !== "none" &&
			data.downloadProfileIds.length > 0 &&
			newlyAddedBooks.length > 0
		) {
			// Determine which books should be monitored
			let monitoredBookIds: number[];
			const today = new Date().toISOString().slice(0, 10);

			switch (monitorOption) {
				case "all":
				case "missing": {
					// All books (at import time all are missing)
					monitoredBookIds = newlyAddedBooks.map((b) => b.id);
					break;
				}
				case "future": {
					monitoredBookIds = newlyAddedBooks
						.filter((b) => b.releaseDate && b.releaseDate > today)
						.map((b) => b.id);
					break;
				}
				case "existing": {
					// At import time none have files — same as "none"
					monitoredBookIds = [];
					break;
				}
				case "first": {
					const sorted = [...newlyAddedBooks].toSorted((a, b) =>
						(a.releaseDate ?? "9999") < (b.releaseDate ?? "9999") ? -1 : 1,
					);
					monitoredBookIds = sorted.length > 0 ? [sorted[0].id] : [];
					break;
				}
				case "latest": {
					const sorted = [...newlyAddedBooks].toSorted((a, b) =>
						(a.releaseDate ?? "") > (b.releaseDate ?? "") ? -1 : 1,
					);
					monitoredBookIds = sorted.length > 0 ? [sorted[0].id] : [];
					break;
				}
				default: {
					monitoredBookIds = [];
				}
			}

			// Load download profiles and create edition-profile links
			const profiles = tx
				.select()
				.from(downloadProfiles)
				.where(inArray(downloadProfiles.id, data.downloadProfileIds))
				.all();

			for (const bookId of monitoredBookIds) {
				const bookEditions = tx
					.select()
					.from(editions)
					.where(eq(editions.bookId, bookId))
					.all();

				for (const profile of profiles) {
					const bestEdition = pickBestEditionForProfile(bookEditions, {
						...profile,
						contentType: profile.contentType as "ebook" | "audiobook",
					});
					if (bestEdition) {
						tx.insert(editionDownloadProfiles)
							.values({
								editionId: bestEdition.id,
								downloadProfileId: profile.id,
							})
							.onConflictDoNothing()
							.run();
					}
				}
			}
		}

		return {
			authorId: author.id,
			authorName: rawAuthor.name,
			booksAdded,
			editionsAdded,
		};
	});
}

// ---------- Import Author ----------

const importAuthorHandler: CommandHandler = async (
	body,
	updateProgress,
	setTitle,
) => {
	const data = body as z.infer<typeof importAuthorSchema>;
	updateProgress("Fetching author details from Hardcover...");
	const result = await importAuthorInternal(data, updateProgress, setTitle);

	if (data.searchOnAdd && data.monitorOption !== "none") {
		updateProgress("Searching for available releases...");
		void searchForAuthorBooks(result.authorId).catch((error) =>
			logError("import", "Search after import failed", error),
		);
	}

	return result;
};

export const importHardcoverAuthorFn = createServerFn({ method: "POST" })
	.inputValidator((d: unknown) => importAuthorSchema.parse(d))
	.handler(async ({ data }) => {
		await requireAdmin();
		return submitCommand({
			commandType: "importAuthor",
			name: `Import author: Hardcover #${data.foreignAuthorId}`,
			body: data as unknown as Record<string, unknown>,
			dedupeKey: "foreignAuthorId",
			handler: importAuthorHandler,
		});
	});

// ---------- Import Single Book ----------

const importBookHandler: CommandHandler = async (
	body,
	updateProgress,
	setTitle,
) => {
	const data = body as z.infer<typeof importBookSchema>;

	// Duplicate guard
	const existing = db
		.select({ id: books.id })
		.from(books)
		.where(eq(books.foreignBookId, String(data.foreignBookId)))
		.get();
	if (existing) {
		throw new Error("Book is already on your bookshelf.");
	}

	// Fetch book complete (book + editions + contributions)
	updateProgress("Fetching book metadata from Hardcover...");
	const result = await fetchBookComplete(data.foreignBookId);
	if (!result) {
		throw new Error("Book not found on Hardcover.");
	}

	const { book: rawBook, editions: rawEditions } = result;
	setTitle(rawBook.title);
	const now = new Date();

	// Determine primary author from contributions
	const primaryContrib = rawBook.contributions.find(
		(c) => c.contribution === null,
	);
	if (!primaryContrib) {
		throw new Error("Could not determine the author of this book.");
	}

	// Import the primary author (full import, not a stub) before the book transaction.
	// importAuthorInternal handles dedup: skips if already fully imported, upgrades stubs.
	updateProgress("Importing primary author...");
	let primaryAuthorImported = false;
	try {
		await importAuthorInternal({
			foreignAuthorId: primaryContrib.authorId,
			downloadProfileIds: data.downloadProfileIds,
			monitorOption: data.monitorOption,
			monitorNewBooks: data.monitorNewBooks,
		});
		primaryAuthorImported = true;
	} catch {
		// Author already exists as a full author — that's fine
	}

	// Look up the primary author's local ID (must exist now)
	const primaryAuthor = db
		.select({ id: authors.id })
		.from(authors)
		.where(eq(authors.foreignAuthorId, String(primaryContrib.authorId)))
		.get();
	if (!primaryAuthor) {
		throw new Error("Failed to import the primary author.");
	}
	const primaryAuthorId = primaryAuthor.id;

	// The book may have already been imported as part of the primary author's import.
	// If so, just mark it as monitored.
	const alreadyImported = db
		.select({ id: books.id })
		.from(books)
		.where(eq(books.foreignBookId, String(data.foreignBookId)))
		.get();

	if (alreadyImported) {
		db.update(books)
			.set({ updatedAt: now })
			.where(eq(books.id, alreadyImported.id))
			.run();

		// The selected book is always monitored — ensure edition-profile links
		ensureEditionProfileLinks(alreadyImported.id, data.downloadProfileIds);

		// Still cascade-import co-authors
		const coAuthorContribs = deriveAuthorContributions(
			rawBook.contributions,
		).filter((c) => c.foreignAuthorId !== String(primaryContrib.authorId));
		let additionalAuthorsImported = primaryAuthorImported ? 1 : 0;
		for (const [index, coAuthor] of coAuthorContribs.entries()) {
			updateProgress(
				`Importing co-author ${index + 1} of ${coAuthorContribs.length}: ${coAuthor.name}`,
			);
			try {
				await importAuthorInternal({
					foreignAuthorId: Number(coAuthor.foreignAuthorId),
					downloadProfileIds: data.downloadProfileIds,
				});
				additionalAuthorsImported += 1;
			} catch {
				// Best-effort
			}
		}

		if (data.searchOnAdd) {
			void searchForBook(alreadyImported.id).catch((error) =>
				logError("import", "Search after import failed", error),
			);
		}

		if (data.monitorSeries) {
			const bookSeriesLinks = db
				.select({ seriesId: seriesBookLinks.seriesId })
				.from(seriesBookLinks)
				.where(eq(seriesBookLinks.bookId, alreadyImported.id))
				.all();

			for (const link of bookSeriesLinks) {
				db.update(series)
					.set({ monitored: true, updatedAt: new Date() })
					.where(eq(series.id, link.seriesId))
					.run();

				const existingProfiles = db
					.select()
					.from(seriesDownloadProfiles)
					.where(eq(seriesDownloadProfiles.seriesId, link.seriesId))
					.all();

				if (existingProfiles.length === 0) {
					for (const profileId of data.downloadProfileIds) {
						db.insert(seriesDownloadProfiles)
							.values({
								seriesId: link.seriesId,
								downloadProfileId: profileId,
							})
							.onConflictDoNothing()
							.run();
					}
				}

				void refreshSeriesInternal(link.seriesId).catch((error) =>
					logError("import", "Series refresh after book add failed", error),
				);
			}
		}

		return {
			bookId: alreadyImported.id,
			authorId: primaryAuthorId,
			additionalAuthorsImported,
		};
	}

	// Filter editions by metadata profile (book was explicitly chosen, so we don't skip it)
	updateProgress("Creating book and editions...");
	const metadataProfile = getMetadataProfile();
	const profileLanguages = getProfileLanguages();
	const filteredEditions = filterEditionsByProfile(
		rawEditions,
		metadataProfile,
		profileLanguages,
		rawBook.defaultCoverEditionId,
	);

	const txResult = db.transaction((tx) => {
		// Insert book (editions use schema default monitored=true for user-imported books)
		const book = tx
			.insert(books)
			.values({
				title: rawBook.title,
				slug: rawBook.slug,
				description: rawBook.description,
				releaseDate: rawBook.releaseDate,
				releaseYear: rawBook.releaseYear,
				foreignBookId: String(rawBook.id),
				images: toImageArray(rawBook.coverUrl),
				rating: rawBook.rating,
				ratingsCount: rawBook.ratingsCount,
				usersCount: rawBook.usersCount,
				metadataUpdatedAt: now,
			})
			.returning()
			.get();

		// Insert booksAuthors entries for all author-role contributors
		insertBookAuthors(
			tx,
			book.id,
			rawBook.contributions,
			primaryContrib.authorId,
			primaryAuthorId,
		);

		// Series links
		for (const s of rawBook.series) {
			const existingSeries = tx
				.select({ id: series.id })
				.from(series)
				.where(eq(series.foreignSeriesId, String(s.seriesId)))
				.get();

			let localSeriesId: number;
			if (existingSeries) {
				localSeriesId = existingSeries.id;
			} else {
				const newSeries = tx
					.insert(series)
					.values({
						title: s.seriesTitle,
						slug: s.seriesSlug,
						foreignSeriesId: String(s.seriesId),
						isCompleted: s.isCompleted,
						metadataUpdatedAt: now,
					})
					.returning()
					.get();
				localSeriesId = newSeries.id;
			}

			tx.insert(seriesBookLinks)
				.values({
					seriesId: localSeriesId,
					bookId: book.id,
					position: s.position,
				})
				.run();
		}

		// Editions (filtered by metadata profile)
		for (const ed of filteredEditions) {
			tx.insert(editions)
				.values({
					bookId: book.id,
					title: ed.title,
					isbn10: ed.isbn10,
					isbn13: ed.isbn13,
					asin: ed.asin,
					format: ed.format,
					pageCount: ed.pageCount,
					audioLength: ed.audioLength,
					publisher: ed.publisher,
					editionInformation: ed.editionInformation,
					releaseDate: ed.releaseDate,
					language: ed.language,
					languageCode: ed.languageCode,
					country: ed.country,
					usersCount: ed.usersCount,
					score: ed.score,
					foreignEditionId: String(ed.id),
					images: toImageArray(ed.coverUrl),
					contributors: ed.contributors,
					isDefaultCover: ed.id === rawBook.defaultCoverEditionId,
					metadataUpdatedAt: now,
				})
				.run();
		}

		tx.insert(history)
			.values({
				eventType: "bookAdded",
				bookId: book.id,
				authorId: primaryAuthorId,
				data: { title: book.title, source: "hardcover" },
			})
			.run();

		return { bookId: book.id };
	});

	// The selected book is always monitored — ensure edition-profile links
	ensureEditionProfileLinks(txResult.bookId, data.downloadProfileIds);

	// Set monitorNewBooks on the primary author if it was newly created
	if (primaryAuthorImported) {
		db.update(authors)
			.set({ monitorNewBooks: data.monitorNewBooks })
			.where(eq(authors.id, primaryAuthorId))
			.run();
	}

	// Cascade import co-authors sequentially (best-effort)
	const coAuthorContribs = deriveAuthorContributions(
		rawBook.contributions,
	).filter((c) => c.foreignAuthorId !== String(primaryContrib.authorId));
	let additionalAuthorsImported = primaryAuthorImported ? 1 : 0;
	for (const [index, coAuthor] of coAuthorContribs.entries()) {
		updateProgress(
			`Importing co-author ${index + 1} of ${coAuthorContribs.length}: ${coAuthor.name}`,
		);
		try {
			await importAuthorInternal({
				foreignAuthorId: Number(coAuthor.foreignAuthorId),
				downloadProfileIds: data.downloadProfileIds,
			});
			additionalAuthorsImported += 1;
		} catch {
			// Best-effort: book is already saved, author import failure is non-fatal
		}
	}

	if (data.searchOnAdd) {
		void searchForBook(txResult.bookId).catch((error) =>
			logError("import", "Search after import failed", error),
		);
	}

	if (data.monitorSeries) {
		const bookSeriesLinks = db
			.select({ seriesId: seriesBookLinks.seriesId })
			.from(seriesBookLinks)
			.where(eq(seriesBookLinks.bookId, txResult.bookId))
			.all();

		for (const link of bookSeriesLinks) {
			db.update(series)
				.set({ monitored: true, updatedAt: new Date() })
				.where(eq(series.id, link.seriesId))
				.run();

			const existingProfiles = db
				.select()
				.from(seriesDownloadProfiles)
				.where(eq(seriesDownloadProfiles.seriesId, link.seriesId))
				.all();

			if (existingProfiles.length === 0) {
				for (const profileId of data.downloadProfileIds) {
					db.insert(seriesDownloadProfiles)
						.values({
							seriesId: link.seriesId,
							downloadProfileId: profileId,
						})
						.onConflictDoNothing()
						.run();
				}
			}

			void refreshSeriesInternal(link.seriesId).catch((error) =>
				logError("import", "Series refresh after book add failed", error),
			);
		}
	}

	return {
		bookId: txResult.bookId,
		authorId: primaryAuthorId,
		additionalAuthorsImported,
	};
};

export const importHardcoverBookFn = createServerFn({ method: "POST" })
	.inputValidator((d: unknown) => importBookSchema.parse(d))
	.handler(async ({ data }) => {
		await requireAdmin();
		return submitCommand({
			commandType: "importBook",
			name: `Import book: Hardcover #${data.foreignBookId}`,
			body: data as unknown as Record<string, unknown>,
			dedupeKey: "foreignBookId",
			handler: importBookHandler,
		});
	});

// ---------- Refresh Author Metadata ----------

export async function refreshAuthorInternal(
	authorId: number,
	updateProgress: (message: string) => void = () => {},
): Promise<{
	booksUpdated: number;
	booksAdded: number;
	editionsUpdated: number;
	editionsAdded: number;
}> {
	const localAuthor = db
		.select()
		.from(authors)
		.where(eq(authors.id, authorId))
		.get();
	if (!localAuthor) {
		throw new Error("Author not found.");
	}
	if (!localAuthor.foreignAuthorId) {
		throw new Error("Author has no Hardcover ID.");
	}

	const foreignAuthorId = Number(localAuthor.foreignAuthorId);

	// Fetch fresh data from Hardcover
	const { author: rawAuthor, books: rawBooks } =
		await fetchAuthorComplete(foreignAuthorId);

	// Fetch editions only for author's own books
	const authorBookIds = rawBooks.map((b) => b.id);
	updateProgress("Fetching editions...");
	const editionsMap = await fetchBatchedEditions(authorBookIds);

	const now = new Date();
	const metadataProfile = getMetadataProfile();
	const profileLanguages = getProfileLanguages();
	const authorProfileIds =
		localAuthor.monitorNewBooks === "all" ||
		localAuthor.monitorNewBooks === "new"
			? db
					.select({
						downloadProfileId: authorDownloadProfiles.downloadProfileId,
					})
					.from(authorDownloadProfiles)
					.where(eq(authorDownloadProfiles.authorId, authorId))
					.all()
					.map((link) => link.downloadProfileId)
			: [];
	const newBookIds: number[] = [];

	const result = db.transaction((tx) => {
		// Update author fields
		tx.update(authors)
			.set({
				name: rawAuthor.name,
				sortName: deriveSortName(rawAuthor.name),
				slug: rawAuthor.slug,
				bio: rawAuthor.bio,
				bornYear: rawAuthor.bornYear,
				deathYear: rawAuthor.deathYear,
				status: rawAuthor.deathYear ? "deceased" : "continuing",
				images: toImageArray(rawAuthor.imageUrl),
				metadataUpdatedAt: now,
				metadataSourceMissingSince: null,
				updatedAt: now,
			})
			.where(eq(authors.id, authorId))
			.run();

		// Load excluded book IDs to skip during import
		const excludedBookIds = new Set(
			tx
				.select({ foreignBookId: bookImportListExclusions.foreignBookId })
				.from(bookImportListExclusions)
				.all()
				.map((r) => r.foreignBookId),
		);

		let booksUpdated = 0;
		let booksAdded = 0;
		let editionsUpdated = 0;
		let editionsAdded = 0;

		const seenForeignBookIds = new Set<string>();

		for (const [index, rawBook] of rawBooks.entries()) {
			updateProgress(
				`Refreshing book ${index + 1} of ${rawBooks.length}: ${rawBook.title}`,
			);
			const foreignBookId = String(rawBook.id);
			seenForeignBookIds.add(foreignBookId);

			// Skip partial editions (books that are splits of a canonical book)
			if (rawBook.canonicalId !== null) {
				continue;
			}

			const existingBook = tx
				.select({ id: books.id })
				.from(books)
				.where(eq(books.foreignBookId, foreignBookId))
				.get();

			if (existingBook) {
				// Check if the existing book should now be filtered out
				const allEditions = editionsMap.get(rawBook.id) ?? [];
				const filteredEditions = filterEditionsByProfile(
					allEditions,
					metadataProfile,
					profileLanguages,
					rawBook.defaultCoverEditionId,
				);
				if (
					shouldSkipBook(
						rawBook,
						filteredEditions,
						metadataProfile,
						profileLanguages,
					)
				) {
					// Book no longer passes filters — remove if safe
					const hasProfileLink = tx
						.select({ id: editionDownloadProfiles.id })
						.from(editionDownloadProfiles)
						.innerJoin(
							editions,
							eq(editions.id, editionDownloadProfiles.editionId),
						)
						.where(eq(editions.bookId, existingBook.id))
						.limit(1)
						.get();
					const fileCount = tx
						.select({ count: sql<number>`count(*)` })
						.from(bookFiles)
						.where(eq(bookFiles.bookId, existingBook.id))
						.get();

					if (!hasProfileLink && (fileCount?.count ?? 0) === 0) {
						tx.delete(books).where(eq(books.id, existingBook.id)).run();
						tx.insert(history)
							.values({
								eventType: "bookDeleted",
								authorId: authorId,
								data: {
									title: rawBook.title,
									reason: "metadata_profile_filtered",
								},
							})
							.run();
					}
					continue;
				}

				// Update existing book
				tx.update(books)
					.set({
						title: rawBook.title,
						slug: rawBook.slug,
						description: rawBook.description,
						releaseDate: rawBook.releaseDate,
						releaseYear: rawBook.releaseYear,
						images: toImageArray(rawBook.coverUrl),
						rating: rawBook.rating,
						ratingsCount: rawBook.ratingsCount,
						usersCount: rawBook.usersCount,
						metadataUpdatedAt: now,
						metadataSourceMissingSince: null,
						updatedAt: now,
					})
					.where(eq(books.id, existingBook.id))
					.run();
				booksUpdated += 1;

				// Sync booksAuthors entries
				syncBookAuthors(
					tx,
					existingBook.id,
					rawBook.contributions,
					foreignAuthorId,
					authorId,
				);

				// Upsert editions for this book (filter new editions by metadata profile)
				const bookEditions = editionsMap.get(rawBook.id) ?? [];
				const filteredForNew = filterEditionsByProfile(
					bookEditions,
					metadataProfile,
					profileLanguages,
					rawBook.defaultCoverEditionId,
				);
				const filteredIds = new Set(filteredForNew.map((e) => e.id));
				const seenEditionIds = new Set<string>();
				for (const ed of bookEditions) {
					const foreignEditionId = String(ed.id);
					seenEditionIds.add(foreignEditionId);

					const existingEdition = tx
						.select({ id: editions.id })
						.from(editions)
						.where(eq(editions.foreignEditionId, foreignEditionId))
						.get();

					if (existingEdition) {
						if (!filteredIds.has(ed.id)) {
							// Existing edition no longer passes the profile filter — remove if safe
							const hasProfile = tx
								.select({ id: editionDownloadProfiles.id })
								.from(editionDownloadProfiles)
								.where(
									eq(editionDownloadProfiles.editionId, existingEdition.id),
								)
								.limit(1)
								.get();
							const fileCount = tx
								.select({ count: sql<number>`count(*)` })
								.from(bookFiles)
								.where(eq(bookFiles.bookId, existingBook.id))
								.get();

							if (!hasProfile && (fileCount?.count ?? 0) === 0) {
								tx.delete(editions)
									.where(eq(editions.id, existingEdition.id))
									.run();
							}
							continue;
						}

						// Update existing editions that pass the filter
						tx.update(editions)
							.set({
								title: ed.title,
								isbn10: ed.isbn10,
								isbn13: ed.isbn13,
								asin: ed.asin,
								format: ed.format,
								pageCount: ed.pageCount,
								audioLength: ed.audioLength,
								publisher: ed.publisher,
								editionInformation: ed.editionInformation,
								releaseDate: ed.releaseDate,
								language: ed.language,
								languageCode: ed.languageCode,
								country: ed.country,
								usersCount: ed.usersCount,
								score: ed.score,
								images: toImageArray(ed.coverUrl),
								contributors: ed.contributors,
								isDefaultCover: ed.id === rawBook.defaultCoverEditionId,
								metadataUpdatedAt: now,
								metadataSourceMissingSince: null,
							})
							.where(eq(editions.id, existingEdition.id))
							.run();
						editionsUpdated += 1;
					} else if (filteredIds.has(ed.id)) {
						// Only insert new editions that pass the profile filter
						tx.insert(editions)
							.values({
								bookId: existingBook.id,
								title: ed.title,
								isbn10: ed.isbn10,
								isbn13: ed.isbn13,
								asin: ed.asin,
								format: ed.format,
								pageCount: ed.pageCount,
								audioLength: ed.audioLength,
								publisher: ed.publisher,
								editionInformation: ed.editionInformation,
								releaseDate: ed.releaseDate,
								language: ed.language,
								languageCode: ed.languageCode,
								country: ed.country,
								usersCount: ed.usersCount,
								score: ed.score,
								foreignEditionId,
								images: toImageArray(ed.coverUrl),
								contributors: ed.contributors,
								isDefaultCover: ed.id === rawBook.defaultCoverEditionId,
								metadataUpdatedAt: now,
							})
							.run();
						editionsAdded += 1;
					}
				}

				// Orphan detection for editions
				const existingEditions = tx
					.select({
						id: editions.id,
						foreignEditionId: editions.foreignEditionId,
					})
					.from(editions)
					.where(eq(editions.bookId, existingBook.id))
					.all();

				for (const ed of existingEditions) {
					if (ed.foreignEditionId && !seenEditionIds.has(ed.foreignEditionId)) {
						// Check if edition has any download profile links
						const hasProfile = tx
							.select({ id: editionDownloadProfiles.id })
							.from(editionDownloadProfiles)
							.where(eq(editionDownloadProfiles.editionId, ed.id))
							.limit(1)
							.get();
						// Check if parent book has any files
						const fileCount = tx
							.select({
								count: sql<number>`count(*)`,
							})
							.from(bookFiles)
							.where(eq(bookFiles.bookId, existingBook.id))
							.get();

						if (!hasProfile && (fileCount?.count ?? 0) === 0) {
							// Safe to auto-delete
							tx.delete(editions).where(eq(editions.id, ed.id)).run();
						} else {
							// Stamp missing metadata
							tx.update(editions)
								.set({ metadataSourceMissingSince: now })
								.where(
									and(
										eq(editions.id, ed.id),
										eq(
											editions.metadataSourceMissingSince,
											null as unknown as Date,
										),
									),
								)
								.run();
						}
					}
				}
			} else {
				// Skip excluded books
				if (excludedBookIds.has(foreignBookId)) {
					continue;
				}

				// Insert new book — apply metadata profile filtering
				const rawEditions = editionsMap.get(rawBook.id) ?? [];
				const filteredNewEditions = filterEditionsByProfile(
					rawEditions,
					metadataProfile,
					profileLanguages,
					rawBook.defaultCoverEditionId,
				);

				// Skip book if it doesn't pass metadata profile filters
				if (
					shouldSkipBook(
						rawBook,
						filteredNewEditions,
						metadataProfile,
						profileLanguages,
					)
				) {
					continue;
				}

				const newBook = tx
					.insert(books)
					.values({
						title: rawBook.title,
						slug: rawBook.slug,
						description: rawBook.description,
						releaseDate: rawBook.releaseDate,
						releaseYear: rawBook.releaseYear,
						foreignBookId,
						images: toImageArray(rawBook.coverUrl),
						rating: rawBook.rating,
						ratingsCount: rawBook.ratingsCount,
						usersCount: rawBook.usersCount,
						metadataUpdatedAt: now,
					})
					.returning()
					.get();
				booksAdded += 1;
				newBookIds.push(newBook.id);

				// Insert booksAuthors entries
				insertBookAuthors(
					tx,
					newBook.id,
					rawBook.contributions,
					foreignAuthorId,
					authorId,
				);

				// Insert editions for new book (filtered)
				for (const ed of filteredNewEditions) {
					tx.insert(editions)
						.values({
							bookId: newBook.id,
							title: ed.title,
							isbn10: ed.isbn10,
							isbn13: ed.isbn13,
							asin: ed.asin,
							format: ed.format,
							pageCount: ed.pageCount,
							publisher: ed.publisher,
							editionInformation: ed.editionInformation,
							releaseDate: ed.releaseDate,
							language: ed.language,
							languageCode: ed.languageCode,
							country: ed.country,
							usersCount: ed.usersCount,
							score: ed.score,
							foreignEditionId: String(ed.id),
							images: toImageArray(ed.coverUrl),
							contributors: ed.contributors,
							isDefaultCover: ed.id === rawBook.defaultCoverEditionId,
							metadataUpdatedAt: now,
						})
						.run();
					editionsAdded += 1;
				}

				// Series links
				for (const s of rawBook.series) {
					const existingSeries = tx
						.select({ id: series.id })
						.from(series)
						.where(eq(series.foreignSeriesId, String(s.seriesId)))
						.get();

					let localSeriesId: number;
					if (existingSeries) {
						localSeriesId = existingSeries.id;
					} else {
						const newSeries = tx
							.insert(series)
							.values({
								title: s.seriesTitle,
								slug: s.seriesSlug,
								foreignSeriesId: String(s.seriesId),
								isCompleted: s.isCompleted,
								metadataUpdatedAt: now,
							})
							.returning()
							.get();
						localSeriesId = newSeries.id;
					}

					tx.insert(seriesBookLinks)
						.values({
							seriesId: localSeriesId,
							bookId: newBook.id,
							position: s.position,
						})
						.run();
				}

				tx.insert(history)
					.values({
						eventType: "bookAdded",
						bookId: newBook.id,
						authorId: authorId,
						data: { title: rawBook.title, source: "hardcover" },
					})
					.run();
			}
		}

		updateProgress("Checking for removed entries...");

		// Orphan detection for books — find books linked to this author via booksAuthors
		const authorBookEntries = tx
			.select({
				bookId: booksAuthors.bookId,
			})
			.from(booksAuthors)
			.where(eq(booksAuthors.authorId, authorId))
			.all();

		const authorBookIdsLocal = new Set(authorBookEntries.map((e) => e.bookId));
		for (const bookId of authorBookIdsLocal) {
			const bookRecord = tx
				.select({
					foreignBookId: books.foreignBookId,
					title: books.title,
				})
				.from(books)
				.where(eq(books.id, bookId))
				.get();

			if (
				bookRecord?.foreignBookId &&
				!seenForeignBookIds.has(bookRecord.foreignBookId)
			) {
				// Check if any edition has download profile links
				const hasProfileLink = tx
					.select({ id: editionDownloadProfiles.id })
					.from(editionDownloadProfiles)
					.innerJoin(
						editions,
						eq(editions.id, editionDownloadProfiles.editionId),
					)
					.where(eq(editions.bookId, bookId))
					.limit(1)
					.get();
				// Check if book has any files
				const fileCount = tx
					.select({
						count: sql<number>`count(*)`,
					})
					.from(bookFiles)
					.where(eq(bookFiles.bookId, bookId))
					.get();

				if (!hasProfileLink && (fileCount?.count ?? 0) === 0) {
					// Safe to auto-delete — cascade will remove editions
					tx.delete(books).where(eq(books.id, bookId)).run();
					tx.insert(history)
						.values({
							eventType: "bookDeleted",
							authorId: authorId,
							data: {
								title: bookRecord.title,
								reason: "metadata_source_removed",
							},
						})
						.run();
				} else {
					tx.update(books)
						.set({ metadataSourceMissingSince: now })
						.where(
							and(
								eq(books.id, bookId),
								eq(books.metadataSourceMissingSince, null as unknown as Date),
							),
						)
						.run();
				}
			}
		}

		return { booksUpdated, booksAdded, editionsUpdated, editionsAdded };
	});

	for (const newBookId of newBookIds) {
		ensureEditionProfileLinks(newBookId, authorProfileIds);
	}

	return result;
}

const refreshAuthorHandler: CommandHandler = async (
	body,
	updateProgress,
	setTitle,
) => {
	const data = body as { authorId: number };
	const authorRow = db
		.select({ name: authors.name })
		.from(authors)
		.where(eq(authors.id, data.authorId))
		.get();
	if (authorRow) {
		setTitle(authorRow.name);
	}
	updateProgress("Fetching fresh data from Hardcover...");
	const result = await refreshAuthorInternal(data.authorId, updateProgress);
	return result;
};

export const refreshAuthorMetadataFn = createServerFn({ method: "POST" })
	.inputValidator((d: unknown) => refreshAuthorSchema.parse(d))
	.handler(async ({ data }) => {
		await requireAdmin();
		return submitCommand({
			commandType: "refreshAuthor",
			name: `Refresh author: #${data.authorId}`,
			body: data as unknown as Record<string, unknown>,
			dedupeKey: "authorId",
			batchTaskId: "refresh-hardcover-metadata",
			handler: refreshAuthorHandler,
		});
	});

// ---------- Auto-switch edition helper ----------

/**
 * Re-evaluate the best edition for each download profile monitoring
 * a given book's editions. Only updates links when a better edition
 * is found (avoids unnecessary writes).
 */
function autoSwitchEditionsForBook(
	tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
	bookId: number,
): void {
	const currentEditions = tx
		.select()
		.from(editions)
		.where(eq(editions.bookId, bookId))
		.all();
	const editionIds = currentEditions.map((e) => e.id);
	if (editionIds.length === 0) {
		return;
	}

	// Find all profile links for this book's editions
	const profileLinks = tx
		.select({
			id: editionDownloadProfiles.id,
			editionId: editionDownloadProfiles.editionId,
			downloadProfileId: editionDownloadProfiles.downloadProfileId,
		})
		.from(editionDownloadProfiles)
		.where(inArray(editionDownloadProfiles.editionId, editionIds))
		.all();

	// Group by download profile to handle each once
	const profileIdSet = new Set(profileLinks.map((l) => l.downloadProfileId));

	for (const dpId of profileIdSet) {
		const profile = tx
			.select()
			.from(downloadProfiles)
			.where(eq(downloadProfiles.id, dpId))
			.get();
		if (!profile) {
			continue;
		}

		const bestEdition = pickBestEditionForProfile(currentEditions, {
			...profile,
			contentType: profile.contentType as "ebook" | "audiobook",
		});
		if (!bestEdition) {
			continue;
		}

		// Check if the current link already points to the best edition
		const currentLink = profileLinks.find((l) => l.downloadProfileId === dpId);
		if (currentLink && currentLink.editionId === bestEdition.id) {
			continue;
		}

		// Remove old links for this profile + book, then insert the new best
		tx.delete(editionDownloadProfiles)
			.where(
				and(
					inArray(editionDownloadProfiles.editionId, editionIds),
					eq(editionDownloadProfiles.downloadProfileId, dpId),
				),
			)
			.run();

		tx.insert(editionDownloadProfiles)
			.values({ editionId: bestEdition.id, downloadProfileId: dpId })
			.run();
	}
}

// ---------- Refresh Book Metadata ----------

export async function refreshBookInternal(
	bookId: number,
	updateProgress: (message: string) => void = () => {},
): Promise<{
	booksUpdated: number;
	booksAdded: number;
	editionsUpdated: number;
	editionsAdded: number;
}> {
	const localBook = db.select().from(books).where(eq(books.id, bookId)).get();
	if (!localBook) {
		throw new Error("Book not found.");
	}
	if (!localBook.foreignBookId) {
		throw new Error("Book has no Hardcover ID.");
	}

	const foreignBookId = Number(localBook.foreignBookId);
	const result = await fetchBookComplete(foreignBookId);
	if (!result) {
		// Book removed from Hardcover — auto-delete if safe, otherwise stamp
		const hasProfileLink = db
			.select({ id: editionDownloadProfiles.id })
			.from(editionDownloadProfiles)
			.innerJoin(editions, eq(editions.id, editionDownloadProfiles.editionId))
			.where(eq(editions.bookId, bookId))
			.limit(1)
			.get();
		const fileCount = db
			.select({ count: sql<number>`count(*)` })
			.from(bookFiles)
			.where(eq(bookFiles.bookId, bookId))
			.get();

		if (!hasProfileLink && (fileCount?.count ?? 0) === 0) {
			const bookRecord = db
				.select({ title: books.title })
				.from(books)
				.where(eq(books.id, bookId))
				.get();
			db.delete(books).where(eq(books.id, bookId)).run();
			db.insert(history)
				.values({
					eventType: "bookDeleted",
					data: {
						title: bookRecord?.title ?? "Unknown",
						reason: "metadata_source_removed",
					},
				})
				.run();
		} else {
			db.update(books)
				.set({ metadataSourceMissingSince: new Date() })
				.where(eq(books.id, bookId))
				.run();
		}
		return {
			booksUpdated: 0,
			booksAdded: 0,
			editionsUpdated: 0,
			editionsAdded: 0,
		};
	}

	const { book: rawBook, editions: rawEditions } = result;
	updateProgress("Updating book information...");
	const now = new Date();
	const metadataProfile = getMetadataProfile();
	const profileLanguages = getProfileLanguages();
	const filteredForNew = filterEditionsByProfile(
		rawEditions,
		metadataProfile,
		profileLanguages,
		rawBook.defaultCoverEditionId,
	);
	const filteredIds = new Set(filteredForNew.map((e) => e.id));

	// Look up the primary author from booksAuthors
	const primaryEntry = db
		.select({
			authorId: booksAuthors.authorId,
			foreignAuthorId: booksAuthors.foreignAuthorId,
		})
		.from(booksAuthors)
		.where(
			and(eq(booksAuthors.bookId, bookId), eq(booksAuthors.isPrimary, true)),
		)
		.get();

	return db.transaction((tx) => {
		// Update book
		tx.update(books)
			.set({
				title: rawBook.title,
				slug: rawBook.slug,
				description: rawBook.description,
				releaseDate: rawBook.releaseDate,
				releaseYear: rawBook.releaseYear,
				images: toImageArray(rawBook.coverUrl),
				rating: rawBook.rating,
				ratingsCount: rawBook.ratingsCount,
				usersCount: rawBook.usersCount,
				metadataUpdatedAt: now,
				metadataSourceMissingSince: null,
				updatedAt: now,
			})
			.where(eq(books.id, bookId))
			.run();

		// Sync booksAuthors from contributions
		if (primaryEntry) {
			syncBookAuthors(
				tx,
				bookId,
				rawBook.contributions,
				Number(primaryEntry.foreignAuthorId),
				primaryEntry.authorId ?? 0,
			);
		}

		// Upsert editions (filter new editions by metadata profile)
		let editionsUpdated = 0;
		let editionsAdded = 0;
		const seenEditionIds = new Set<string>();

		for (const [index, ed] of rawEditions.entries()) {
			updateProgress(
				`Processing edition ${index + 1} of ${rawEditions.length}: ${ed.title}`,
			);
			const foreignEditionId = String(ed.id);
			seenEditionIds.add(foreignEditionId);

			const existingEdition = tx
				.select({ id: editions.id })
				.from(editions)
				.where(eq(editions.foreignEditionId, foreignEditionId))
				.get();

			if (existingEdition) {
				if (!filteredIds.has(ed.id)) {
					// Existing edition no longer passes the profile filter — remove if safe
					const hasProfile = tx
						.select({ id: editionDownloadProfiles.id })
						.from(editionDownloadProfiles)
						.where(eq(editionDownloadProfiles.editionId, existingEdition.id))
						.limit(1)
						.get();
					const fileCount = tx
						.select({ count: sql<number>`count(*)` })
						.from(bookFiles)
						.where(eq(bookFiles.bookId, bookId))
						.get();

					if (!hasProfile && (fileCount?.count ?? 0) === 0) {
						tx.delete(editions)
							.where(eq(editions.id, existingEdition.id))
							.run();
					}
					// Skip updating editions that don't pass the filter
					continue;
				}

				// Update existing editions that pass the filter
				tx.update(editions)
					.set({
						title: ed.title,
						isbn10: ed.isbn10,
						isbn13: ed.isbn13,
						asin: ed.asin,
						format: ed.format,
						pageCount: ed.pageCount,
						audioLength: ed.audioLength,
						publisher: ed.publisher,
						editionInformation: ed.editionInformation,
						releaseDate: ed.releaseDate,
						language: ed.language,
						languageCode: ed.languageCode,
						country: ed.country,
						usersCount: ed.usersCount,
						score: ed.score,
						images: toImageArray(ed.coverUrl),
						contributors: ed.contributors,
						isDefaultCover: ed.id === rawBook.defaultCoverEditionId,
						metadataUpdatedAt: now,
						metadataSourceMissingSince: null,
					})
					.where(eq(editions.id, existingEdition.id))
					.run();
				editionsUpdated += 1;
			} else if (filteredIds.has(ed.id)) {
				// Only insert new editions that pass the language filter
				tx.insert(editions)
					.values({
						bookId: bookId,
						title: ed.title,
						isbn10: ed.isbn10,
						isbn13: ed.isbn13,
						asin: ed.asin,
						format: ed.format,
						pageCount: ed.pageCount,
						audioLength: ed.audioLength,
						publisher: ed.publisher,
						editionInformation: ed.editionInformation,
						releaseDate: ed.releaseDate,
						language: ed.language,
						languageCode: ed.languageCode,
						country: ed.country,
						usersCount: ed.usersCount,
						score: ed.score,
						foreignEditionId,
						images: toImageArray(ed.coverUrl),
						contributors: ed.contributors,
						isDefaultCover: ed.id === rawBook.defaultCoverEditionId,
						metadataUpdatedAt: now,
					})
					.run();
				editionsAdded += 1;
			}
		}

		updateProgress("Checking for removed editions...");

		// Orphan detection for editions
		const existingEditions = tx
			.select({
				id: editions.id,
				foreignEditionId: editions.foreignEditionId,
			})
			.from(editions)
			.where(eq(editions.bookId, bookId))
			.all();

		for (const ed of existingEditions) {
			if (ed.foreignEditionId && !seenEditionIds.has(ed.foreignEditionId)) {
				// Check if edition has any download profile links
				const hasProfile = tx
					.select({ id: editionDownloadProfiles.id })
					.from(editionDownloadProfiles)
					.where(eq(editionDownloadProfiles.editionId, ed.id))
					.limit(1)
					.get();
				// Check if parent book has any files
				const fileCount = tx
					.select({ count: sql<number>`count(*)` })
					.from(bookFiles)
					.where(eq(bookFiles.bookId, bookId))
					.get();

				if (!hasProfile && (fileCount?.count ?? 0) === 0) {
					tx.delete(editions).where(eq(editions.id, ed.id)).run();
				} else {
					tx.update(editions)
						.set({ metadataSourceMissingSince: now })
						.where(
							and(
								eq(editions.id, ed.id),
								eq(
									editions.metadataSourceMissingSince,
									null as unknown as Date,
								),
							),
						)
						.run();
				}
			}
		}

		// Update series links
		tx.delete(seriesBookLinks).where(eq(seriesBookLinks.bookId, bookId)).run();

		for (const s of rawBook.series) {
			const existingSeries = tx
				.select({ id: series.id })
				.from(series)
				.where(eq(series.foreignSeriesId, String(s.seriesId)))
				.get();

			let localSeriesId: number;
			if (existingSeries) {
				localSeriesId = existingSeries.id;
				// Update series metadata
				tx.update(series)
					.set({
						title: s.seriesTitle,
						slug: s.seriesSlug,
						isCompleted: s.isCompleted,
						metadataUpdatedAt: now,
					})
					.where(eq(series.id, localSeriesId))
					.run();
			} else {
				const newSeries = tx
					.insert(series)
					.values({
						title: s.seriesTitle,
						slug: s.seriesSlug,
						foreignSeriesId: String(s.seriesId),
						isCompleted: s.isCompleted,
						metadataUpdatedAt: now,
					})
					.returning()
					.get();
				localSeriesId = newSeries.id;
			}

			tx.insert(seriesBookLinks)
				.values({
					seriesId: localSeriesId,
					bookId: bookId,
					position: s.position,
				})
				.run();
		}

		// Auto-switch edition: re-evaluate best edition for each monitoring profile
		if (
			localBook.autoSwitchEdition === 1 &&
			(editionsAdded > 0 || editionsUpdated > 0)
		) {
			autoSwitchEditionsForBook(tx, bookId);
		}

		return {
			booksUpdated: 1,
			booksAdded: 0,
			editionsUpdated,
			editionsAdded,
		};
	});
}

const refreshBookHandler: CommandHandler = async (
	body,
	updateProgress,
	setTitle,
) => {
	const data = body as { bookId: number };
	const bookRow = db
		.select({ title: books.title })
		.from(books)
		.where(eq(books.id, data.bookId))
		.get();
	if (bookRow) {
		setTitle(bookRow.title);
	}
	updateProgress("Fetching fresh data from Hardcover...");
	const result = await refreshBookInternal(data.bookId, updateProgress);
	return result;
};

export const refreshBookMetadataFn = createServerFn({ method: "POST" })
	.inputValidator((d: unknown) => refreshBookSchema.parse(d))
	.handler(async ({ data }) => {
		await requireAdmin();
		return submitCommand({
			commandType: "refreshBook",
			name: `Refresh book: #${data.bookId}`,
			body: data as unknown as Record<string, unknown>,
			dedupeKey: "bookId",
			batchTaskId: "refresh-hardcover-metadata",
			handler: refreshBookHandler,
		});
	});
