import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { episodes } from "./shows";

export const episodeFiles = sqliteTable("episode_files", {
	id: integer("id").primaryKey({ autoIncrement: true }),
	episodeId: integer("episode_id")
		.notNull()
		.references(() => episodes.id, { onDelete: "cascade" }),
	path: text("path").notNull(),
	size: integer("size").notNull().default(0),
	quality: text("quality", { mode: "json" }).$type<{
		quality: { id: number; name: string };
		revision: { version: number; real: number };
	}>(),
	dateAdded: integer("date_added", { mode: "timestamp" })
		.notNull()
		.$defaultFn(() => new Date()),
	sceneName: text("scene_name"),
	duration: integer("duration"),
	codec: text("codec"),
	container: text("container"),
});
