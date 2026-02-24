import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { db } from "~/db";
import { authors, books, series, seriesBookLinks, history } from "~/db/schema";
import { eq } from "drizzle-orm";
import { requireAuth } from "./middleware";

// ---------- Shared helpers ----------

function deriveSortName(name: string): string {
  const parts = name.trim().split(" ");
  if (parts.length > 1) {
    return `${parts.at(-1)}, ${parts.slice(0, -1).join(" ")}`;
  }
  return name;
}

// ---------- Zod schemas ----------

const importBookSchema = z.object({
  title: z.string().min(1),
  foreignBookId: z.string().min(1),
  releaseDate: z.string().nullable().optional(),
  monitored: z.boolean().default(true),
  images: z
    .array(z.object({ url: z.string(), coverType: z.string() }))
    .optional(),
  ratings: z
    .object({ value: z.number(), votes: z.number() })
    .nullable()
    .optional(),
  series: z
    .array(
      z.object({
        foreignSeriesId: z.string(),
        title: z.string(),
        position: z.string().nullable().optional(),
      }),
    )
    .optional(),
});

const importAuthorSchema = z.object({
  name: z.string().min(1),
  foreignAuthorId: z.string().min(1),
  slug: z.string().optional(),
  overview: z.string().nullable().optional(),
  status: z.string().default("continuing"),
  qualityProfileId: z.number().nullable().optional(),
  rootFolderPath: z.string().nullable().optional(),
  images: z
    .array(z.object({ url: z.string(), coverType: z.string() }))
    .optional(),
  books: z.array(importBookSchema).default([]),
});

const importBookOnlySchema = importBookSchema.extend({
  authorId: z.number().int().positive(),
});

// ---------- Server functions ----------

export const importHardcoverAuthorFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => importAuthorSchema.parse(d))
  .handler(async ({ data }) => {
    await requireAuth();

    // Duplicate guard
    const existing = db
      .select({ id: authors.id })
      .from(authors)
      .where(eq(authors.foreignAuthorId, data.foreignAuthorId))
      .get();
    if (existing) {
      throw new Error("Author is already in your library.");
    }

    return db.transaction((tx) => {
      // Insert author
      const author = tx
        .insert(authors)
        .values({
          name: data.name,
          sortName: deriveSortName(data.name),
          overview: data.overview ?? undefined,
          status: data.status,
          qualityProfileId: data.qualityProfileId ?? undefined,
          rootFolderPath: data.rootFolderPath ?? undefined,
          foreignAuthorId: data.foreignAuthorId,
          slug: data.slug ?? undefined,
          images: data.images,
        })
        .returning()
        .get();

      tx.insert(history)
        .values({
          eventType: "authorAdded",
          authorId: author.id,
          data: { name: author.name, source: "hardcover" },
        })
        .run();

      // Series cache: foreignSeriesId → local series id
      const seriesCache = new Map<string, number>();

      let booksAdded = 0;

      for (const bookData of data.books) {
        // Insert book
        const book = tx
          .insert(books)
          .values({
            title: bookData.title,
            authorId: author.id,
            foreignBookId: bookData.foreignBookId,
            releaseDate: bookData.releaseDate ?? undefined,
            monitored: bookData.monitored,
            images: bookData.images,
            ratings: bookData.ratings ?? undefined,
          })
          .returning()
          .get();

        tx.insert(history)
          .values({
            eventType: "bookAdded",
            bookId: book.id,
            authorId: author.id,
            data: { title: book.title, source: "hardcover" },
          })
          .run();

        booksAdded += 1;

        // Series links
        for (const s of bookData.series ?? []) {
          let localSeriesId = seriesCache.get(s.foreignSeriesId);

          if (localSeriesId === undefined) {
            const existingSeries = tx
              .select({ id: series.id })
              .from(series)
              .where(eq(series.foreignSeriesId, s.foreignSeriesId))
              .get();

            if (existingSeries) {
              localSeriesId = existingSeries.id;
            } else {
              const newSeries = tx
                .insert(series)
                .values({
                  title: s.title,
                  foreignSeriesId: s.foreignSeriesId,
                })
                .returning()
                .get();
              localSeriesId = newSeries.id;
            }

            seriesCache.set(s.foreignSeriesId, localSeriesId);
          }

          tx.insert(seriesBookLinks)
            .values({
              seriesId: localSeriesId,
              bookId: book.id,
              position: s.position ?? undefined,
            })
            .run();
        }
      }

      return { authorId: author.id, booksAdded };
    });
  });

export const importHardcoverBookFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => importBookOnlySchema.parse(d))
  .handler(async ({ data }) => {
    await requireAuth();

    // Duplicate guard
    const existing = db
      .select({ id: books.id })
      .from(books)
      .where(eq(books.foreignBookId, data.foreignBookId))
      .get();
    if (existing) {
      throw new Error("Book is already in your library.");
    }

    return db.transaction((tx) => {
      const book = tx
        .insert(books)
        .values({
          title: data.title,
          authorId: data.authorId,
          foreignBookId: data.foreignBookId,
          releaseDate: data.releaseDate ?? undefined,
          monitored: data.monitored,
          images: data.images,
          ratings: data.ratings ?? undefined,
        })
        .returning()
        .get();

      tx.insert(history)
        .values({
          eventType: "bookAdded",
          bookId: book.id,
          authorId: data.authorId,
          data: { title: book.title, source: "hardcover" },
        })
        .run();

      // Series links
      for (const s of data.series ?? []) {
        const existingSeries = tx
          .select({ id: series.id })
          .from(series)
          .where(eq(series.foreignSeriesId, s.foreignSeriesId))
          .get();

        let localSeriesId: number;
        if (existingSeries) {
          localSeriesId = existingSeries.id;
        } else {
          const newSeries = tx
            .insert(series)
            .values({
              title: s.title,
              foreignSeriesId: s.foreignSeriesId,
            })
            .returning()
            .get();
          localSeriesId = newSeries.id;
        }

        tx.insert(seriesBookLinks)
          .values({
            seriesId: localSeriesId,
            bookId: book.id,
            position: s.position ?? undefined,
          })
          .run();
      }

      return book;
    });
  });
