import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { downloadClients } from "./download-clients";

export const syncedIndexers = sqliteTable("synced_indexers", {
	id: integer("id").primaryKey({ autoIncrement: true }),
	name: text("name").notNull(),
	implementation: text("implementation").notNull(), // "Newznab" or "Torznab"
	configContract: text("config_contract").notNull(), // "NewznabSettings" or "TorznabSettings"
	baseUrl: text("base_url").notNull(),
	apiPath: text("api_path").default("/api"),
	apiKey: text("api_key"),
	categories: text("categories").default("[]"), // JSON array of category IDs
	enableRss: integer("enable_rss", { mode: "boolean" }).notNull().default(true),
	enableSearch: integer("enable_search", { mode: "boolean" })
		.notNull()
		.default(true),
	enableAutomaticSearch: integer("enable_automatic_search", { mode: "boolean" })
		.notNull()
		.default(true),
	enableInteractiveSearch: integer("enable_interactive_search", {
		mode: "boolean",
	})
		.notNull()
		.default(true),
	priority: integer("priority").notNull().default(25),
	protocol: text("protocol").notNull(), // "torrent" or "usenet"
	tag: text("tag"),
	downloadClientId: integer("download_client_id").references(
		() => downloadClients.id,
		{ onDelete: "set null" },
	),
	// Rate limiting — configuration
	requestInterval: integer("request_interval").notNull().default(5000),
	dailyQueryLimit: integer("daily_query_limit").notNull().default(0),
	dailyGrabLimit: integer("daily_grab_limit").notNull().default(0),
	// Rate limiting — status (system-managed)
	backoffUntil: integer("backoff_until").notNull().default(0),
	escalationLevel: integer("escalation_level").notNull().default(0),
	createdAt: integer("created_at").$defaultFn(() => Date.now()),
	updatedAt: integer("updated_at").$defaultFn(() => Date.now()),
});

export type SyncedIndexer = typeof syncedIndexers.$inferSelect;
export type NewSyncedIndexer = typeof syncedIndexers.$inferInsert;
