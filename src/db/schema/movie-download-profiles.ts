import { sqliteTable, integer, unique } from "drizzle-orm/sqlite-core";
import { movies } from "./movies";
import { downloadProfiles } from "./download-profiles";

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
