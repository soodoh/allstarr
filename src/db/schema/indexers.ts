import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { downloadClients } from "./download-clients";

export const indexers = sqliteTable("indexers", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  implementation: text("implementation").notNull().default("Newznab"), // "Newznab" or "Torznab"
  protocol: text("protocol").notNull().default("usenet"), // "torrent" or "usenet"
  baseUrl: text("base_url").notNull(),
  apiPath: text("api_path").default("/api"),
  apiKey: text("api_key").notNull(),
  categories: text("categories").default("[]"), // JSON array of category IDs
  enableRss: integer("enable_rss", { mode: "boolean" }).notNull().default(true),
  enableAutomaticSearch: integer("enable_automatic_search", {
    mode: "boolean",
  })
    .notNull()
    .default(true),
  enableInteractiveSearch: integer("enable_interactive_search", {
    mode: "boolean",
  })
    .notNull()
    .default(true),
  priority: integer("priority").notNull().default(25),
  tag: text("tag"),
  downloadClientId: integer("download_client_id").references(
    () => downloadClients.id,
    { onDelete: "set null" },
  ),
  createdAt: integer("created_at").$defaultFn(() => Date.now()),
  updatedAt: integer("updated_at").$defaultFn(() => Date.now()),
});
