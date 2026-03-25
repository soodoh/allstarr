import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const bookImportListExclusions = sqliteTable(
  "book_import_list_exclusions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    foreignBookId: text("foreign_book_id").unique().notNull(),
    title: text("title").notNull(),
    authorName: text("author_name").notNull(),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
);
