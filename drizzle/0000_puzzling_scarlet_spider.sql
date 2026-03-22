CREATE TABLE `account` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`user_id` text NOT NULL,
	`access_token` text,
	`refresh_token` text,
	`id_token` text,
	`access_token_expires_at` integer,
	`refresh_token_expires_at` integer,
	`scope` text,
	`password` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `session` (
	`id` text PRIMARY KEY NOT NULL,
	`expires_at` integer NOT NULL,
	`token` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`ip_address` text,
	`user_agent` text,
	`user_id` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `session_token_unique` ON `session` (`token`);--> statement-breakpoint
CREATE TABLE `user` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`email_verified` integer DEFAULT false NOT NULL,
	`image` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_email_unique` ON `user` (`email`);--> statement-breakpoint
CREATE TABLE `verification` (
	`id` text PRIMARY KEY NOT NULL,
	`identifier` text NOT NULL,
	`value` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer,
	`updated_at` integer
);
--> statement-breakpoint
CREATE TABLE `authors` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`sort_name` text NOT NULL,
	`slug` text,
	`bio` text,
	`born_year` integer,
	`death_year` integer,
	`status` text DEFAULT 'continuing' NOT NULL,
	`is_stub` integer DEFAULT false NOT NULL,
	`foreign_author_id` text,
	`images` text DEFAULT '[]' NOT NULL,
	`monitored` integer DEFAULT true NOT NULL,
	`tags` text DEFAULT '[]' NOT NULL,
	`metadata_updated_at` integer,
	`metadata_source_missing_since` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `author_quality_profiles` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`author_id` integer NOT NULL,
	`quality_profile_id` integer NOT NULL,
	FOREIGN KEY (`author_id`) REFERENCES `authors`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`quality_profile_id`) REFERENCES `quality_profiles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `author_quality_profiles_author_id_quality_profile_id_unique` ON `author_quality_profiles` (`author_id`,`quality_profile_id`);--> statement-breakpoint
CREATE TABLE `books` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text NOT NULL,
	`slug` text,
	`description` text,
	`release_date` text,
	`release_year` integer,
	`foreign_book_id` text,
	`images` text DEFAULT '[]' NOT NULL,
	`rating` real,
	`ratings_count` integer,
	`users_count` integer,
	`tags` text DEFAULT '[]' NOT NULL,
	`metadata_updated_at` integer,
	`metadata_source_missing_since` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `books_authors` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`book_id` integer NOT NULL,
	`author_id` integer,
	`foreign_author_id` text NOT NULL,
	`author_name` text NOT NULL,
	`is_primary` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`book_id`) REFERENCES `books`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`author_id`) REFERENCES `authors`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `books_authors_book_id_foreign_author_id_unique` ON `books_authors` (`book_id`,`foreign_author_id`);--> statement-breakpoint
