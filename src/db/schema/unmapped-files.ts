import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export type UnmappedFileHints = {
	title?: string;
	author?: string;
	year?: number;
	season?: number;
	episode?: number;
	source?: "filename" | "path" | "metadata";
};

export const unmappedFiles = sqliteTable("unmapped_files", {
	id: integer("id").primaryKey({ autoIncrement: true }),
	path: text("path").notNull().unique(),
	size: integer("size").notNull().default(0),
	rootFolderPath: text("root_folder_path").notNull(),
	contentType: text("content_type").notNull(),
	format: text("format").notNull(),
	quality: text("quality", { mode: "json" }).$type<{
		quality: { id: number; name: string };
		revision: { version: number; real: number };
	}>(),
	hints: text("hints", { mode: "json" }).$type<UnmappedFileHints>(),
	ignored: integer("ignored", { mode: "boolean" }).notNull().default(false),
	dateDiscovered: integer("date_discovered", { mode: "timestamp" })
		.notNull()
		.$defaultFn(() => new Date()),
});
