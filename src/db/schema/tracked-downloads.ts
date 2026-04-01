import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { authors } from "./authors";
import { books } from "./books";
import { downloadClients } from "./download-clients";
import { downloadProfiles } from "./download-profiles";
import { manga, mangaChapters } from "./manga";
import { movies } from "./movies";
import { episodes, shows } from "./shows";

export const trackedDownloads = sqliteTable("tracked_downloads", {
	id: integer("id").primaryKey({ autoIncrement: true }),
	downloadClientId: integer("download_client_id")
		.notNull()
		.references(() => downloadClients.id, { onDelete: "cascade" }),
	downloadId: text("download_id").notNull(),
	bookId: integer("book_id").references(() => books.id, {
		onDelete: "set null",
	}),
	authorId: integer("author_id").references(() => authors.id, {
		onDelete: "set null",
	}),
	downloadProfileId: integer("download_profile_id").references(
		() => downloadProfiles.id,
		{ onDelete: "set null" },
	),
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
	releaseTitle: text("release_title").notNull(),
	protocol: text("protocol").notNull(),
	indexerId: integer("indexer_id"),
	guid: text("guid"),
	state: text("state").notNull().default("queued"),
	outputPath: text("output_path"),
	message: text("message"),
	createdAt: integer("created_at", { mode: "timestamp" })
		.notNull()
		.$defaultFn(() => new Date()),
	updatedAt: integer("updated_at", { mode: "timestamp" })
		.notNull()
		.$defaultFn(() => new Date()),
});
