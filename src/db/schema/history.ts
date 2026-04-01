import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { authors } from "./authors";
import { books } from "./books";
import { manga, mangaChapters } from "./manga";
import { movies } from "./movies";
import { episodes, shows } from "./shows";

export const history = sqliteTable("history", {
	id: integer("id").primaryKey({ autoIncrement: true }),
	eventType: text("event_type").notNull(),
	bookId: integer("book_id").references(() => books.id, {
		onDelete: "set null",
	}),
	authorId: integer("author_id").references(() => authors.id, {
		onDelete: "set null",
	}),
	showId: integer("show_id").references(() => shows.id, {
		onDelete: "set null",
	}),
	episodeId: integer("episode_id").references(() => episodes.id, {
		onDelete: "set null",
	}),
	movieId: integer("movie_id").references(() => movies.id, {
		onDelete: "set null",
	}),
	mangaId: integer("manga_id").references(() => manga.id, {
		onDelete: "set null",
	}),
	mangaChapterId: integer("manga_chapter_id").references(
		() => mangaChapters.id,
		{ onDelete: "set null" },
	),
	data: text("data", { mode: "json" }).$type<
		Record<string, string | number | boolean | null>
	>(),
	date: integer("date", { mode: "timestamp" })
		.notNull()
		.$defaultFn(() => new Date()),
});
