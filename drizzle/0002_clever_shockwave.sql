CREATE TABLE `movie_collections` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text NOT NULL,
	`sort_title` text NOT NULL,
	`tmdb_id` integer NOT NULL,
	`overview` text DEFAULT '' NOT NULL,
	`poster_url` text,
	`fanart_url` text,
	`monitored` integer DEFAULT false NOT NULL,
	`minimum_availability` text DEFAULT 'released' NOT NULL,
	`last_info_sync` integer,
	`created_at` integer,
	`updated_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `movie_collections_tmdb_id_unique` ON `movie_collections` (`tmdb_id`);--> statement-breakpoint
CREATE TABLE `movie_collection_download_profiles` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`collection_id` integer NOT NULL,
	`download_profile_id` integer NOT NULL,
	FOREIGN KEY (`collection_id`) REFERENCES `movie_collections`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`download_profile_id`) REFERENCES `download_profiles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `movie_collection_download_profiles_collection_id_download_profile_id_unique` ON `movie_collection_download_profiles` (`collection_id`,`download_profile_id`);--> statement-breakpoint
CREATE TABLE `movie_collection_movies` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`collection_id` integer NOT NULL,
	`tmdb_id` integer NOT NULL,
	`title` text NOT NULL,
	`overview` text DEFAULT '' NOT NULL,
	`poster_url` text,
	`release_date` text DEFAULT '' NOT NULL,
	`year` integer,
	FOREIGN KEY (`collection_id`) REFERENCES `movie_collections`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `movie_collection_movies_collection_id_tmdb_id_unique` ON `movie_collection_movies` (`collection_id`,`tmdb_id`);--> statement-breakpoint
CREATE TABLE `movie_import_list_exclusions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`tmdb_id` integer NOT NULL,
	`title` text NOT NULL,
	`year` integer,
	`created_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `movie_import_list_exclusions_tmdb_id_unique` ON `movie_import_list_exclusions` (`tmdb_id`);--> statement-breakpoint
ALTER TABLE `movies` ADD `collection_id` integer REFERENCES movie_collections(id);--> statement-breakpoint
CREATE INDEX `movies_collection_id_idx` ON `movies` (`collection_id`);