CREATE TABLE `editions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`book_id` integer NOT NULL,
	`title` text NOT NULL,
	`isbn10` text,
	`isbn13` text,
	`asin` text,
	`format` text,
	`page_count` integer,
	`publisher` text,
	`edition_information` text,
	`release_date` text,
	`language` text,
	`language_code` text,
	`country` text,
	`users_count` integer,
	`score` integer,
	`foreign_edition_id` text,
	`images` text DEFAULT '[]' NOT NULL,
	`contributors` text DEFAULT '[]' NOT NULL,
	`is_default_cover` integer DEFAULT false NOT NULL,
	`metadata_updated_at` integer,
	`metadata_source_missing_since` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`book_id`) REFERENCES `books`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `edition_quality_profiles` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`edition_id` integer NOT NULL,
	`quality_profile_id` integer NOT NULL,
	FOREIGN KEY (`edition_id`) REFERENCES `editions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`quality_profile_id`) REFERENCES `quality_profiles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `edition_quality_profiles_edition_id_quality_profile_id_unique` ON `edition_quality_profiles` (`edition_id`,`quality_profile_id`);--> statement-breakpoint
CREATE TABLE `series` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text NOT NULL,
	`slug` text,
	`foreign_series_id` text,
	`description` text,
	`is_completed` integer,
	`metadata_updated_at` integer,
	`metadata_source_missing_since` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `series_book_links` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`series_id` integer NOT NULL,
	`book_id` integer NOT NULL,
	`position` text,
	FOREIGN KEY (`series_id`) REFERENCES `series`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`book_id`) REFERENCES `books`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `book_files` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`book_id` integer NOT NULL,
	`path` text NOT NULL,
	`size` integer DEFAULT 0 NOT NULL,
	`quality` text,
	`date_added` integer NOT NULL,
	FOREIGN KEY (`book_id`) REFERENCES `books`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `quality_profiles` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`root_folder_path` text DEFAULT '' NOT NULL,
	`cutoff` integer DEFAULT 0 NOT NULL,
	`items` text DEFAULT '[]' NOT NULL,
	`upgrade_allowed` integer DEFAULT false NOT NULL,
	`icon` text DEFAULT 'book-open' NOT NULL,
	`categories` text DEFAULT '[]' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `quality_definitions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text NOT NULL,
	`weight` integer DEFAULT 1 NOT NULL,
	`min_size` real DEFAULT 0,
	`max_size` real DEFAULT 0,
	`preferred_size` real DEFAULT 0,
	`color` text DEFAULT 'gray' NOT NULL,
	`specifications` text DEFAULT '[]' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `tags` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`label` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tags_label_unique` ON `tags` (`label`);--> statement-breakpoint
CREATE TABLE `history` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`event_type` text NOT NULL,
	`book_id` integer,
	`author_id` integer,
	`data` text,
	`date` integer NOT NULL,
	FOREIGN KEY (`book_id`) REFERENCES `books`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`author_id`) REFERENCES `authors`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text
);
--> statement-breakpoint
CREATE TABLE `download_clients` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`implementation` text NOT NULL,
	`protocol` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`priority` integer DEFAULT 1 NOT NULL,
	`host` text DEFAULT 'localhost' NOT NULL,
	`port` integer NOT NULL,
	`use_ssl` integer DEFAULT false NOT NULL,
	`url_base` text,
	`username` text,
	`password` text,
	`api_key` text,
	`category` text DEFAULT 'allstarr' NOT NULL,
	`settings` text,
	`created_at` integer,
	`updated_at` integer
);
--> statement-breakpoint
CREATE TABLE `indexers` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`enable_rss` integer DEFAULT true NOT NULL,
	`enable_automatic_search` integer DEFAULT true NOT NULL,
	`enable_interactive_search` integer DEFAULT true NOT NULL,
	`priority` integer DEFAULT 25 NOT NULL,
	`host` text DEFAULT 'localhost' NOT NULL,
	`port` integer DEFAULT 9696 NOT NULL,
	`use_ssl` integer DEFAULT false NOT NULL,
	`url_base` text,
	`api_key` text NOT NULL,
	`settings` text,
	`created_at` integer,
	`updated_at` integer
);
--> statement-breakpoint
CREATE TABLE `synced_indexers` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`implementation` text NOT NULL,
	`config_contract` text NOT NULL,
	`base_url` text NOT NULL,
	`api_path` text DEFAULT '/api',
	`api_key` text,
	`categories` text DEFAULT '[]',
	`enable_rss` integer DEFAULT true NOT NULL,
	`enable_search` integer DEFAULT true NOT NULL,
	`enable_automatic_search` integer DEFAULT true NOT NULL,
	`enable_interactive_search` integer DEFAULT true NOT NULL,
	`priority` integer DEFAULT 25 NOT NULL,
	`protocol` text NOT NULL,
	`created_at` integer,
	`updated_at` integer
);
--> statement-breakpoint
CREATE TABLE `blocklist` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`book_id` integer,
	`author_id` integer,
	`source_title` text NOT NULL,
	`protocol` text,
	`indexer` text,
	`message` text,
	`source` text DEFAULT 'automatic' NOT NULL,
	`date` integer NOT NULL,
	FOREIGN KEY (`book_id`) REFERENCES `books`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`author_id`) REFERENCES `authors`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `scheduled_tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`interval` integer NOT NULL,
	`last_execution` integer,
	`last_duration` integer,
	`last_result` text,
	`last_message` text,
	`enabled` integer DEFAULT true NOT NULL
);
--> statement-breakpoint
-- Seed: Quality Definitions
INSERT INTO `quality_definitions` (`title`, `weight`, `min_size`, `max_size`, `preferred_size`, `color`, `specifications`, `type`) VALUES
	('Unknown Text', 1, 0, 0, 0, 'gray', '[]', 'ebook'),
	('PDF', 2, 0, 100, 10, 'yellow', '[{"type":"releaseTitle","value":"\\bpdf\\b","negate":false,"required":true}]', 'ebook'),
	('MOBI', 3, 0, 50, 5, 'amber', '[{"type":"releaseTitle","value":"\\bmobi\\b","negate":false,"required":true}]', 'ebook'),
	('EPUB', 4, 0, 50, 5, 'green', '[{"type":"releaseTitle","value":"\\bepub\\b","negate":false,"required":true}]', 'ebook'),
	('AZW3', 5, 0, 50, 5, 'blue', '[{"type":"releaseTitle","value":"\\bazw3?\\b","negate":false,"required":true}]', 'ebook'),
	('MP3', 6, 0, 2000, 500, 'orange', '[{"type":"releaseTitle","value":"\\bmp3\\b","negate":false,"required":true}]', 'audiobook'),
	('M4B', 7, 0, 3000, 1000, 'cyan', '[{"type":"releaseTitle","value":"\\bm4b\\b","negate":false,"required":true}]', 'audiobook'),
	('FLAC', 8, 0, 5000, 2000, 'purple', '[{"type":"releaseTitle","value":"\\bflac\\b","negate":false,"required":true}]', 'audiobook'),
	('Unknown Audio', 1, 0, 0, 0, 'gray', '[]', 'audiobook');
