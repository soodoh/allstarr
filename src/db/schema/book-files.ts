import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { books } from "./books";

export const bookFiles = sqliteTable("book_files", {
	id: integer("id").primaryKey({ autoIncrement: true }),
	bookId: integer("book_id")
		.notNull()
		.references(() => books.id, { onDelete: "cascade" }),
	path: text("path").notNull(),
	size: integer("size").notNull().default(0),
	quality: text("quality", { mode: "json" }).$type<{
		quality: { id: number; name: string };
		revision: { version: number; real: number };
	}>(),
	dateAdded: integer("date_added", { mode: "timestamp" })
		.notNull()
		.$defaultFn(() => new Date()),
	part: integer("part"),
	partCount: integer("part_count"),
	duration: integer("duration"),
	bitrate: integer("bitrate"),
	sampleRate: integer("sample_rate"),
	channels: integer("channels"),
	codec: text("codec"),
	pageCount: integer("page_count"),
	language: text("language"),
});
