import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { mangaChapters } from "./manga";

export const mangaFiles = sqliteTable("manga_files", {
	id: integer("id").primaryKey({ autoIncrement: true }),
	chapterId: integer("chapter_id")
		.notNull()
		.references(() => mangaChapters.id, { onDelete: "cascade" }),
	path: text("path").notNull(),
	size: integer("size").notNull().default(0),
	format: text("format"), // cbz | cbr | pdf | epub
	quality: text("quality"),
	scanlationGroup: text("scanlation_group"),
	language: text("language"),
	dateAdded: integer("date_added", { mode: "timestamp" })
		.notNull()
		.$defaultFn(() => new Date()),
});
