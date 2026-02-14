import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { authors } from "./authors";
import { books } from "./books";

export const history = sqliteTable("history", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  eventType: text("event_type").notNull(),
  bookId: integer("book_id").references(() => books.id, {
    onDelete: "set null",
  }),
  authorId: integer("author_id").references(() => authors.id, {
    onDelete: "set null",
  }),
  data: text("data", { mode: "json" }).$type<Record<string, unknown>>(),
  date: integer("date", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});
