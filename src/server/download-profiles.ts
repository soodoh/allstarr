import fs from "node:fs";
import path from "node:path";
import { createServerFn } from "@tanstack/react-start";
import { db } from "src/db";
import {
  downloadProfiles,
  downloadFormats,
  bookFiles,
  books,
  booksAuthors,
  authorDownloadProfiles,
  episodeFiles,
  episodes,
  shows,
  showDownloadProfiles,
  movieFiles,
  movies,
  movieDownloadProfiles,
} from "src/db/schema";
import { eq, like, and, sql } from "drizzle-orm";
import { requireAuth } from "./middleware";
import {
  createDownloadProfileSchema,
  updateDownloadProfileSchema,
  createDownloadFormatSchema,
  updateDownloadFormatSchema,
} from "src/lib/validators";
import { invalidateFormatDefCache } from "./indexers/format-parser";

async function validateRootFolderPath(rootFolderPath: string): Promise<void> {
  if (!rootFolderPath) {
    return;
  }
  const fs = await import("node:fs");
  if (!fs.existsSync(rootFolderPath)) {
    throw new Error(`Root folder does not exist: ${rootFolderPath}`);
  }
}

export const getDownloadProfilesFn = createServerFn({ method: "GET" }).handler(
  async () => {
    await requireAuth();
    return db.select().from(downloadProfiles).all();
  },
);

export const getDownloadProfileFn = createServerFn({ method: "GET" })
  .inputValidator((d: { id: number }) => d)
  .handler(async ({ data }) => {
    await requireAuth();
    const result = db
      .select()
      .from(downloadProfiles)
      .where(eq(downloadProfiles.id, data.id))
      .get();
    if (!result) {
      throw new Error("Download profile not found");
    }
    return result;
  });

export const createDownloadProfileFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => createDownloadProfileSchema.parse(d))
  .handler(async ({ data }) => {
    await requireAuth();
    await validateRootFolderPath(data.rootFolderPath);
    return db
      .insert(downloadProfiles)
      .values({
        ...data,
      })
      .returning()
      .get();
  });

export const updateDownloadProfileFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => updateDownloadProfileSchema.parse(d))
  .handler(async ({ data }) => {
    await requireAuth();
    await validateRootFolderPath(data.rootFolderPath);
    const { id, ...values } = data;
    return db
      .update(downloadProfiles)
      .set({
        ...values,
      })
      .where(eq(downloadProfiles.id, id))
      .returning()
      .get();
  });

export const deleteDownloadProfileFn = createServerFn({ method: "POST" })
  .inputValidator((d: { id: number }) => d)
  .handler(async ({ data }) => {
    await requireAuth();
    db.delete(downloadProfiles).where(eq(downloadProfiles.id, data.id)).run();
    return { success: true };
  });

// File count & move for root folder changes
export const countProfileFilesFn = createServerFn({ method: "GET" })
  .inputValidator((d: { profileId: number }) => d)
  .handler(async ({ data }) => {
    await requireAuth();
    const profile = db
      .select()
      .from(downloadProfiles)
      .where(eq(downloadProfiles.id, data.profileId))
      .get();
    if (!profile) {
      throw new Error("Download profile not found");
    }

    let count = 0;
    switch (profile.contentType) {
      case "ebook":
      case "audiobook": {
        const result = db
          .select({ count: sql<number>`count(DISTINCT ${bookFiles.id})` })
          .from(bookFiles)
          .innerJoin(books, eq(bookFiles.bookId, books.id))
          .innerJoin(booksAuthors, eq(books.id, booksAuthors.bookId))
          .innerJoin(
            authorDownloadProfiles,
            eq(booksAuthors.authorId, authorDownloadProfiles.authorId),
          )
          .where(eq(authorDownloadProfiles.downloadProfileId, data.profileId))
          .get();
        count = result?.count ?? 0;
        break;
      }
      case "tv": {
        const result = db
          .select({ count: sql<number>`count(DISTINCT ${episodeFiles.id})` })
          .from(episodeFiles)
          .innerJoin(episodes, eq(episodeFiles.episodeId, episodes.id))
          .innerJoin(shows, eq(episodes.showId, shows.id))
          .innerJoin(
            showDownloadProfiles,
            eq(shows.id, showDownloadProfiles.showId),
          )
          .where(eq(showDownloadProfiles.downloadProfileId, data.profileId))
          .get();
        count = result?.count ?? 0;
        break;
      }
      case "movie": {
        const result = db
          .select({ count: sql<number>`count(DISTINCT ${movieFiles.id})` })
          .from(movieFiles)
          .innerJoin(movies, eq(movieFiles.movieId, movies.id))
          .innerJoin(
            movieDownloadProfiles,
            eq(movies.id, movieDownloadProfiles.movieId),
          )
          .where(eq(movieDownloadProfiles.downloadProfileId, data.profileId))
          .get();
        count = result?.count ?? 0;
        break;
      }
      default: {
        break;
      }
    }

    return { count };
  });

