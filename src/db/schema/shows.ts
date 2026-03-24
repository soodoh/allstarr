import { sqliteTable, text, integer, unique } from "drizzle-orm/sqlite-core";

export const shows = sqliteTable(
  "shows",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    title: text("title").notNull(),
    sortTitle: text("sort_title").notNull(),
    overview: text("overview").notNull().default(""),
    tmdbId: integer("tmdb_id").notNull(),
    imdbId: text("imdb_id"),
    status: text("status").notNull().default("continuing"),
    seriesType: text("series_type").notNull().default("standard"),
    network: text("network").notNull().default(""),
    year: integer("year").notNull().default(0),
    runtime: integer("runtime").notNull().default(0),
    genres: text("genres", { mode: "json" }).$type<string[]>(),
    tags: text("tags", { mode: "json" }).$type<number[]>(),
    posterUrl: text("poster_url").notNull().default(""),
    fanartUrl: text("fanart_url").notNull().default(""),
    path: text("path").notNull().default(""),
    createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(
      () => new Date(),
    ),
    updatedAt: integer("updated_at", { mode: "timestamp" }).$defaultFn(
      () => new Date(),
    ),
  },
  (t) => [unique("shows_tmdb_id_unique").on(t.tmdbId)],
);

export const seasons = sqliteTable(
  "seasons",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    showId: integer("show_id")
      .notNull()
      .references(() => shows.id, { onDelete: "cascade" }),
    seasonNumber: integer("season_number").notNull(),
    overview: text("overview"),
    posterUrl: text("poster_url"),
  },
  (t) => [unique("seasons_show_season_unique").on(t.showId, t.seasonNumber)],
);

export const episodes = sqliteTable(
  "episodes",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    showId: integer("show_id")
      .notNull()
      .references(() => shows.id, { onDelete: "cascade" }),
    seasonId: integer("season_id")
      .notNull()
      .references(() => seasons.id, { onDelete: "cascade" }),
    episodeNumber: integer("episode_number").notNull(),
    absoluteNumber: integer("absolute_number"),
    title: text("title").notNull().default(""),
    overview: text("overview"),
    airDate: text("air_date"),
    runtime: integer("runtime"),
    tmdbId: integer("tmdb_id").notNull(),
    hasFile: integer("has_file", { mode: "boolean" }).default(false),
  },
  (t) => [unique("episodes_tmdb_id_unique").on(t.tmdbId)],
);
