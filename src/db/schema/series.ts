import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { books } from "./books";

export const series = sqliteTable("series", {
	id: integer("id").primaryKey({ autoIncrement: true }),
	title: text("title").notNull(),
	slug: text("slug"),
	foreignSeriesId: text("foreign_series_id"),
	description: text("description"),
	isCompleted: integer("is_completed", { mode: "boolean" }),
	metadataUpdatedAt: integer("metadata_updated_at", { mode: "timestamp" }),
	metadataSourceMissingSince: integer("metadata_source_missing_since", {
		mode: "timestamp",
	}),
	createdAt: integer("created_at", { mode: "timestamp" })
		.notNull()
		.$defaultFn(() => new Date()),
	monitored: integer("monitored", { mode: "boolean" }).notNull().default(false),
	updatedAt: integer("updated_at", { mode: "timestamp" }).$defaultFn(
		() => new Date(),
	),
});

export const seriesBookLinks = sqliteTable("series_book_links", {
	id: integer("id").primaryKey({ autoIncrement: true }),
	seriesId: integer("series_id")
		.notNull()
		.references(() => series.id, { onDelete: "cascade" }),
	bookId: integer("book_id")
		.notNull()
		.references(() => books.id, { onDelete: "cascade" }),
	position: text("position"),
});
