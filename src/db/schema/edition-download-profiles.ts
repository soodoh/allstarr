import { sqliteTable, integer, unique } from "drizzle-orm/sqlite-core";
import { editions } from "./books";
import { downloadProfiles } from "./download-profiles";

export const editionDownloadProfiles = sqliteTable(
  "edition_download_profiles",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    editionId: integer("edition_id")
      .notNull()
      .references(() => editions.id, { onDelete: "cascade" }),
    downloadProfileId: integer("download_profile_id")
      .notNull()
      .references(() => downloadProfiles.id, { onDelete: "cascade" }),
  },
  (t) => [unique().on(t.editionId, t.downloadProfileId)],
);
