import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const tags = sqliteTable("tags", {
	id: integer("id").primaryKey({ autoIncrement: true }),
	label: text("label").notNull().unique(),
});
