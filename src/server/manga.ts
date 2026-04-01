import * as fs from "node:fs";
import { createServerFn } from "@tanstack/react-start";
import { desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "src/db";
import {
	history,
	manga,
	mangaChapters,
	mangaFiles,
	mangaVolumes,
} from "src/db/schema";
import { deleteMangaSchema, updateMangaSchema } from "src/lib/validators";
import { requireAuth } from "./middleware";

// ─── List all manga ──────────────────────────────────────────────────────

export const getMangasFn = createServerFn({ method: "GET" }).handler(
	async () => {
		await requireAuth();

		return db
			.select({
				id: manga.id,
				title: manga.title,
				sortTitle: manga.sortTitle,
				overview: manga.overview,
				sourceId: manga.sourceId,
				sourceMangaUrl: manga.sourceMangaUrl,
				type: manga.type,
				year: manga.year,
				status: manga.status,
				latestChapter: manga.latestChapter,
				posterUrl: manga.posterUrl,
				fanartUrl: manga.fanartUrl,
				genres: manga.genres,
				tags: manga.tags,
				monitored: manga.monitored,
				monitorNewChapters: manga.monitorNewChapters,
				path: manga.path,
				createdAt: manga.createdAt,
				updatedAt: manga.updatedAt,
				volumeCount: sql<number>`COUNT(DISTINCT ${mangaVolumes.id})`,
				chapterCount: sql<number>`COUNT(DISTINCT ${mangaChapters.id})`,
				chapterFileCount: sql<number>`SUM(CASE WHEN ${mangaChapters.hasFile} = 1 THEN 1 ELSE 0 END)`,
			})
			.from(manga)
			.leftJoin(mangaVolumes, eq(mangaVolumes.mangaId, manga.id))
			.leftJoin(mangaChapters, eq(mangaChapters.mangaId, manga.id))
			.groupBy(manga.id)
			.orderBy(desc(manga.createdAt))
			.all();
	},
);

// ─── Manga detail ──────────────────────────────────────────────────────────

export const getMangaDetailFn = createServerFn({ method: "GET" })
	.inputValidator((d: { id: number }) => d)
	.handler(async ({ data }) => {
		await requireAuth();

		const mangaRow = db.select().from(manga).where(eq(manga.id, data.id)).get();

		if (!mangaRow) {
			throw new Error("Manga not found");
		}

		// Get all volumes for this manga
		const volumes = db
			.select()
			.from(mangaVolumes)
			.where(eq(mangaVolumes.mangaId, data.id))
			.orderBy(mangaVolumes.volumeNumber)
			.all();

		// Get all chapters for this manga
		const chapters = db
			.select()
			.from(mangaChapters)
			.where(eq(mangaChapters.mangaId, data.id))
			.orderBy(mangaChapters.chapterNumber)
			.all();

		// Get all files for chapters
		const chapterIds = chapters.map((ch) => ch.id);
		const files =
			chapterIds.length > 0
				? db
						.select()
						.from(mangaFiles)
						.where(inArray(mangaFiles.chapterId, chapterIds))
						.all()
				: [];

		// Group files by chapter
		const filesByChapter = new Map<
			number,
			Array<typeof mangaFiles.$inferSelect>
		>();
		for (const file of files) {
			const arr = filesByChapter.get(file.chapterId) ?? [];
			arr.push(file);
			filesByChapter.set(file.chapterId, arr);
		}

		// Attach files to chapters
		const chaptersWithFiles = chapters.map((ch) =>
			Object.assign(ch, {
				files: filesByChapter.get(ch.id) ?? [],
			}),
		);

		// Group chapters by volume
		const chaptersByVolume = new Map<number, typeof chaptersWithFiles>();
		for (const ch of chaptersWithFiles) {
			const arr = chaptersByVolume.get(ch.mangaVolumeId) ?? [];
			arr.push(ch);
			chaptersByVolume.set(ch.mangaVolumeId, arr);
		}

		const volumesWithChapters = volumes.map((vol) =>
			Object.assign(vol, {
				chapters: chaptersByVolume.get(vol.id) ?? [],
			}),
		);

		return {
			...mangaRow,
			volumes: volumesWithChapters,
		};
	});

// ─── Update manga ──────────────────────────────────────────────────────────

export const updateMangaFn = createServerFn({ method: "POST" })
	.inputValidator((d: unknown) => updateMangaSchema.parse(d))
	.handler(async ({ data }) => {
		await requireAuth();

		const { id, monitorNewChapters, path } = data;

		const mangaRow = db.select().from(manga).where(eq(manga.id, id)).get();

		if (!mangaRow) {
			throw new Error("Manga not found");
		}

		// Update manga-level fields
		const updates: Record<string, unknown> = {
			updatedAt: new Date(),
		};
		if (monitorNewChapters) {
			updates.monitorNewChapters = monitorNewChapters;
		}
		if (path !== undefined) {
			updates.path = path;
		}
		db.update(manga).set(updates).where(eq(manga.id, id)).run();

		// biome-ignore lint/style/noNonNullAssertion: row guaranteed to exist after update
		return db.select().from(manga).where(eq(manga.id, id)).get()!;
	});

// ─── Delete manga ──────────────────────────────────────────────────────────

export const deleteMangaFn = createServerFn({ method: "POST" })
	.inputValidator((d: unknown) => deleteMangaSchema.parse(d))
	.handler(async ({ data }) => {
		await requireAuth();

		const mangaRow = db.select().from(manga).where(eq(manga.id, data.id)).get();

		if (!mangaRow) {
			throw new Error("Manga not found");
		}

		// If deleteFiles, find and delete all manga files from disk
		if (data.deleteFiles) {
			const chapters = db
				.select({ id: mangaChapters.id })
				.from(mangaChapters)
				.where(eq(mangaChapters.mangaId, data.id))
				.all();

			const chapterIds = chapters.map((ch) => ch.id);

			if (chapterIds.length > 0) {
				const files = db
					.select({ path: mangaFiles.path })
					.from(mangaFiles)
					.where(inArray(mangaFiles.chapterId, chapterIds))
					.all();

				for (const file of files) {
					try {
						fs.unlinkSync(file.path);
					} catch {
						// File may already be missing — continue
					}
				}
			}
		}

		// Delete manga — cascades remove volumes, chapters, files, join table
		db.delete(manga).where(eq(manga.id, data.id)).run();

		db.insert(history)
			.values({
				eventType: "mangaDeleted",
				data: { title: mangaRow.title },
			})
			.run();

		return { success: true };
	});

// ─── Bulk monitor/unmonitor chapters ──────────────────────────────────────

export const bulkMonitorMangaChaptersFn = createServerFn({ method: "POST" })
	.inputValidator((d: { chapterIds: number[] }) => d)
	.handler(async ({ data }) => {
		await requireAuth();

		if (data.chapterIds.length > 0) {
			db.update(mangaChapters)
				.set({ monitored: true })
				.where(inArray(mangaChapters.id, data.chapterIds))
				.run();
		}

		return { success: true };
	});

export const bulkUnmonitorMangaChaptersFn = createServerFn({ method: "POST" })
	.inputValidator((d: { chapterIds: number[]; deleteFiles: boolean }) => d)
	.handler(async ({ data }) => {
		await requireAuth();

		if (data.chapterIds.length > 0) {
			db.update(mangaChapters)
				.set({ monitored: false })
				.where(inArray(mangaChapters.id, data.chapterIds))
				.run();
		}

		return { success: true };
	});
