import { createServerFn } from "@tanstack/react-start";
import { db } from "~/db";
import { authors, books, history } from "~/db/schema";
import { eq, sql, desc } from "drizzle-orm";
import { requireAuth } from "./middleware";
import { createAuthorSchema, updateAuthorSchema } from "~/lib/validators";

export const getAuthorsFn = createServerFn({ method: "GET" }).handler(
  async () => {
    await requireAuth();
    const result = db
      .select({
        id: authors.id,
        name: authors.name,
        sortName: authors.sortName,
        overview: authors.overview,
        status: authors.status,
        monitored: authors.monitored,
        qualityProfileId: authors.qualityProfileId,
        rootFolderPath: authors.rootFolderPath,
        foreignAuthorId: authors.foreignAuthorId,
        images: authors.images,
        tags: authors.tags,
        createdAt: authors.createdAt,
        updatedAt: authors.updatedAt,
        bookCount: sql<number>`(SELECT COUNT(*) FROM books WHERE books.author_id = ${authors.id})`,
      })
      .from(authors)
      .orderBy(authors.sortName)
      .all();
    return result;
  }
);

export const getAuthorFn = createServerFn({ method: "GET" })
  .inputValidator((d: { id: number }) => d)
  .handler(async ({ data }) => {
    await requireAuth();
    const author = db
      .select()
      .from(authors)
      .where(eq(authors.id, data.id))
      .get();
    if (!author) throw new Error("Author not found");

    const authorBooks = db
      .select()
      .from(books)
      .where(eq(books.authorId, data.id))
      .orderBy(desc(books.releaseDate))
      .all();

    return { ...author, books: authorBooks };
  });

export const createAuthorFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => createAuthorSchema.parse(d))
  .handler(async ({ data }) => {
    await requireAuth();
    const author = db.insert(authors).values(data).returning().get();

    db.insert(history)
      .values({
        eventType: "authorAdded",
        authorId: author.id,
        data: { name: author.name },
      })
      .run();

    return author;
  });

export const updateAuthorFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => updateAuthorSchema.parse(d))
  .handler(async ({ data }) => {
    await requireAuth();
    const { id, ...values } = data;
    const author = db
      .update(authors)
      .set({ ...values, updatedAt: new Date() })
      .where(eq(authors.id, id))
      .returning()
      .get();

    db.insert(history)
      .values({
        eventType: "authorUpdated",
        authorId: id,
        data: { name: author.name },
      })
      .run();

    return author;
  });

export const deleteAuthorFn = createServerFn({ method: "POST" })
  .inputValidator((d: { id: number }) => d)
  .handler(async ({ data }) => {
    await requireAuth();
    const author = db
      .select()
      .from(authors)
      .where(eq(authors.id, data.id))
      .get();

    db.delete(authors).where(eq(authors.id, data.id)).run();

    if (author) {
      db.insert(history)
        .values({
          eventType: "authorDeleted",
          data: { name: author.name },
        })
        .run();
    }

    return { success: true };
  });
