import { integer, sqliteTable, uniqueIndex } from "drizzle-orm/sqlite-core";
import { customFormats } from "./custom-formats";
import { downloadProfiles } from "./download-profiles";

export const profileCustomFormats = sqliteTable(
	"profile_custom_formats",
	{
		id: integer("id").primaryKey({ autoIncrement: true }),
		profileId: integer("profile_id")
			.notNull()
			.references(() => downloadProfiles.id, { onDelete: "cascade" }),
		customFormatId: integer("custom_format_id")
			.notNull()
			.references(() => customFormats.id, { onDelete: "cascade" }),
		score: integer("score").notNull().default(0),
	},
	(table) => [
		uniqueIndex("profile_custom_format_idx").on(
			table.profileId,
			table.customFormatId,
		),
	],
);
