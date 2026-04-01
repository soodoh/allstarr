import { integer, sqliteTable, unique } from "drizzle-orm/sqlite-core";
import { downloadProfiles } from "./download-profiles";
import { episodes } from "./shows";

export const episodeDownloadProfiles = sqliteTable(
	"episode_download_profiles",
	{
		id: integer("id").primaryKey({ autoIncrement: true }),
		episodeId: integer("episode_id")
			.notNull()
			.references(() => episodes.id, { onDelete: "cascade" }),
		downloadProfileId: integer("download_profile_id")
			.notNull()
			.references(() => downloadProfiles.id, { onDelete: "cascade" }),
	},
	(t) => [unique().on(t.episodeId, t.downloadProfileId)],
);
