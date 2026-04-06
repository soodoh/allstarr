CREATE TABLE `unmapped_files` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`path` text NOT NULL,
	`size` integer DEFAULT 0 NOT NULL,
	`root_folder_path` text NOT NULL,
	`content_type` text NOT NULL,
	`format` text NOT NULL,
	`quality` text,
	`hints` text,
	`ignored` integer DEFAULT false NOT NULL,
	`date_discovered` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `unmapped_files_path_unique` ON `unmapped_files` (`path`);--> statement-breakpoint
ALTER TABLE `book_files` ADD `download_profile_id` integer REFERENCES download_profiles(id);--> statement-breakpoint
ALTER TABLE `episode_files` ADD `download_profile_id` integer REFERENCES download_profiles(id);--> statement-breakpoint
ALTER TABLE `movie_files` ADD `download_profile_id` integer REFERENCES download_profiles(id);