--> statement-breakpoint
-- Seed: Quality Profiles
INSERT INTO `quality_profiles` (`name`, `root_folder_path`, `cutoff`, `icon`, `items`, `upgrade_allowed`, `categories`) VALUES
	('Ebook', './data/books', 0, 'book-marked', '[4,5,3,2]', false, '[7020,8010]'),
	('Audiobook', './data/audiobooks', 0, 'audio-lines', '[6,7,8]', false, '[3030]');
--> statement-breakpoint
-- Seed: Scheduled Tasks
INSERT INTO `scheduled_tasks` (`id`, `name`, `interval`, `enabled`) VALUES
	('rss-sync', 'RSS Sync', 900, true),
	('refresh-metadata', 'Refresh Metadata', 43200, true),
	('check-health', 'Check Health', 1500, true),
	('housekeeping', 'Housekeeping', 86400, true),
	('backup', 'Backup Database', 604800, true),
	('rescan-folders', 'Rescan Folders', 21600, true),
	('refresh-downloads', 'Refresh Downloads', 60, true);
--> statement-breakpoint
-- Seed: Default Settings
INSERT INTO `settings` (`key`, `value`) VALUES
	('naming.authorFolder', '"{Author Name}"'),
	('naming.bookFolder', '"{Book Title} ({Release Year})"'),
	('naming.bookFile', '"{Author Name} - {Book Title}"'),
	('general.logLevel', '"info"'),
	('metadata.profile', '{"skipMissingReleaseDate":false,"skipMissingIsbnAsin":false,"skipCompilations":true,"minimumPopularity":10,"minimumPages":0}');
