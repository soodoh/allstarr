import { integer, sqliteTable, unique } from "drizzle-orm/sqlite-core";
import { authors } from "./authors";
import { downloadProfiles } from "./download-profiles";

export const authorDownloadProfiles = sqliteTable(
	"author_download_profiles",
	{
		id: integer("id").primaryKey({ autoIncrement: true }),
		authorId: integer("author_id")
			.notNull()
			.references(() => authors.id, { onDelete: "cascade" }),
		downloadProfileId: integer("download_profile_id")
			.notNull()
			.references(() => downloadProfiles.id, { onDelete: "cascade" }),
	},
	(t) => [unique().on(t.authorId, t.downloadProfileId)],
);
