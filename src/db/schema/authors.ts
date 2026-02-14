import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { qualityProfiles } from "./quality-profiles";

export const authors = sqliteTable("authors", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  sortName: text("sort_name").notNull(),
  overview: text("overview"),
  status: text("status").notNull().default("continuing"),
  monitored: integer("monitored", { mode: "boolean" }).notNull().default(true),
  qualityProfileId: integer("quality_profile_id").references(
    () => qualityProfiles.id
  ),
  rootFolderPath: text("root_folder_path"),
  foreignAuthorId: text("foreign_author_id"),
  images: text("images", { mode: "json" }).$type<
    { url: string; coverType: string }[]
  >(),
  tags: text("tags", { mode: "json" }).$type<number[]>(),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});
