import { sqliteTable, integer, unique } from "drizzle-orm/sqlite-core";
import { manga } from "./manga";
import { downloadProfiles } from "./download-profiles";

export const mangaDownloadProfiles = sqliteTable(
  "manga_download_profiles",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    mangaId: integer("manga_id")
      .notNull()
      .references(() => manga.id, { onDelete: "cascade" }),
    downloadProfileId: integer("download_profile_id")
      .notNull()
      .references(() => downloadProfiles.id, { onDelete: "cascade" }),
  },
  (t) => [unique().on(t.mangaId, t.downloadProfileId)],
);
