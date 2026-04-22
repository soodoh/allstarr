import {
	integer,
	sqliteTable,
	text,
	uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const importSources = sqliteTable("import_sources", {
	id: integer("id").primaryKey({ autoIncrement: true }),
	kind: text("kind").notNull(),
	label: text("label").notNull(),
	baseUrl: text("base_url").notNull(),
	apiKey: text("api_key").notNull(),
	lastSyncStatus: text("last_sync_status").notNull().default("idle"),
	lastSyncError: text("last_sync_error"),
	lastSyncedAt: integer("last_synced_at", { mode: "timestamp" }),
	createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(
		() => new Date(),
	),
	updatedAt: integer("updated_at", { mode: "timestamp" }).$defaultFn(
		() => new Date(),
	),
});

export const importSnapshots = sqliteTable("import_snapshots", {
	id: integer("id").primaryKey({ autoIncrement: true }),
	sourceId: integer("source_id")
		.notNull()
		.references(() => importSources.id, { onDelete: "cascade" }),
	payload: text("payload", { mode: "json" }).notNull(),
	fetchedAt: integer("fetched_at", { mode: "timestamp" }).$defaultFn(
		() => new Date(),
	),
});

export const importProvenance = sqliteTable(
	"import_provenance",
	{
		id: integer("id").primaryKey({ autoIncrement: true }),
		sourceId: integer("source_id")
			.notNull()
			.references(() => importSources.id, { onDelete: "cascade" }),
		sourceKey: text("source_key").notNull(),
		targetType: text("target_type").notNull(),
		targetId: text("target_id").notNull(),
		lastImportedAt: integer("last_imported_at", {
			mode: "timestamp",
		}).$defaultFn(() => new Date()),
	},
	(table) => [
		uniqueIndex("import_provenance_source_item_idx").on(
			table.sourceId,
			table.sourceKey,
		),
	],
);

export const importReviewItems = sqliteTable("import_review_items", {
	id: integer("id").primaryKey({ autoIncrement: true }),
	sourceId: integer("source_id")
		.notNull()
		.references(() => importSources.id, { onDelete: "cascade" }),
	sourceKey: text("source_key").notNull(),
	resourceType: text("resource_type").notNull(),
	status: text("status").notNull().default("unresolved"),
	payload: text("payload", { mode: "json" }).notNull(),
	createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(
		() => new Date(),
	),
	updatedAt: integer("updated_at", { mode: "timestamp" }).$defaultFn(
		() => new Date(),
	),
});

export type ImportSource = typeof importSources.$inferSelect;
export type NewImportSource = typeof importSources.$inferInsert;
