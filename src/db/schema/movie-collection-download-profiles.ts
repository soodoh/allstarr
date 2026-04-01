import { integer, sqliteTable, unique } from "drizzle-orm/sqlite-core";
import { downloadProfiles } from "./download-profiles";
import { movieCollections } from "./movie-collections";

export const movieCollectionDownloadProfiles = sqliteTable(
	"movie_collection_download_profiles",
	{
		id: integer("id").primaryKey({ autoIncrement: true }),
		collectionId: integer("collection_id")
			.notNull()
			.references(() => movieCollections.id, { onDelete: "cascade" }),
		downloadProfileId: integer("download_profile_id")
			.notNull()
			.references(() => downloadProfiles.id, { onDelete: "cascade" }),
	},
	(t) => [unique().on(t.collectionId, t.downloadProfileId)],
);
