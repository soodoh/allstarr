PRAGMA foreign_keys=OFF;--> statement-breakpoint
DROP TABLE IF EXISTS `manga`;--> statement-breakpoint
DROP TABLE IF EXISTS `manga_volumes`;--> statement-breakpoint
DROP TABLE IF EXISTS `manga_chapters`;--> statement-breakpoint
DROP TABLE IF EXISTS `manga_files`;--> statement-breakpoint
DROP TABLE IF EXISTS `manga_sources`;--> statement-breakpoint
CREATE TABLE `__new_history` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`event_type` text NOT NULL,
	`book_id` integer,
	`author_id` integer,
	`show_id` integer,
	`episode_id` integer,
	`movie_id` integer,
	`data` text,
	`date` integer NOT NULL,
	FOREIGN KEY (`book_id`) REFERENCES `books`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`author_id`) REFERENCES `authors`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`show_id`) REFERENCES `shows`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`episode_id`) REFERENCES `episodes`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`movie_id`) REFERENCES `movies`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_history`("id", "event_type", "book_id", "author_id", "show_id", "episode_id", "movie_id", "data", "date") SELECT "id", "event_type", "book_id", "author_id", "show_id", "episode_id", "movie_id", "data", "date" FROM `history`;--> statement-breakpoint
DROP TABLE `history`;--> statement-breakpoint
ALTER TABLE `__new_history` RENAME TO `history`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE TABLE `__new_tracked_downloads` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`download_client_id` integer NOT NULL,
	`download_id` text NOT NULL,
	`book_id` integer,
	`author_id` integer,
	`download_profile_id` integer,
	`show_id` integer,
	`episode_id` integer,
	`movie_id` integer,
	`release_title` text NOT NULL,
	`protocol` text NOT NULL,
	`indexer_id` integer,
	`guid` text,
	`state` text DEFAULT 'queued' NOT NULL,
	`output_path` text,
	`message` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`download_client_id`) REFERENCES `download_clients`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`book_id`) REFERENCES `books`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`author_id`) REFERENCES `authors`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`download_profile_id`) REFERENCES `download_profiles`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`show_id`) REFERENCES `shows`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`episode_id`) REFERENCES `episodes`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`movie_id`) REFERENCES `movies`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_tracked_downloads`("id", "download_client_id", "download_id", "book_id", "author_id", "download_profile_id", "show_id", "episode_id", "movie_id", "release_title", "protocol", "indexer_id", "guid", "state", "output_path", "message", "created_at", "updated_at") SELECT "id", "download_client_id", "download_id", "book_id", "author_id", "download_profile_id", "show_id", "episode_id", "movie_id", "release_title", "protocol", "indexer_id", "guid", "state", "output_path", "message", "created_at", "updated_at" FROM `tracked_downloads`;--> statement-breakpoint
DROP TABLE `tracked_downloads`;--> statement-breakpoint
ALTER TABLE `__new_tracked_downloads` RENAME TO `tracked_downloads`;