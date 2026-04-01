import { integer, sqliteTable, unique } from "drizzle-orm/sqlite-core";
import { downloadProfiles } from "./download-profiles";
import { shows } from "./shows";

export const showDownloadProfiles = sqliteTable(
	"show_download_profiles",
	{
		id: integer("id").primaryKey({ autoIncrement: true }),
		showId: integer("show_id")
			.notNull()
			.references(() => shows.id, { onDelete: "cascade" }),
		downloadProfileId: integer("download_profile_id")
			.notNull()
			.references(() => downloadProfiles.id, { onDelete: "cascade" }),
	},
	(t) => [unique().on(t.showId, t.downloadProfileId)],
);