export const moveProfileFilesFn = createServerFn({ method: "POST" })
  .inputValidator(
    (d: { profileId: number; oldRootFolder: string; newRootFolder: string }) =>
      d,
  )
  .handler(async ({ data }) => {
    await requireAuth();
    const profile = db
      .select()
      .from(downloadProfiles)
      .where(eq(downloadProfiles.id, data.profileId))
      .get();
    if (!profile) {
      throw new Error("Download profile not found");
    }

    const likePattern = `${data.oldRootFolder}%`;
    let movedCount = 0;
    const errors: string[] = [];

    switch (profile.contentType) {
      case "ebook":
      case "audiobook": {
        const files = db
          .select({ id: bookFiles.id, path: bookFiles.path })
          .from(bookFiles)
          .innerJoin(books, eq(bookFiles.bookId, books.id))
          .innerJoin(booksAuthors, eq(books.id, booksAuthors.bookId))
          .innerJoin(
            authorDownloadProfiles,
            eq(booksAuthors.authorId, authorDownloadProfiles.authorId),
          )
          .where(
            and(
              eq(authorDownloadProfiles.downloadProfileId, data.profileId),
              like(bookFiles.path, likePattern),
            ),
          )
          .all();

        // Deduplicate (a book file can appear through multiple author links)
        const seen = new Set<number>();
        for (const file of files) {
          if (seen.has(file.id)) {
            continue;
          }
          seen.add(file.id);
          const newPath =
            data.newRootFolder + file.path.slice(data.oldRootFolder.length);
          try {
            fs.mkdirSync(path.dirname(newPath), { recursive: true });
            fs.renameSync(file.path, newPath);
            db.update(bookFiles)
              .set({ path: newPath })
              .where(eq(bookFiles.id, file.id))
              .run();
            movedCount += 1;
          } catch (error) {
            errors.push(
              `Failed to move ${file.path}: ${error instanceof Error ? error.message : String(error)}`,
            );
          }
        }
        break;
      }
      case "tv": {
        const files = db
          .select({ id: episodeFiles.id, path: episodeFiles.path })
          .from(episodeFiles)
          .innerJoin(episodes, eq(episodeFiles.episodeId, episodes.id))
          .innerJoin(shows, eq(episodes.showId, shows.id))
          .innerJoin(
            showDownloadProfiles,
            eq(shows.id, showDownloadProfiles.showId),
          )
          .where(
            and(
              eq(showDownloadProfiles.downloadProfileId, data.profileId),
              like(episodeFiles.path, likePattern),
            ),
          )
          .all();

        const seen = new Set<number>();
        for (const file of files) {
          if (seen.has(file.id)) {
            continue;
          }
          seen.add(file.id);
          const newPath =
            data.newRootFolder + file.path.slice(data.oldRootFolder.length);
          try {
            fs.mkdirSync(path.dirname(newPath), { recursive: true });
            fs.renameSync(file.path, newPath);
            db.update(episodeFiles)
              .set({ path: newPath })
              .where(eq(episodeFiles.id, file.id))
              .run();
            movedCount += 1;
          } catch (error) {
            errors.push(
              `Failed to move ${file.path}: ${error instanceof Error ? error.message : String(error)}`,
            );
          }
        }

        // Update show paths
        const affectedShows = db
          .select({ id: shows.id, path: shows.path })
          .from(shows)
          .innerJoin(
            showDownloadProfiles,
            eq(shows.id, showDownloadProfiles.showId),
          )
          .where(
            and(
              eq(showDownloadProfiles.downloadProfileId, data.profileId),
              like(shows.path, likePattern),
            ),
          )
          .all();

        for (const show of affectedShows) {
          const newShowPath =
            data.newRootFolder + show.path.slice(data.oldRootFolder.length);
          db.update(shows)
            .set({ path: newShowPath })
            .where(eq(shows.id, show.id))
            .run();
        }
        break;
      }
      case "movie": {
        const files = db
          .select({ id: movieFiles.id, path: movieFiles.path })
          .from(movieFiles)
          .innerJoin(movies, eq(movieFiles.movieId, movies.id))
          .innerJoin(
            movieDownloadProfiles,
            eq(movies.id, movieDownloadProfiles.movieId),
          )
          .where(
            and(
              eq(movieDownloadProfiles.downloadProfileId, data.profileId),
              like(movieFiles.path, likePattern),
            ),
          )
          .all();

        const seen = new Set<number>();
        for (const file of files) {
          if (seen.has(file.id)) {
            continue;
          }
          seen.add(file.id);
          const newPath =
            data.newRootFolder + file.path.slice(data.oldRootFolder.length);
          try {
            fs.mkdirSync(path.dirname(newPath), { recursive: true });
            fs.renameSync(file.path, newPath);
            db.update(movieFiles)
              .set({ path: newPath })
              .where(eq(movieFiles.id, file.id))
              .run();
            movedCount += 1;
          } catch (error) {
            errors.push(
              `Failed to move ${file.path}: ${error instanceof Error ? error.message : String(error)}`,
            );
          }
        }

        // Update movie paths
        const affectedMovies = db
          .select({ id: movies.id, path: movies.path })
          .from(movies)
          .innerJoin(
            movieDownloadProfiles,
            eq(movies.id, movieDownloadProfiles.movieId),
          )
          .where(
            and(
              eq(movieDownloadProfiles.downloadProfileId, data.profileId),
              like(movies.path, likePattern),
            ),
          )
          .all();

        for (const movie of affectedMovies) {
          const newMoviePath =
            data.newRootFolder + movie.path.slice(data.oldRootFolder.length);
          db.update(movies)
            .set({ path: newMoviePath })
            .where(eq(movies.id, movie.id))
            .run();
        }
        break;
      }
      default: {
        break;
      }
    }

    return { movedCount, errors };
  });

