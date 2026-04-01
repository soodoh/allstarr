import { integer, sqliteTable, unique } from "drizzle-orm/sqlite-core";
import { downloadProfiles } from "./download-profiles";
import { movies } from "./movies";

export const movieDownloadProfiles = sqliteTable(
	"movie_download_profiles",
	{
		id: integer("id").primaryKey({ autoIncrement: true }),
		movieId: integer("movie_id")
			.notNull()
			.references(() => movies.id, { onDelete: "cascade" }),
		downloadProfileId: integer("download_profile_id")
			.notNull()
			.references(() => downloadProfiles.id, { onDelete: "cascade" }),
	},
	(t) => [unique().on(t.movieId, t.downloadProfileId)],
);
