import { sqliteTable, integer, unique } from "drizzle-orm/sqlite-core";
import { episodes } from "./shows";
import { downloadProfiles } from "./download-profiles";

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
