import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { authors } from "./authors";

export const books = sqliteTable("books", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  title: text("title").notNull(),
  slug: text("slug"),
  authorId: integer("author_id")
    .notNull()
    .references(() => authors.id, { onDelete: "cascade" }),
  description: text("description"),
  releaseDate: text("release_date"),
  releaseYear: integer("release_year"),
  monitored: integer("monitored", { mode: "boolean" }).notNull().default(false),
  foreignBookId: text("foreign_book_id"),
  images: text("images", { mode: "json" }).$type<
    Array<{ url: string; coverType: string }>
  >(),
  rating: real("rating"),
  ratingsCount: integer("ratings_count"),
  usersCount: integer("users_count"),
  tags: text("tags", { mode: "json" }).$type<number[]>(),
  foreignAuthorIds: text("foreign_author_ids", { mode: "json" }).$type<
    Array<{ foreignAuthorId: string; name: string }>
  >(),
  metadataUpdatedAt: integer("metadata_updated_at", { mode: "timestamp" }),
  metadataSourceMissingSince: integer("metadata_source_missing_since", {
    mode: "timestamp",
  }),
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
  isbn10: text("isbn10"),
  isbn13: text("isbn13"),
  asin: text("asin"),
  format: text("format"),
  pageCount: integer("page_count"),
  publisher: text("publisher"),
  editionInformation: text("edition_information"),
  releaseDate: text("release_date"),
  language: text("language"),
  languageCode: text("language_code"),
  country: text("country"),
  usersCount: integer("users_count"),
  score: integer("score"),
  foreignEditionId: text("foreign_edition_id"),
  images: text("images", { mode: "json" }).$type<
    Array<{ url: string; coverType: string }>
  >(),
  contributors: text("contributors", { mode: "json" }).$type<
    Array<{ authorId: string; name: string; contribution: string | null }>
  >(),
  monitored: integer("monitored", { mode: "boolean" }).notNull().default(true),
  metadataUpdatedAt: integer("metadata_updated_at", { mode: "timestamp" }),
  metadataSourceMissingSince: integer("metadata_source_missing_since", {
    mode: "timestamp",
  }),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

