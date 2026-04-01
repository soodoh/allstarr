import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

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
	foreignAuthorId: text("foreign_author_id"),
	images: text("images", { mode: "json" })
		.$type<Array<{ url: string; coverType: string }>>()
		.notNull()
		.default([]),
	monitored: integer("monitored", { mode: "boolean" }).notNull().default(true),
	monitorNewBooks: text("monitor_new_books").notNull().default("all"),
	tags: text("tags", { mode: "json" }).$type<number[]>().notNull().default([]),
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
