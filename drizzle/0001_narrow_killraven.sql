CREATE TABLE `book_import_list_exclusions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`foreign_book_id` text NOT NULL,
	`title` text NOT NULL,
	`author_name` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `book_import_list_exclusions_foreign_book_id_unique` ON `book_import_list_exclusions` (`foreign_book_id`);--> statement-breakpoint
ALTER TABLE `author_download_profiles` ADD `monitor_new_books` text DEFAULT 'all' NOT NULL;--> statement-breakpoint
ALTER TABLE `books` ADD `auto_switch_edition` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `shows` ADD `use_season_folder` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `show_download_profiles` ADD `monitor_new_seasons` text DEFAULT 'all' NOT NULL;