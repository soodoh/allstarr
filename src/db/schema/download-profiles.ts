import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const downloadProfiles = sqliteTable("download_profiles", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  rootFolderPath: text("root_folder_path").notNull().default(""),
  cutoff: integer("cutoff").notNull().default(0),
  items: text("items", { mode: "json" })
    .$type<number[][]>()
    .notNull()
    .default([]),
  upgradeAllowed: integer("upgrade_allowed", { mode: "boolean" })
    .notNull()
    .default(false),
  icon: text("icon").notNull().default("book-open"),
  categories: text("categories", { mode: "json" })
    .$type<number[]>()
    .notNull()
    .default([]),
  contentType: text("content_type").notNull().default("ebook"),
  language: text("language").notNull().default("en"),
  minCustomFormatScore: integer("min_custom_format_score").notNull().default(0),
  upgradeUntilCustomFormatScore: integer("upgrade_until_custom_format_score")
    .notNull()
    .default(0),
});
