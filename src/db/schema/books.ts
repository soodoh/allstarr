import {
  sqliteTable,
  text,
  integer,
  real,
  unique,
} from "drizzle-orm/sqlite-core";
import { authors } from "./authors";

export const books = sqliteTable("books", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  title: text("title").notNull(),
  slug: text("slug"),
  description: text("description"),
  releaseDate: text("release_date"),
  releaseYear: integer("release_year"),
  foreignBookId: text("foreign_book_id"),
  images: text("images", { mode: "json" })
    .$type<Array<{ url: string; coverType: string }>>()
    .notNull()
    .default([]),
  rating: real("rating"),
  ratingsCount: integer("ratings_count"),
  usersCount: integer("users_count"),
  tags: text("tags", { mode: "json" }).$type<number[]>().notNull().default([]),
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
  autoSwitchEdition: integer("auto_switch_edition").default(1).notNull(),
});

export const booksAuthors = sqliteTable(
  "books_authors",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    bookId: integer("book_id")
      .notNull()
      .references(() => books.id, { onDelete: "cascade" }),
    authorId: integer("author_id").references(() => authors.id, {
      onDelete: "set null",
    }),
    foreignAuthorId: text("foreign_author_id").notNull(),
    authorName: text("author_name").notNull(),
    isPrimary: integer("is_primary", { mode: "boolean" })
      .notNull()
      .default(false),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [unique().on(t.bookId, t.foreignAuthorId)],
);

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
  audioLength: integer("audio_length"),
  publisher: text("publisher"),
  editionInformation: text("edition_information"),
  releaseDate: text("release_date"),
  language: text("language"),
  languageCode: text("language_code"),
  country: text("country"),
  usersCount: integer("users_count"),
  score: integer("score"),
  foreignEditionId: text("foreign_edition_id"),
  images: text("images", { mode: "json" })
    .$type<Array<{ url: string; coverType: string }>>()
    .notNull()
    .default([]),
  contributors: text("contributors", { mode: "json" })
    .$type<
      Array<{ authorId: string; name: string; contribution: string | null }>
    >()
    .notNull()
    .default([]),
  isDefaultCover: integer("is_default_cover", { mode: "boolean" })
    .notNull()
    .default(false),
  metadataUpdatedAt: integer("metadata_updated_at", { mode: "timestamp" }),
  metadataSourceMissingSince: integer("metadata_source_missing_since", {
    mode: "timestamp",
  }),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});
