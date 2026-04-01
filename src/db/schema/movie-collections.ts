import { integer, sqliteTable, text, unique } from "drizzle-orm/sqlite-core";

export const movieCollections = sqliteTable(
	"movie_collections",
	{
		id: integer("id").primaryKey({ autoIncrement: true }),
		title: text("title").notNull(),
		sortTitle: text("sort_title").notNull(),
		tmdbId: integer("tmdb_id").notNull(),
		overview: text("overview").notNull().default(""),
		posterUrl: text("poster_url"),
		fanartUrl: text("fanart_url"),
		monitored: integer("monitored", { mode: "boolean" })
			.notNull()
			.default(false),
		minimumAvailability: text("minimum_availability")
			.notNull()
			.default("released"),
		lastInfoSync: integer("last_info_sync", { mode: "timestamp" }),
		createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(
			() => new Date(),
		),
		updatedAt: integer("updated_at", { mode: "timestamp" }).$defaultFn(
			() => new Date(),
		),
	},
	(t) => [unique("movie_collections_tmdb_id_unique").on(t.tmdbId)],
);
