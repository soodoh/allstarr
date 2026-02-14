import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const rootFolders = sqliteTable("root_folders", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  path: text("path").notNull().unique(),
  freeSpace: integer("free_space"),
  totalSpace: integer("total_space"),
});
