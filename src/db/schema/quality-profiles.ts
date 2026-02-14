import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const qualityProfiles = sqliteTable("quality_profiles", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  cutoff: integer("cutoff").notNull().default(0),
  items: text("items", { mode: "json" }).$type<
    { quality: { id: number; name: string }; allowed: boolean }[]
  >(),
  upgradeAllowed: integer("upgrade_allowed", { mode: "boolean" })
    .notNull()
    .default(false),
});
