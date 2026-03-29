import { sqliteTable, text, integer, unique } from "drizzle-orm/sqlite-core";

export const manga = sqliteTable(
  "manga",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    title: text("title").notNull(),
    sortTitle: text("sort_title").notNull(),
    overview: text("overview").notNull().default(""),
    mangaUpdatesId: integer("manga_updates_id").notNull(),
    mangaUpdatesSlug: text("manga_updates_slug"),
    type: text("type").notNull().default("manga"), // manga | manhwa | manhua
    year: text("year"),
    status: text("status").notNull().default("ongoing"), // ongoing | complete | hiatus | cancelled
    latestChapter: integer("latest_chapter"),
    posterUrl: text("poster_url").notNull().default(""),
    cachedPosterPath: text("cached_poster_path"),
    fanartUrl: text("fanart_url").notNull().default(""),
    images: text("images", { mode: "json" }).$type<
      Array<{ url: string; coverType: string }>
    >(),
    tags: text("tags", { mode: "json" }).$type<number[]>(),
    genres: text("genres", { mode: "json" }).$type<string[]>(),
    monitored: integer("monitored", { mode: "boolean" }).default(true),
    monitorNewChapters: text("monitor_new_chapters").notNull().default("all"), // all | future | missing | none
    path: text("path").notNull().default(""),
    createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(
      () => new Date(),
    ),
    updatedAt: integer("updated_at", { mode: "timestamp" }).$defaultFn(
      () => new Date(),
    ),
    metadataUpdatedAt: integer("metadata_updated_at", {
      mode: "timestamp",
    }),
    wikipediaPageTitle: text("wikipedia_page_title"),
    wikipediaFetchedAt: integer("wikipedia_fetched_at", {
      mode: "timestamp",
    }),
  },
  (t) => [unique("manga_manga_updates_id_unique").on(t.mangaUpdatesId)],
);

export const mangaVolumes = sqliteTable(
  "manga_volumes",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    mangaId: integer("manga_id")
      .notNull()
      .references(() => manga.id, { onDelete: "cascade" }),
    volumeNumber: integer("volume_number"), // nullable for ungrouped chapters
    title: text("title"),
    monitored: integer("monitored", { mode: "boolean" }).default(true),
    mappingSource: text("mapping_source").notNull().default("mangaupdates"),
  },
  (t) => [
    unique("manga_volumes_manga_volume_unique").on(t.mangaId, t.volumeNumber),
  ],
);

export const mangaChapters = sqliteTable("manga_chapters", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  mangaVolumeId: integer("manga_volume_id")
    .notNull()
    .references(() => mangaVolumes.id, { onDelete: "cascade" }),
  mangaId: integer("manga_id")
    .notNull()
    .references(() => manga.id, { onDelete: "cascade" }),
  chapterNumber: text("chapter_number").notNull(), // supports "10.5", "Extra"
  title: text("title"),
  releaseDate: text("release_date"),
  scanlationGroup: text("scanlation_group"),
  hasFile: integer("has_file", { mode: "boolean" }).default(false),
  monitored: integer("monitored", { mode: "boolean" }).default(true),
  lastSearchedAt: integer("last_searched_at"),
});
