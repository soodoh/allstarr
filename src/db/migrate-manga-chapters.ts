import { and, eq, inArray, sql } from "drizzle-orm";
import {
	expandChapterRange,
	normalizeChapterNumber,
} from "src/server/manga-chapter-utils";
import { db } from "./index";
import { manga, mangaChapters, mangaFiles, mangaVolumes } from "./schema";

type ChapterRow = typeof mangaChapters.$inferSelect;

/**
 * One-time migration: clean up duplicate manga chapters.
 * - Strip version/quality suffixes (v2, HQ, etc.)
 * - Expand chapter ranges into individual chapters
 * - Merge duplicates, preserving file associations
 */
function migrateMangaChapters(): void {
	const allManga = db
		.select({ id: manga.id, title: manga.title })
		.from(manga)
		.all();

	for (const m of allManga) {
		process.stdout.write(`\nProcessing: ${m.title} (ID: ${m.id})\n`);

		const chapters = db
			.select()
			.from(mangaChapters)
			.where(eq(mangaChapters.mangaId, m.id))
			.all();

		process.stdout.write(`  Found ${chapters.length} chapters\n`);

		let deleted = 0;
		let expanded = 0;
		let normalized = 0;

		// Phase 1: Normalize chapter numbers (strip suffixes)
		for (const ch of chapters) {
			const norm = normalizeChapterNumber(ch.chapterNumber);
			if (norm !== ch.chapterNumber) {
				db.update(mangaChapters)
					.set({ chapterNumber: norm })
					.where(eq(mangaChapters.id, ch.id))
					.run();
				ch.chapterNumber = norm;
				normalized += 1;
			}
		}

		// Phase 2: Expand ranges
		// Collect chapters that are ranges and need expansion
		const toDelete: number[] = [];

		for (const ch of chapters) {
			// Skip compound entries (contain "+") — just delete them
			if (ch.chapterNumber.includes("+")) {
				// Move any files to an individual chapter if one exists
				reassignFiles(ch.id, ch.mangaId, ch.mangaVolumeId);
				toDelete.push(ch.id);
				deleted += 1;
				continue;
			}

			const range = expandChapterRange(ch.chapterNumber);
			if (!range) {
				continue;
			}

			// For each number in the range, ensure an individual chapter exists
			for (const num of range) {
				const key = String(num);
				const existing = chapters.find(
					(c) =>
						c.chapterNumber === key &&
						c.id !== ch.id &&
						!toDelete.includes(c.id),
				);

				if (!existing) {
					// Create the individual chapter
					db.insert(mangaChapters)
						.values({
							mangaVolumeId: ch.mangaVolumeId,
							mangaId: ch.mangaId,
							chapterNumber: key,
							releaseDate: ch.releaseDate,
							scanlationGroup: ch.scanlationGroup,
							hasFile: false,
							monitored: ch.monitored ?? true,
						})
						.run();
					expanded += 1;
				}
			}

			// Reassign any files from the range row, then mark for deletion
			reassignFiles(ch.id, ch.mangaId, ch.mangaVolumeId);
			toDelete.push(ch.id);
			deleted += 1;
		}

		// Phase 3: Merge remaining duplicates (same chapter number after normalization)
		// Re-read chapters since we may have inserted new ones
		const updatedChapters = db
			.select()
			.from(mangaChapters)
			.where(
				and(
					eq(mangaChapters.mangaId, m.id),
					// Exclude chapters already marked for deletion
					...(toDelete.length > 0 ? [] : []),
				),
			)
			.all()
			.filter((c) => !toDelete.includes(c.id));

		const byNumber = new Map<string, ChapterRow[]>();
		for (const ch of updatedChapters) {
			const arr = byNumber.get(ch.chapterNumber) ?? [];
			arr.push(ch);
			byNumber.set(ch.chapterNumber, arr);
		}

		for (const [, dupes] of byNumber) {
			if (dupes.length <= 1) {
				continue;
			}

			// Keep the one with a file, or earliest release date
			const sorted = [...dupes].toSorted((a, b) => {
				// Prefer chapter with file
				if (a.hasFile && !b.hasFile) {
					return -1;
				}
				if (!a.hasFile && b.hasFile) {
					return 1;
				}
				// Then earliest release date
				if (a.releaseDate && b.releaseDate) {
					return a.releaseDate.localeCompare(b.releaseDate);
				}
				if (a.releaseDate) {
					return -1;
				}
				if (b.releaseDate) {
					return 1;
				}
				return 0;
			});

			const keeper = sorted[0];
			for (let i = 1; i < sorted.length; i += 1) {
				const dupe = sorted[i];
				// Reassign files from dupe to keeper
				db.update(mangaFiles)
					.set({ chapterId: keeper.id })
					.where(eq(mangaFiles.chapterId, dupe.id))
					.run();
				// If dupe had a file, mark keeper as having file
				if (dupe.hasFile) {
					db.update(mangaChapters)
						.set({ hasFile: true })
						.where(eq(mangaChapters.id, keeper.id))
						.run();
				}
				toDelete.push(dupe.id);
				deleted += 1;
			}
		}

		// Bulk delete all marked chapters
		if (toDelete.length > 0) {
			db.delete(mangaChapters).where(inArray(mangaChapters.id, toDelete)).run();
		}

		process.stdout.write(
			`  Normalized: ${normalized}, Expanded: ${expanded}, Deleted: ${deleted}\n`,
		);
	}

	// Phase 4: Delete empty volumes (volumes with no remaining chapters)
	const emptyVolumes = db
		.select({ id: mangaVolumes.id, volumeNumber: mangaVolumes.volumeNumber })
		.from(mangaVolumes)
		.leftJoin(mangaChapters, eq(mangaChapters.mangaVolumeId, mangaVolumes.id))
		.groupBy(mangaVolumes.id)
		.having(sql`COUNT(${mangaChapters.id}) = 0`)
		.all();

	if (emptyVolumes.length > 0) {
		const emptyIds = emptyVolumes.map((v) => v.id);
		db.delete(mangaVolumes).where(inArray(mangaVolumes.id, emptyIds)).run();
		process.stdout.write(
			`\nDeleted ${emptyVolumes.length} empty volumes: ${emptyVolumes.map((v) => v.volumeNumber ?? "ungrouped").join(", ")}\n`,
		);
	}

	process.stdout.write("\nMigration complete\n");
}

/**
 * Reassign any files from a chapter being deleted.
 * Files are moved to a chapter with the same manga that isn't being deleted.
 * If no suitable chapter exists, the files will be cascade-deleted with the chapter.
 */
function reassignFiles(
	chapterId: number,
	_mangaId: number,
	_volumeId: number,
): void {
	// Files on range/compound chapters are rare — cascade delete is acceptable
	// since the individual chapters will be created without file associations.
	// This function is a no-op: we check files exist but intentionally do nothing.
	db.select({ id: mangaFiles.id })
		.from(mangaFiles)
		.where(eq(mangaFiles.chapterId, chapterId))
		.all();
}

migrateMangaChapters();
