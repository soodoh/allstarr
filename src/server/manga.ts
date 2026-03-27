import { createServerFn } from "@tanstack/react-start";
import { db } from "src/db";
import {
  manga,
  mangaVolumes,
  mangaChapters,
  mangaFiles,
  mangaDownloadProfiles,
  history,
} from "src/db/schema";
import { eq, sql, and, desc, inArray } from "drizzle-orm";
import { requireAuth } from "./middleware";
import {
  updateMangaSchema,
  deleteMangaSchema,
  monitorMangaProfileSchema,
  unmonitorMangaProfileSchema,
  bulkMonitorMangaChapterProfileSchema,
  bulkUnmonitorMangaChapterProfileSchema,
} from "src/lib/validators";
import * as fs from "node:fs";

// ─── List all manga ──────────────────────────────────────────────────────

export const getMangasFn = createServerFn({ method: "GET" }).handler(
  async () => {
    await requireAuth();

    const rows = db
      .select({
        id: manga.id,
        title: manga.title,
        sortTitle: manga.sortTitle,
        overview: manga.overview,
        mangaUpdatesId: manga.mangaUpdatesId,
        mangaUpdatesSlug: manga.mangaUpdatesSlug,
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

    // Fetch manga-level download profile links
    const profileLinks = db
      .select({
        mangaId: mangaDownloadProfiles.mangaId,
        downloadProfileId: mangaDownloadProfiles.downloadProfileId,
      })
      .from(mangaDownloadProfiles)
      .all();

    const profilesByManga = new Map<number, number[]>();
    for (const link of profileLinks) {
      const arr = profilesByManga.get(link.mangaId) ?? [];
      arr.push(link.downloadProfileId);
      profilesByManga.set(link.mangaId, arr);
    }

    return rows.map((row) =>
      Object.assign(row, {
        downloadProfileIds: profilesByManga.get(row.id) ?? [],
      }),
    );
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

    // Get download profile IDs
    const profileLinks = db
      .select({
        downloadProfileId: mangaDownloadProfiles.downloadProfileId,
      })
      .from(mangaDownloadProfiles)
      .where(eq(mangaDownloadProfiles.mangaId, data.id))
      .all();
    const downloadProfileIds = profileLinks.map((l) => l.downloadProfileId);

    return {
      ...mangaRow,
      downloadProfileIds,
      volumes: volumesWithChapters,
    };
  });

// ─── Update manga ──────────────────────────────────────────────────────────

export const updateMangaFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => updateMangaSchema.parse(d))
  .handler(async ({ data }) => {
    await requireAuth();

    const { id, downloadProfileIds, monitorNewChapters, path } = data;

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

    // Update download profiles if provided
    if (downloadProfileIds !== undefined) {
      // Replace manga download profiles
      db.delete(mangaDownloadProfiles)
        .where(eq(mangaDownloadProfiles.mangaId, id))
        .run();
      for (const profileId of downloadProfileIds) {
        db.insert(mangaDownloadProfiles)
          .values({ mangaId: id, downloadProfileId: profileId })
          .run();
      }
    }

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

// ─── Monitor/unmonitor manga profile ──────────────────────────────────────

export const monitorMangaProfileFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => monitorMangaProfileSchema.parse(d))
  .handler(async ({ data }) => {
    await requireAuth();

    db.insert(mangaDownloadProfiles)
      .values({
        mangaId: data.mangaId,
        downloadProfileId: data.downloadProfileId,
      })
      .onConflictDoNothing()
      .run();

    return { success: true };
  });

export const unmonitorMangaProfileFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => unmonitorMangaProfileSchema.parse(d))
  .handler(async ({ data }) => {
    await requireAuth();

    db.delete(mangaDownloadProfiles)
      .where(
        and(
          eq(mangaDownloadProfiles.mangaId, data.mangaId),
          eq(mangaDownloadProfiles.downloadProfileId, data.downloadProfileId),
        ),
      )
      .run();

    return { success: true };
  });

// ─── Bulk monitor/unmonitor chapters ──────────────────────────────────────

export const bulkMonitorMangaChapterProfileFn = createServerFn({
  method: "POST",
})
  .inputValidator((d: unknown) => bulkMonitorMangaChapterProfileSchema.parse(d))
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

export const bulkUnmonitorMangaChapterProfileFn = createServerFn({
  method: "POST",
})
  .inputValidator((d: unknown) =>
    bulkUnmonitorMangaChapterProfileSchema.parse(d),
  )
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

// ─── Check existence ──────────────────────────────────────────────────────

export const checkMangaExistsFn = createServerFn({ method: "GET" })
  .inputValidator((d: { mangaUpdatesId: number }) => d)
  .handler(async ({ data }) => {
    await requireAuth();
    const row = db
      .select({ id: manga.id, title: manga.title })
      .from(manga)
      .where(eq(manga.mangaUpdatesId, data.mangaUpdatesId))
      .get();
    return row ?? null;
  });
