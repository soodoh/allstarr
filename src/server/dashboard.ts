import { createServerFn } from "@tanstack/react-start";
import { db } from "~/db";
import { authors, books, editions, rootFolders } from "~/db/schema";
import { sql, gt, desc } from "drizzle-orm";
import { requireAuth } from "./middleware";
import * as fs from "node:fs";

export const getDashboardStatsFn = createServerFn({ method: "GET" }).handler(
  async () => {
    await requireAuth();

    const authorCount = db
      .select({ count: sql<number>`count(*)` })
      .from(authors)
      .get()!.count;

    const monitoredAuthors = db
      .select({ count: sql<number>`count(*)` })
      .from(authors)
      .where(sql`${authors.monitored} = 1`)
      .get()!.count;

    const bookCount = db
      .select({ count: sql<number>`count(*)` })
      .from(books)
      .get()!.count;

    const monitoredBooks = db
      .select({ count: sql<number>`count(*)` })
      .from(books)
      .where(sql`${books.monitored} = 1`)
      .get()!.count;

    const editionCount = db
      .select({ count: sql<number>`count(*)` })
      .from(editions)
      .get()!.count;

    const recentBooks = db
      .select({
        id: books.id,
        title: books.title,
        authorId: books.authorId,
        authorName: authors.name,
        releaseDate: books.releaseDate,
        createdAt: books.createdAt,
      })
      .from(books)
      .leftJoin(authors, sql`${books.authorId} = ${authors.id}`)
      .orderBy(desc(books.createdAt))
      .limit(10)
      .all();

    const today = new Date().toISOString().split("T")[0];
    const upcomingBooks = db
      .select({
        id: books.id,
        title: books.title,
        authorId: books.authorId,
        authorName: authors.name,
        releaseDate: books.releaseDate,
      })
      .from(books)
      .leftJoin(authors, sql`${books.authorId} = ${authors.id}`)
      .where(gt(books.releaseDate, today))
      .orderBy(books.releaseDate)
      .limit(10)
      .all();

    const folders = db.select().from(rootFolders).all();
    const folderStats = folders.map((folder) => {
      let freeSpace = folder.freeSpace || 0;
      let totalSpace = folder.totalSpace || 0;
      try {
        const stats = fs.statfsSync(folder.path);
        freeSpace = Number(stats.bfree * stats.bsize);
        totalSpace = Number(stats.blocks * stats.bsize);
      } catch {
        // folder may not exist
      }
      return { ...folder, freeSpace, totalSpace };
    });

    return {
      authorCount,
      monitoredAuthors,
      bookCount,
      monitoredBooks,
      editionCount,
      recentBooks,
      upcomingBooks,
      rootFolders: folderStats,
    };
  }
);
