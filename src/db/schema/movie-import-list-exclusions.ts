import { sqliteTable, text, integer, unique } from "drizzle-orm/sqlite-core";

export const movieImportListExclusions = sqliteTable(
  "movie_import_list_exclusions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    tmdbId: integer("tmdb_id").notNull(),
    title: text("title").notNull(),
    year: integer("year"),
    createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(
      () => new Date(),
    ),
  },
  (t) => [unique("movie_import_list_exclusions_tmdb_id_unique").on(t.tmdbId)],
);
