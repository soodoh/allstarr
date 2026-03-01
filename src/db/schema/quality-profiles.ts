import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const qualityProfiles = sqliteTable("quality_profiles", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  rootFolderPath: text("root_folder_path").notNull().default(""),
  cutoff: integer("cutoff").notNull().default(0),
  items: text("items", { mode: "json" }).$type<
    Array<{ quality: { id: number; name: string }; allowed: boolean }>
  >(),
  upgradeAllowed: integer("upgrade_allowed", { mode: "boolean" })
    .notNull()
    .default(false),
});
