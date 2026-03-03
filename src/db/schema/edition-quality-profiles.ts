import { sqliteTable, integer, unique } from "drizzle-orm/sqlite-core";
import { editions } from "./books";
import { qualityProfiles } from "./quality-profiles";

export const editionQualityProfiles = sqliteTable(
  "edition_quality_profiles",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    editionId: integer("edition_id")
      .notNull()
      .references(() => editions.id, { onDelete: "cascade" }),
    qualityProfileId: integer("quality_profile_id")
      .notNull()
      .references(() => qualityProfiles.id, { onDelete: "cascade" }),
  },
  (t) => [unique().on(t.editionId, t.qualityProfileId)],
);
