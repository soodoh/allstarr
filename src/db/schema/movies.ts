import {
	index,
	integer,
	sqliteTable,
	text,
	unique,
} from "drizzle-orm/sqlite-core";
import { movieCollections } from "./movie-collections";

export const movies = sqliteTable(
	"movies",
	{
		id: integer("id").primaryKey({ autoIncrement: true }),
		title: text("title").notNull(),
		sortTitle: text("sort_title").notNull(),
		overview: text("overview").notNull().default(""),
		tmdbId: integer("tmdb_id").notNull(),
		imdbId: text("imdb_id"),
		status: text("status").notNull().default("announced"),
		studio: text("studio").notNull().default(""),
		year: integer("year").notNull().default(0),
		runtime: integer("runtime").notNull().default(0),
		genres: text("genres", { mode: "json" }).$type<string[]>(),
		tags: text("tags", { mode: "json" }).$type<number[]>(),
		posterUrl: text("poster_url").notNull().default(""),
		fanartUrl: text("fanart_url").notNull().default(""),
		minimumAvailability: text("minimum_availability")
			.notNull()
			.default("released"),
		path: text("path").notNull().default(""),
		collectionId: integer("collection_id").references(
			() => movieCollections.id,
			{ onDelete: "set null" },
		),
		lastSearchedAt: integer("last_searched_at"),
		createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(
			() => new Date(),
		),
		updatedAt: integer("updated_at", { mode: "timestamp" }).$defaultFn(
			() => new Date(),
		),
	},
	(t) => [
		unique("movies_tmdb_id_unique").on(t.tmdbId),
		index("movies_collection_id_idx").on(t.collectionId),
	],
);