// Download Formats
export const getDownloadFormatsFn = createServerFn({
  method: "GET",
}).handler(async () => {
  await requireAuth();
  return db.select().from(downloadFormats).all();
});

export const createDownloadFormatFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => createDownloadFormatSchema.parse(d))
  .handler(async ({ data }) => {
    await requireAuth();
    const result = db.insert(downloadFormats).values(data).returning().get();
    invalidateFormatDefCache();
    return result;
  });

export const updateDownloadFormatFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => updateDownloadFormatSchema.parse(d))
  .handler(async ({ data }) => {
    await requireAuth();
    const { id, ...values } = data;
    const result = db
      .update(downloadFormats)
      .set(values)
      .where(eq(downloadFormats.id, id))
      .returning()
      .get();

    invalidateFormatDefCache();
    return result;
  });

export const deleteDownloadFormatFn = createServerFn({ method: "POST" })
  .inputValidator((d: { id: number }) => d)
  .handler(async ({ data }) => {
    await requireAuth();
    // Remove from all download profiles' items arrays (nested group structure)
    const profiles = db.select().from(downloadProfiles).all();
    for (const profile of profiles) {
      const updatedItems = (profile.items as number[][])
        .map((group: number[]) => group.filter((id) => id !== data.id))
        .filter((group: number[]) => group.length > 0);
      if (JSON.stringify(updatedItems) !== JSON.stringify(profile.items)) {
        db.update(downloadProfiles)
          .set({ items: updatedItems })
          .where(eq(downloadProfiles.id, profile.id))
          .run();
      }
    }
    db.delete(downloadFormats).where(eq(downloadFormats.id, data.id)).run();
    invalidateFormatDefCache();
    return { success: true };
  });
