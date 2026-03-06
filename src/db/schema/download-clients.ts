import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export type DownloadClientSettings = {
  addPaused?: boolean;
  sequentialOrder?: boolean;
  firstAndLastPiecePriority?: boolean;
  watchFolder?: string;
  savePath?: string;
  [key: string]: string | number | boolean | undefined;
};

export const downloadClients = sqliteTable("download_clients", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  implementation: text("implementation").notNull(),
  protocol: text("protocol").notNull(),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  priority: integer("priority").notNull().default(1),
  host: text("host").notNull().default("localhost"),
  port: integer("port").notNull(),
  useSsl: integer("use_ssl", { mode: "boolean" }).notNull().default(false),
  urlBase: text("url_base"),
  username: text("username"),
  password: text("password"),
  apiKey: text("api_key"),
  category: text("category").notNull().default("allstarr"),
  tag: text("tag"),
  removeCompletedDownloads: integer("remove_completed_downloads", {
    mode: "boolean",
  })
    .notNull()
    .default(true),
  settings: text("settings", { mode: "json" }).$type<DownloadClientSettings>(),
  createdAt: integer("created_at").$defaultFn(() => Date.now()),
  updatedAt: integer("updated_at").$defaultFn(() => Date.now()),
});
