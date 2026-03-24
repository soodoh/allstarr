import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";

export const downloadFormats = sqliteTable("download_formats", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  title: text("title").notNull(),
  weight: integer("weight").notNull().default(1),
  minSize: real("min_size").default(0),
  maxSize: real("max_size"),
  preferredSize: real("preferred_size"),
  color: text("color").notNull().default("gray"),
  contentTypes: text("content_types", { mode: "json" })
    .$type<string[]>()
    .notNull()
    .default(["ebook"]),
  source: text("source"),
  resolution: integer("resolution").notNull().default(0),
  noMaxLimit: integer("no_max_limit").notNull().default(0),
  noPreferredLimit: integer("no_preferred_limit").notNull().default(0),
});
