import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export type IndexerSettings = {
  categories?: number[];
  [key: string]: string | number | boolean | number[] | undefined;
};

export const indexers = sqliteTable("indexers", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
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
  host: text("host").notNull().default("localhost"),
  port: integer("port").notNull().default(9696),
  useSsl: integer("use_ssl", { mode: "boolean" }).notNull().default(false),
  urlBase: text("url_base"),
  apiKey: text("api_key").notNull(),
  settings: text("settings", { mode: "json" }).$type<IndexerSettings>(),
  createdAt: integer("created_at").$defaultFn(() => Date.now()),
  updatedAt: integer("updated_at").$defaultFn(() => Date.now()),
});
