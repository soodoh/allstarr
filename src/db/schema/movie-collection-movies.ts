import { integer, sqliteTable, text, unique } from "drizzle-orm/sqlite-core";
import { movieCollections } from "./movie-collections";

export const movieCollectionMovies = sqliteTable(
	"movie_collection_movies",
	{
		id: integer("id").primaryKey({ autoIncrement: true }),
		collectionId: integer("collection_id")
			.notNull()
			.references(() => movieCollections.id, { onDelete: "cascade" }),
		tmdbId: integer("tmdb_id").notNull(),
		title: text("title").notNull(),
		overview: text("overview").notNull().default(""),
		posterUrl: text("poster_url"),
		releaseDate: text("release_date").notNull().default(""),
		year: integer("year"),
	},
	(t) => [unique().on(t.collectionId, t.tmdbId)],
);
