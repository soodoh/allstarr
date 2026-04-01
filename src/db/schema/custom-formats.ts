import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export type CustomFormatSpecification = {
	name: string;
	type: string;
	value?: string;
	min?: number;
	max?: number;
	negate: boolean;
	required: boolean;
};

export const customFormats = sqliteTable("custom_formats", {
	id: integer("id").primaryKey({ autoIncrement: true }),
	name: text("name").notNull(),
	category: text("category").notNull(),
	specifications: text("specifications", { mode: "json" })
		.notNull()
		.$type<CustomFormatSpecification[]>()
		.default([]),
	defaultScore: integer("default_score").notNull().default(0),
	contentTypes: text("content_types", { mode: "json" })
		.notNull()
		.$type<string[]>()
		.default([]),
	includeInRenaming: integer("include_in_renaming", { mode: "boolean" })
		.notNull()
		.default(false),
	description: text("description"),
	origin: text("origin"), // "builtin", "imported", or null
	userModified: integer("user_modified", { mode: "boolean" })
		.notNull()
		.default(false),
});
