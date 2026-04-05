import { integer, sqliteTable, unique } from "drizzle-orm/sqlite-core";
import { downloadProfiles } from "./download-profiles";
import { series } from "./series";

export const seriesDownloadProfiles = sqliteTable(
	"series_download_profiles",
	{
		id: integer("id").primaryKey({ autoIncrement: true }),
		seriesId: integer("series_id")
			.notNull()
			.references(() => series.id, { onDelete: "cascade" }),
		downloadProfileId: integer("download_profile_id")
			.notNull()
			.references(() => downloadProfiles.id, { onDelete: "cascade" }),
	},
	(t) => [unique().on(t.seriesId, t.downloadProfileId)],
);
