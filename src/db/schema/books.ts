import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { authors } from "./authors";

export const books = sqliteTable("books", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  title: text("title").notNull(),
  authorId: integer("author_id")
    .notNull()
    .references(() => authors.id, { onDelete: "cascade" }),
  overview: text("overview"),
  isbn: text("isbn"),
  asin: text("asin"),
  releaseDate: text("release_date"),
  monitored: integer("monitored", { mode: "boolean" }).notNull().default(true),
  foreignBookId: text("foreign_book_id"),
  images: text("images", { mode: "json" }).$type<
    { url: string; coverType: string }[]
  >(),
  ratings: text("ratings", { mode: "json" }).$type<{
    value: number;
    votes: number;
  }>(),
  tags: text("tags", { mode: "json" }).$type<number[]>(),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const editions = sqliteTable("editions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  bookId: integer("book_id")
    .notNull()
    .references(() => books.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  isbn: text("isbn"),
  asin: text("asin"),
  format: text("format"),
  pageCount: integer("page_count"),
  publisher: text("publisher"),
  releaseDate: text("release_date"),
  foreignEditionId: text("foreign_edition_id"),
  images: text("images", { mode: "json" }).$type<
    { url: string; coverType: string }[]
  >(),
  monitored: integer("monitored", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});
