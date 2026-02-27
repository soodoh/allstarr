import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { qualityProfiles } from "./quality-profiles";

export const authors = sqliteTable("authors", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  sortName: text("sort_name").notNull(),
  slug: text("slug"),
  bio: text("bio"),
  bornYear: integer("born_year"),
  deathYear: integer("death_year"),
  status: text("status").notNull().default("continuing"),
  isStub: integer("is_stub", { mode: "boolean" }).notNull().default(false),
  qualityProfileId: integer("quality_profile_id").references(
    () => qualityProfiles.id,
  ),
  rootFolderPath: text("root_folder_path"),
  foreignAuthorId: text("foreign_author_id"),
  images: text("images", { mode: "json" }).$type<
    Array<{ url: string; coverType: string }>
  >(),
  monitored: integer("monitored", { mode: "boolean" }).notNull().default(true),
  tags: text("tags", { mode: "json" }).$type<number[]>(),
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
