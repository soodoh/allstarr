import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { authors } from "./authors";
import { books } from "./books";
import { shows } from "./shows";
import { movies } from "./movies";

export const blocklist = sqliteTable("blocklist", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  bookId: integer("book_id").references(() => books.id, {
    onDelete: "set null",
  }),
  authorId: integer("author_id").references(() => authors.id, {
    onDelete: "set null",
  }),
  showId: integer("show_id").references(() => shows.id, {
    onDelete: "set null",
  }),
  movieId: integer("movie_id").references(() => movies.id, {
    onDelete: "set null",
  }),
  sourceTitle: text("source_title").notNull(),
  protocol: text("protocol"),
  indexer: text("indexer"),
  message: text("message"),
  source: text("source").notNull().default("automatic"),
  date: integer("date", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});
