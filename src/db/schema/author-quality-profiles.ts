import { sqliteTable, integer, unique } from "drizzle-orm/sqlite-core";
import { authors } from "./authors";
import { qualityProfiles } from "./quality-profiles";

export const authorQualityProfiles = sqliteTable(
  "author_quality_profiles",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    authorId: integer("author_id")
      .notNull()
      .references(() => authors.id, { onDelete: "cascade" }),
    qualityProfileId: integer("quality_profile_id")
      .notNull()
      .references(() => qualityProfiles.id, { onDelete: "cascade" }),
  },
  (t) => [unique().on(t.authorId, t.qualityProfileId)],
);
