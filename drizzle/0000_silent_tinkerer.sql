CREATE TABLE `active_adhoc_commands` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`command_type` text NOT NULL,
	`name` text NOT NULL,
	`body` text NOT NULL,
	`progress` text,
	`started_at` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
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
CREATE TABLE `author_download_profiles` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`author_id` integer NOT NULL,
	`download_profile_id` integer NOT NULL,
	FOREIGN KEY (`author_id`) REFERENCES `authors`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`download_profile_id`) REFERENCES `download_profiles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `author_download_profiles_author_id_download_profile_id_unique` ON `author_download_profiles` (`author_id`,`download_profile_id`);--> statement-breakpoint
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
	`monitor_new_books` text DEFAULT 'all' NOT NULL,
	`tags` text DEFAULT '[]' NOT NULL,
	`metadata_updated_at` integer,
	`metadata_source_missing_since` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `blocklist` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`book_id` integer,
	`author_id` integer,
	`show_id` integer,
	`movie_id` integer,
	`source_title` text NOT NULL,
	`protocol` text,
	`indexer` text,
	`message` text,
	`source` text DEFAULT 'automatic' NOT NULL,
	`date` integer NOT NULL,
	FOREIGN KEY (`book_id`) REFERENCES `books`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`author_id`) REFERENCES `authors`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`show_id`) REFERENCES `shows`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`movie_id`) REFERENCES `movies`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `book_files` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`book_id` integer NOT NULL,
	`path` text NOT NULL,
	`size` integer DEFAULT 0 NOT NULL,
	`quality` text,
	`date_added` integer NOT NULL,
	`part` integer,
	`part_count` integer,
	`duration` integer,
	`bitrate` integer,
	`sample_rate` integer,
	`channels` integer,
	`codec` text,
	`page_count` integer,
	`language` text,
	FOREIGN KEY (`book_id`) REFERENCES `books`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `book_import_list_exclusions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`foreign_book_id` text NOT NULL,
	`title` text NOT NULL,
	`author_name` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `book_import_list_exclusions_foreign_book_id_unique` ON `book_import_list_exclusions` (`foreign_book_id`);--> statement-breakpoint
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
	`last_searched_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`auto_switch_edition` integer DEFAULT 1 NOT NULL
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
	`audio_length` integer,
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
CREATE TABLE `custom_formats` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`category` text NOT NULL,
	`specifications` text DEFAULT '[]' NOT NULL,
	`default_score` integer DEFAULT 0 NOT NULL,
	`content_types` text DEFAULT '[]' NOT NULL,
	`include_in_renaming` integer DEFAULT false NOT NULL,
	`description` text,
	`origin` text,
	`user_modified` integer DEFAULT false NOT NULL
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
	`tag` text,
	`remove_completed_downloads` integer DEFAULT true NOT NULL,
	`settings` text,
	`created_at` integer,
	`updated_at` integer
);
--> statement-breakpoint
CREATE TABLE `download_formats` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text NOT NULL,
	`weight` integer DEFAULT 1 NOT NULL,
	`min_size` real DEFAULT 0,
	`max_size` real,
	`preferred_size` real,
	`color` text DEFAULT 'gray' NOT NULL,
	`content_types` text DEFAULT '["ebook"]' NOT NULL,
	`source` text,
	`resolution` integer DEFAULT 0 NOT NULL,
	`no_max_limit` integer DEFAULT 0 NOT NULL,
	`no_preferred_limit` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `download_profiles` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`root_folder_path` text DEFAULT '' NOT NULL,
	`cutoff` integer DEFAULT 0 NOT NULL,
	`items` text DEFAULT '[]' NOT NULL,
	`upgrade_allowed` integer DEFAULT false NOT NULL,
	`icon` text DEFAULT 'book-open' NOT NULL,
	`categories` text DEFAULT '[]' NOT NULL,
	`content_type` text DEFAULT 'ebook' NOT NULL,
	`language` text DEFAULT 'en' NOT NULL,
	`min_custom_format_score` integer DEFAULT 0 NOT NULL,
	`upgrade_until_custom_format_score` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `edition_download_profiles` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`edition_id` integer NOT NULL,
	`download_profile_id` integer NOT NULL,
	FOREIGN KEY (`edition_id`) REFERENCES `editions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`download_profile_id`) REFERENCES `download_profiles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `edition_download_profiles_edition_id_download_profile_id_unique` ON `edition_download_profiles` (`edition_id`,`download_profile_id`);--> statement-breakpoint
CREATE TABLE `episode_download_profiles` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`episode_id` integer NOT NULL,
	`download_profile_id` integer NOT NULL,
	FOREIGN KEY (`episode_id`) REFERENCES `episodes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`download_profile_id`) REFERENCES `download_profiles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `episode_download_profiles_episode_id_download_profile_id_unique` ON `episode_download_profiles` (`episode_id`,`download_profile_id`);--> statement-breakpoint
CREATE TABLE `episode_files` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`episode_id` integer NOT NULL,
	`path` text NOT NULL,
	`size` integer DEFAULT 0 NOT NULL,
	`quality` text,
	`date_added` integer NOT NULL,
	`scene_name` text,
	`duration` integer,
	`codec` text,
	`container` text,
	FOREIGN KEY (`episode_id`) REFERENCES `episodes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `history` (
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
CREATE TABLE `indexers` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`implementation` text DEFAULT 'Newznab' NOT NULL,
	`protocol` text DEFAULT 'usenet' NOT NULL,
	`base_url` text NOT NULL,
	`api_path` text DEFAULT '/api',
	`api_key` text NOT NULL,
	`categories` text DEFAULT '[]',
	`enable_rss` integer DEFAULT true NOT NULL,
	`enable_automatic_search` integer DEFAULT true NOT NULL,
	`enable_interactive_search` integer DEFAULT true NOT NULL,
	`priority` integer DEFAULT 25 NOT NULL,
	`tag` text,
	`download_client_id` integer,
	`request_interval` integer DEFAULT 5000 NOT NULL,
	`daily_query_limit` integer DEFAULT 0 NOT NULL,
	`daily_grab_limit` integer DEFAULT 0 NOT NULL,
	`backoff_until` integer DEFAULT 0 NOT NULL,
	`escalation_level` integer DEFAULT 0 NOT NULL,
	`created_at` integer,
	`updated_at` integer,
	FOREIGN KEY (`download_client_id`) REFERENCES `download_clients`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
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
CREATE TABLE `movie_download_profiles` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`movie_id` integer NOT NULL,
	`download_profile_id` integer NOT NULL,
	FOREIGN KEY (`movie_id`) REFERENCES `movies`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`download_profile_id`) REFERENCES `download_profiles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `movie_download_profiles_movie_id_download_profile_id_unique` ON `movie_download_profiles` (`movie_id`,`download_profile_id`);--> statement-breakpoint
CREATE TABLE `movie_files` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`movie_id` integer NOT NULL,
	`path` text NOT NULL,
	`size` integer DEFAULT 0 NOT NULL,
	`quality` text,
	`date_added` integer NOT NULL,
	`scene_name` text,
	`duration` integer,
	`codec` text,
	`container` text,
	FOREIGN KEY (`movie_id`) REFERENCES `movies`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `movie_import_list_exclusions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`tmdb_id` integer NOT NULL,
	`title` text NOT NULL,
	`year` integer,
	`created_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `movie_import_list_exclusions_tmdb_id_unique` ON `movie_import_list_exclusions` (`tmdb_id`);--> statement-breakpoint
CREATE TABLE `movies` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text NOT NULL,
	`sort_title` text NOT NULL,
	`overview` text DEFAULT '' NOT NULL,
	`tmdb_id` integer NOT NULL,
	`imdb_id` text,
	`status` text DEFAULT 'announced' NOT NULL,
	`studio` text DEFAULT '' NOT NULL,
	`year` integer DEFAULT 0 NOT NULL,
	`runtime` integer DEFAULT 0 NOT NULL,
	`genres` text,
	`tags` text,
	`poster_url` text DEFAULT '' NOT NULL,
	`fanart_url` text DEFAULT '' NOT NULL,
	`minimum_availability` text DEFAULT 'released' NOT NULL,
	`path` text DEFAULT '' NOT NULL,
	`collection_id` integer,
	`last_searched_at` integer,
	`created_at` integer,
	`updated_at` integer,
	FOREIGN KEY (`collection_id`) REFERENCES `movie_collections`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `movies_collection_id_idx` ON `movies` (`collection_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `movies_tmdb_id_unique` ON `movies` (`tmdb_id`);--> statement-breakpoint
CREATE TABLE `profile_custom_formats` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`profile_id` integer NOT NULL,
	`custom_format_id` integer NOT NULL,
	`score` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`profile_id`) REFERENCES `download_profiles`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`custom_format_id`) REFERENCES `custom_formats`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `profile_custom_format_idx` ON `profile_custom_formats` (`profile_id`,`custom_format_id`);--> statement-breakpoint
CREATE TABLE `scheduled_tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`interval` integer NOT NULL,
	`last_execution` integer,
	`last_duration` integer,
	`last_result` text,
	`last_message` text,
	`enabled` integer DEFAULT true NOT NULL,
	`progress` text,
	`group` text DEFAULT 'maintenance' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `series` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text NOT NULL,
	`slug` text,
	`foreign_series_id` text,
	`description` text,
	`is_completed` integer,
	`metadata_updated_at` integer,
	`metadata_source_missing_since` integer,
	`created_at` integer NOT NULL,
	`monitored` integer DEFAULT false NOT NULL,
	`updated_at` integer
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
CREATE TABLE `series_download_profiles` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`series_id` integer NOT NULL,
	`download_profile_id` integer NOT NULL,
	FOREIGN KEY (`series_id`) REFERENCES `series`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`download_profile_id`) REFERENCES `download_profiles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `series_download_profiles_series_id_download_profile_id_unique` ON `series_download_profiles` (`series_id`,`download_profile_id`);--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text
);
--> statement-breakpoint
CREATE TABLE `show_download_profiles` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`show_id` integer NOT NULL,
	`download_profile_id` integer NOT NULL,
	FOREIGN KEY (`show_id`) REFERENCES `shows`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`download_profile_id`) REFERENCES `download_profiles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `show_download_profiles_show_id_download_profile_id_unique` ON `show_download_profiles` (`show_id`,`download_profile_id`);--> statement-breakpoint
CREATE TABLE `episodes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`show_id` integer NOT NULL,
	`season_id` integer NOT NULL,
	`episode_number` integer NOT NULL,
	`absolute_number` integer,
	`title` text DEFAULT '' NOT NULL,
	`overview` text,
	`air_date` text,
	`runtime` integer,
	`tmdb_id` integer NOT NULL,
	`has_file` integer DEFAULT false,
	`last_searched_at` integer,
	FOREIGN KEY (`show_id`) REFERENCES `shows`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`season_id`) REFERENCES `seasons`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `episodes_tmdb_id_unique` ON `episodes` (`tmdb_id`);--> statement-breakpoint
CREATE TABLE `seasons` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`show_id` integer NOT NULL,
	`season_number` integer NOT NULL,
	`overview` text,
	`poster_url` text,
	FOREIGN KEY (`show_id`) REFERENCES `shows`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `seasons_show_season_unique` ON `seasons` (`show_id`,`season_number`);--> statement-breakpoint
CREATE TABLE `shows` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text NOT NULL,
	`sort_title` text NOT NULL,
	`overview` text DEFAULT '' NOT NULL,
	`tmdb_id` integer NOT NULL,
	`imdb_id` text,
	`status` text DEFAULT 'continuing' NOT NULL,
	`series_type` text DEFAULT 'standard' NOT NULL,
	`network` text DEFAULT '' NOT NULL,
	`year` integer DEFAULT 0 NOT NULL,
	`runtime` integer DEFAULT 0 NOT NULL,
	`genres` text,
	`tags` text,
	`poster_url` text DEFAULT '' NOT NULL,
	`fanart_url` text DEFAULT '' NOT NULL,
	`path` text DEFAULT '' NOT NULL,
	`created_at` integer,
	`updated_at` integer,
	`use_season_folder` integer DEFAULT 1 NOT NULL,
	`monitor_new_seasons` text DEFAULT 'all' NOT NULL,
	`episode_group_id` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `shows_tmdb_id_unique` ON `shows` (`tmdb_id`);--> statement-breakpoint
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
	`tag` text,
	`download_client_id` integer,
	`request_interval` integer DEFAULT 5000 NOT NULL,
	`daily_query_limit` integer DEFAULT 0 NOT NULL,
	`daily_grab_limit` integer DEFAULT 0 NOT NULL,
	`backoff_until` integer DEFAULT 0 NOT NULL,
	`escalation_level` integer DEFAULT 0 NOT NULL,
	`created_at` integer,
	`updated_at` integer,
	FOREIGN KEY (`download_client_id`) REFERENCES `download_clients`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `tags` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`label` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tags_label_unique` ON `tags` (`label`);--> statement-breakpoint
CREATE TABLE `tracked_downloads` (
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
CREATE TABLE `user_settings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`table_id` text NOT NULL,
	`column_order` text NOT NULL,
	`hidden_columns` text NOT NULL,
	`view_mode` text,
	`add_defaults` text,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_settings_user_table_idx` ON `user_settings` (`user_id`,`table_id`);
-- ============================================================
-- Seed Data
-- ============================================================

-- Download Formats: Ebook
INSERT INTO download_formats (title, weight, min_size, max_size, preferred_size, color, content_types, no_max_limit, no_preferred_limit) VALUES
  ('Unknown Text', 1, 0,    100,  100,  'gray',   '["ebook"]', 1, 1),
  ('PDF',          2, 0,    50,   5,    'yellow', '["ebook"]', 0, 0),
  ('MOBI',         3, 0,    15,   2,    'amber',  '["ebook"]', 0, 0),
  ('EPUB',         4, 0,    15,   1.5,  'green',  '["ebook"]', 0, 0),
  ('AZW3',         5, 0,    15,   2,    'blue',   '["ebook"]', 0, 0);--> statement-breakpoint

-- Download Formats: Audio
INSERT INTO download_formats (title, weight, min_size, max_size, preferred_size, color, content_types, no_max_limit, no_preferred_limit) VALUES
  ('Unknown Audio', 1, 0,    1500, 1500, 'gray',   '["audiobook"]', 1, 1),
  ('MP3',           6, 0,    350,  195,  'orange', '["audiobook"]', 0, 0),
  ('M4B',           7, 0,    350,  195,  'cyan',   '["audiobook"]', 0, 0),
  ('FLAC',          8, 0,    1500, 895,  'purple', '["audiobook"]', 1, 0);--> statement-breakpoint

-- Download Formats: Comic
INSERT INTO download_formats (title, weight, min_size, max_size, preferred_size, color, content_types, no_max_limit, no_preferred_limit) VALUES
  ('Unknown Comic', 1, 0,   300, 100, 'gray',   '["ebook"]', 1, 1),
  ('CBR',           2, 0,   300, 100, 'orange', '["ebook"]', 0, 0),
  ('CBZ',           3, 0,   300, 100, 'green',  '["ebook"]', 0, 0),
  ('PDF',           4, 0,   300, 100, 'yellow', '["ebook"]', 0, 0),
  ('EPUB',          5, 0,   300, 100, 'blue',   '["ebook"]', 0, 0);--> statement-breakpoint

-- Download Formats: Video
INSERT INTO download_formats (title, weight, min_size, max_size, preferred_size, color, content_types, source, resolution, no_max_limit, no_preferred_limit) VALUES
  ('Unknown Video',  0,  0,     2000, 2000, 'gray',   '["movie","tv"]', 'Unknown',    0,    1, 1),
  ('SDTV',           1,  5,     2000, 2000, 'gray',   '["movie","tv"]', 'Television', 480,  1, 1),
  ('WEBRip-480p',    2,  5,     2000, 2000, 'gray',   '["movie","tv"]', 'WebRip',     480,  1, 1),
  ('WEBDL-480p',     3,  5,     2000, 2000, 'gray',   '["movie","tv"]', 'Web',        480,  1, 1),
  ('DVD',            4,  5,     2000, 2000, 'yellow', '["movie","tv"]', 'DVD',        480,  1, 1),
  ('Bluray-480p',    5,  5,     2000, 2000, 'gray',   '["movie","tv"]', 'Bluray',     480,  1, 1),
  ('HDTV-720p',      10, 10,    2000, 2000, 'green',  '["movie","tv"]', 'Television', 720,  1, 1),
  ('WEBRip-720p',    11, 10,    2000, 2000, 'green',  '["movie","tv"]', 'WebRip',     720,  1, 1),
  ('WEBDL-720p',     12, 10,    2000, 2000, 'green',  '["movie","tv"]', 'Web',        720,  1, 1),
  ('Bluray-720p',    13, 17.1,  2000, 2000, 'green',  '["movie","tv"]', 'Bluray',     720,  1, 1),
  ('HDTV-1080p',     20, 15,    2000, 2000, 'green',  '["movie","tv"]', 'Television', 1080, 1, 1),
  ('WEBRip-1080p',   21, 15,    2000, 2000, 'green',  '["movie","tv"]', 'WebRip',     1080, 1, 1),
  ('WEBDL-1080p',    22, 15,    2000, 2000, 'green',  '["movie","tv"]', 'Web',        1080, 1, 1),
  ('Bluray-1080p',   23, 50.4,  2000, 2000, 'blue',   '["movie","tv"]', 'Bluray',     1080, 1, 1),
  ('Remux-1080p',    24, 69.1,  2000, 2000, 'cyan',   '["movie","tv"]', 'BlurayRaw',  1080, 1, 1),
  ('HDTV-2160p',     30, 25,    2000, 2000, 'purple', '["movie","tv"]', 'Television', 2160, 1, 1),
  ('WEBRip-2160p',   31, 25,    2000, 2000, 'purple', '["movie","tv"]', 'WebRip',     2160, 1, 1),
  ('WEBDL-2160p',    32, 25,    2000, 2000, 'purple', '["movie","tv"]', 'Web',        2160, 1, 1),
  ('Bluray-2160p',   33, 94.6,  2000, 2000, 'purple', '["movie","tv"]', 'Bluray',     2160, 1, 1),
  ('Remux-2160p',    34, 187.4, 2000, 2000, 'purple', '["movie","tv"]', 'BlurayRaw',  2160, 1, 1);--> statement-breakpoint

-- Download Profiles: Book
INSERT INTO download_profiles (name, root_folder_path, cutoff, items, upgrade_allowed, icon, categories, content_type, language, min_custom_format_score, upgrade_until_custom_format_score) VALUES
  ('Ebook',     './data/books',      0, '[[4],[5],[3],[2]]', 0, 'book-marked',  '[7020,8010]', 'ebook',     'en', 0, 2000),
  ('Audiobook', './data/audiobooks', 0, '[[7],[8],[6]]',     0, 'audio-lines',  '[3030]',      'audiobook', 'en', 0, 1000);--> statement-breakpoint

-- Download Profiles: Comics/Manga
INSERT INTO download_profiles (name, root_folder_path, cutoff, items, upgrade_allowed, icon, categories, content_type, language, min_custom_format_score, upgrade_until_custom_format_score) VALUES
  ('Comics/Manga', './data/comics', 0, '[]', 0, 'book-open-text', '[]', 'ebook', 'en', 0, 0);--> statement-breakpoint

-- Download Profiles: Video (items populated via UPDATE below)
INSERT INTO download_profiles (name, root_folder_path, cutoff, items, upgrade_allowed, icon, categories, content_type, language, min_custom_format_score, upgrade_until_custom_format_score) VALUES
  ('1080p (TV)',        './data/tv_shows/1080p/', 0, '[]', 1, 'tv',   '[5030,5040,5045]',      'tv',    'en', 0, 5000),
  ('4k (TV)',           './data/tv_shows/4k/',   0, '[]', 1, 'hd',   '[5030,5040,5045]',      'tv',    'en', 0, 5000),
  ('720-1080p (Movie)', './data/movies/1080p/',  0, '[]', 1, 'clapperboard', '[2030,2040,2045,2050]', 'movie', 'en', 0, 10000),
  ('4k (Movie)',        './data/movies/4k/',     0, '[]', 1, 'hd',   '[2030,2040,2045,2050]', 'movie', 'en', 0, 10000);--> statement-breakpoint

--> statement-breakpoint

-- Download Profile: Anime 1080p (was missing from original migrations)
INSERT INTO download_profiles (name, root_folder_path, cutoff, items, upgrade_allowed, icon, categories, content_type, language, min_custom_format_score, upgrade_until_custom_format_score) VALUES
  ('Anime 1080p', './data/tv_shows/anime/', 0, '[]', 1, 'tv', '[5030,5040,5045]', 'tv', 'en', 0, 5000);--> statement-breakpoint

-- Video profile items (grouped format arrays)
UPDATE download_profiles SET
  cutoff = (SELECT id FROM download_formats WHERE title = 'WEBDL-1080p' AND content_types LIKE '%"movie"%' LIMIT 1),
  items = json_array(
    json_array((SELECT id FROM download_formats WHERE title = 'WEBDL-1080p'  AND content_types LIKE '%"movie"%' LIMIT 1)),
    json_array((SELECT id FROM download_formats WHERE title = 'WEBRip-1080p' AND content_types LIKE '%"movie"%' LIMIT 1)),
    json_array((SELECT id FROM download_formats WHERE title = 'HDTV-1080p'   AND content_types LIKE '%"movie"%' LIMIT 1))
  )
WHERE name = '1080p (TV)';--> statement-breakpoint

UPDATE download_profiles SET
  cutoff = (SELECT id FROM download_formats WHERE title = 'WEBDL-2160p' AND content_types LIKE '%"movie"%' LIMIT 1),
  items = json_array(
    json_array((SELECT id FROM download_formats WHERE title = 'WEBDL-2160p'  AND content_types LIKE '%"movie"%' LIMIT 1)),
    json_array((SELECT id FROM download_formats WHERE title = 'WEBRip-2160p' AND content_types LIKE '%"movie"%' LIMIT 1)),
    json_array((SELECT id FROM download_formats WHERE title = 'Bluray-2160p' AND content_types LIKE '%"movie"%' LIMIT 1))
  )
WHERE name = '4k (TV)';--> statement-breakpoint

UPDATE download_profiles SET
  cutoff = (SELECT id FROM download_formats WHERE title = 'Bluray-1080p' AND content_types LIKE '%"movie"%' LIMIT 1),
  items = json_array(
    json_array((SELECT id FROM download_formats WHERE title = 'Bluray-1080p'  AND content_types LIKE '%"movie"%' LIMIT 1)),
    json_array((SELECT id FROM download_formats WHERE title = 'WEBDL-1080p'   AND content_types LIKE '%"movie"%' LIMIT 1)),
    json_array((SELECT id FROM download_formats WHERE title = 'WEBRip-1080p'  AND content_types LIKE '%"movie"%' LIMIT 1)),
    json_array((SELECT id FROM download_formats WHERE title = 'Bluray-720p'   AND content_types LIKE '%"movie"%' LIMIT 1)),
    json_array((SELECT id FROM download_formats WHERE title = 'WEBDL-720p'    AND content_types LIKE '%"movie"%' LIMIT 1)),
    json_array((SELECT id FROM download_formats WHERE title = 'WEBRip-720p'   AND content_types LIKE '%"movie"%' LIMIT 1))
  )
WHERE name = '720-1080p (Movie)';--> statement-breakpoint

UPDATE download_profiles SET
  cutoff = (SELECT id FROM download_formats WHERE title = 'Remux-2160p' AND content_types LIKE '%"movie"%' LIMIT 1),
  items = json_array(
    json_array((SELECT id FROM download_formats WHERE title = 'Remux-2160p'  AND content_types LIKE '%"movie"%' LIMIT 1)),
    json_array((SELECT id FROM download_formats WHERE title = 'Bluray-2160p' AND content_types LIKE '%"movie"%' LIMIT 1)),
    json_array((SELECT id FROM download_formats WHERE title = 'WEBDL-2160p'  AND content_types LIKE '%"movie"%' LIMIT 1)),
    json_array((SELECT id FROM download_formats WHERE title = 'WEBRip-2160p' AND content_types LIKE '%"movie"%' LIMIT 1)),
    json_array((SELECT id FROM download_formats WHERE title = 'Remux-1080p'  AND content_types LIKE '%"movie"%' LIMIT 1)),
    json_array((SELECT id FROM download_formats WHERE title = 'Bluray-1080p' AND content_types LIKE '%"movie"%' LIMIT 1)),
    json_array((SELECT id FROM download_formats WHERE title = 'WEBDL-1080p'  AND content_types LIKE '%"movie"%' LIMIT 1))
  )
WHERE name = '4k (Movie)';--> statement-breakpoint

-- Comics/Manga profile items (grouped format arrays)
UPDATE download_profiles SET
  items = (
    SELECT json_array(
      json_array((SELECT id FROM download_formats WHERE title = 'CBZ'  AND content_types LIKE '%"ebook"%' AND weight = 3 LIMIT 1)),
      json_array((SELECT id FROM download_formats WHERE title = 'CBR'  AND content_types LIKE '%"ebook"%' AND weight = 2 LIMIT 1)),
      json_array((SELECT id FROM download_formats WHERE title = 'EPUB' AND content_types LIKE '%"ebook"%' AND weight = 5 LIMIT 1)),
      json_array((SELECT id FROM download_formats WHERE title = 'PDF'  AND content_types LIKE '%"ebook"%' AND weight = 4 LIMIT 1))
    )
  )
WHERE name = 'Comics/Manga' AND content_type = 'ebook';--> statement-breakpoint

UPDATE download_profiles SET
  cutoff = (SELECT id FROM download_formats WHERE title = 'Remux-1080p' AND content_types LIKE '%"movie"%' LIMIT 1),
  items = json_array(
    json_array(
      (SELECT id FROM download_formats WHERE title = 'Remux-1080p'  AND content_types LIKE '%"movie"%' LIMIT 1),
      (SELECT id FROM download_formats WHERE title = 'Bluray-1080p' AND content_types LIKE '%"movie"%' LIMIT 1)
    ),
    json_array(
      (SELECT id FROM download_formats WHERE title = 'WEBDL-1080p'  AND content_types LIKE '%"movie"%' LIMIT 1),
      (SELECT id FROM download_formats WHERE title = 'WEBRip-1080p' AND content_types LIKE '%"movie"%' LIMIT 1),
      (SELECT id FROM download_formats WHERE title = 'HDTV-1080p'   AND content_types LIKE '%"movie"%' LIMIT 1)
    ),
    json_array(
      (SELECT id FROM download_formats WHERE title = 'WEBDL-720p'  AND content_types LIKE '%"movie"%' LIMIT 1),
      (SELECT id FROM download_formats WHERE title = 'WEBRip-720p' AND content_types LIKE '%"movie"%' LIMIT 1),
      (SELECT id FROM download_formats WHERE title = 'HDTV-720p'   AND content_types LIKE '%"movie"%' LIMIT 1)
    )
  )
WHERE name = 'Anime 1080p';--> statement-breakpoint

-- Scheduled Tasks (final state with groups)
INSERT INTO scheduled_tasks (id, name, interval, enabled, "group") VALUES
  ('rss-sync',                   'RSS Sync',                   900,    1, 'search'),
  ('refresh-hardcover-metadata', 'Refresh Hardcover Metadata', 43200,  1, 'metadata'),
  ('check-health',               'Check Health',               1500,   1, 'maintenance'),
  ('housekeeping',               'Housekeeping',               86400,  1, 'maintenance'),
  ('backup',                     'Backup Database',            604800, 1, 'maintenance'),
  ('rescan-folders',             'Rescan Folders',             21600,  1, 'media'),
  ('refresh-downloads',          'Refresh Downloads',          60,     1, 'media'),
  ('refresh-tmdb-metadata',      'Refresh TMDB Metadata',      43200,  1, 'metadata');--> statement-breakpoint

-- Settings
INSERT INTO settings (key, value) VALUES
  ('general.logLevel',       '"info"'),
  ('metadata.hardcover.profile', '{"skipMissingReleaseDate":true,"skipMissingIsbnAsin":true,"skipCompilations":true,"minimumPopularity":10,"minimumPages":0}'),
  ('format.ebook.defaultPageCount',      '300'),
  ('format.audiobook.defaultDuration',   '600'),
  ('format.movie.defaultRuntime',        '130'),
  ('format.tv.defaultEpisodeRuntime',    '45'),
  ('metadata.tmdb.language',     '"en"'),
  ('metadata.tmdb.includeAdult', 'false'),
  ('metadata.tmdb.region',       '""'),
  ('naming.book.ebook.bookFile',      '"{Author Name} - {Book Title}"'),
  ('naming.book.ebook.authorFolder',  '"{Author Name}"'),
  ('naming.book.ebook.bookFolder',    '"{Book Title} ({Release Year})"'),
  ('naming.book.audio.bookFile',      '"{Author Name} - {Book Title} - Part {PartNumber:00}"'),
  ('naming.book.audio.authorFolder',  '"{Author Name}"'),
  ('naming.book.audio.bookFolder',    '"{Book Title} ({Release Year})"'),
  ('naming.tv.seriesFolder',    '"{Series Title} ({Series Year})"'),
  ('naming.tv.seasonFolder',    '"Season {season:00}"'),
  ('naming.tv.episodeFile',     '"{Series Title} - S{season:00}E{episode:00} - {Episode Title}"'),
  ('naming.movie.movieFolder',  '"{Movie Title} ({Release Year})"'),
  ('naming.movie.movieFile',    '"{Movie Title} ({Release Year}) {Quality Full}"'),
  ('mediaManagement.book.extraFileExtensions',      '""'),
  ('mediaManagement.book.renameBooks',               'false'),
  ('mediaManagement.book.replaceIllegalCharacters',  'true'),
  ('mediaManagement.book.createEmptyAuthorFolders',  'false'),
  ('mediaManagement.book.deleteEmptyAuthorFolders',  'false'),
  ('mediaManagement.book.useHardLinks',              'true'),
  ('mediaManagement.book.skipFreeSpaceCheck',        'false'),
  ('mediaManagement.book.minimumFreeSpace',          '"100"'),
  ('mediaManagement.book.importExtraFiles',          'false'),
  ('mediaManagement.book.propersAndRepacks',         '"preferAndUpgrade"'),
  ('mediaManagement.book.ignoreDeletedBooks',        'false'),
  ('mediaManagement.book.changeFileDate',            '"none"'),
  ('mediaManagement.book.recyclingBin',              '""'),
  ('mediaManagement.book.recyclingBinCleanup',       '"7"'),
  ('mediaManagement.book.setPermissions',            'false'),
  ('mediaManagement.book.fileChmod',                 '"0644"'),
  ('mediaManagement.book.folderChmod',               '"0755"'),
  ('mediaManagement.book.chownGroup',                '""');--> statement-breakpoint

INSERT INTO custom_formats (name, category, specifications, default_score, content_types, description, origin, user_modified)
VALUES ('Anime BD Tier 01', 'Release Group', '[{"name":"Bluray","type":"videoSource","value":"Bluray","negate":false,"required":false},{"name":"Bluray Remux","type":"videoSource","value":"BlurayRaw","negate":false,"required":false},{"name":"DVD","type":"videoSource","value":"DVD","negate":false,"required":false},{"name":"DemiHuman","type":"releaseTitle","value":"\\b(DemiHuman)\\b","negate":false,"required":false},{"name":"FLE","type":"releaseTitle","value":"\\b(FLE)\\b","negate":false,"required":false},{"name":"Flugel","type":"releaseTitle","value":"\\b(Flugel)\\b","negate":false,"required":false},{"name":"LYS1TH3A","type":"releaseTitle","value":"\\b(LYS1TH3A)\\b","negate":false,"required":false},{"name":"Moxie","type":"releaseTitle","value":"\\[Moxie\\]|-Moxie\\b","negate":false,"required":false},{"name":"NAN0","type":"releaseTitle","value":"(?<=remux).*\\b(NAN0)\\b","negate":false,"required":false},{"name":"sam","type":"releaseTitle","value":"\\[sam\\]|-sam\\b","negate":false,"required":false},{"name":"smol","type":"releaseTitle","value":"\\[smol\\]|-smol\\b","negate":false,"required":false},{"name":"SoM","type":"releaseTitle","value":"\\[SoM\\]|-SoM\\b","negate":false,"required":false},{"name":"ZR","type":"releaseTitle","value":"\\b(ZR)\\b|-ZR-","negate":false,"required":false}]', 1400, '["tv"]', 'Anime BD Tier 01 fansub release groups for Bluray sources', 'builtin', 0);--> statement-breakpoint
INSERT INTO custom_formats (name, category, specifications, default_score, content_types, description, origin, user_modified)
VALUES ('Anime BD Tier 02', 'Release Group', '[{"name":"Bluray","type":"videoSource","value":"Bluray","negate":false,"required":false},{"name":"Bluray Remux","type":"videoSource","value":"BlurayRaw","negate":false,"required":false},{"name":"DVD","type":"videoSource","value":"DVD","negate":false,"required":false},{"name":"Aergia","type":"releaseTitle","value":"\\[Aergia\\]|-Aergia(?!-raws)\\b","negate":false,"required":false},{"name":"Arg0","type":"releaseTitle","value":"\\b(Arg0)\\b","negate":false,"required":false},{"name":"Arid","type":"releaseTitle","value":"\\[Arid\\]|-Arid\\b","negate":false,"required":false},{"name":"FateSucks","type":"releaseTitle","value":"\\b(FateSucks)\\b","negate":false,"required":false},{"name":"hydes","type":"releaseTitle","value":"\\b(hydes)\\b","negate":false,"required":false},{"name":"hchcsen","type":"releaseTitle","value":"\\b(hchcsen)\\b","negate":false,"required":false},{"name":"JOHNTiTOR","type":"releaseTitle","value":"\\b(JOHNTiTOR)\\b","negate":false,"required":false},{"name":"JySzE","type":"releaseTitle","value":"\\b(JySzE)\\b","negate":false,"required":false},{"name":"koala","type":"releaseTitle","value":"\\[koala\\]|-koala\\b","negate":false,"required":false},{"name":"Kulot","type":"releaseTitle","value":"\\b(Kulot)\\b","negate":false,"required":false},{"name":"LostYears","type":"releaseTitle","value":"\\b(LostYears)\\b","negate":false,"required":false},{"name":"Lulu","type":"releaseTitle","value":"\\[Lulu\\]|-Lulu\\b","negate":false,"required":false},{"name":"Meakes","type":"releaseTitle","value":"\\b(Meakes)\\b","negate":false,"required":false},{"name":"Orphan","type":"releaseTitle","value":"\\[Orphan\\]|-Orphan\\b","negate":false,"required":false},{"name":"PMR","type":"releaseTitle","value":"^(?=.*\\b(PMR)\\b)(?=.*\\b(Remux)\\b)","negate":false,"required":false},{"name":"Vodes","type":"releaseTitle","value":"\\[Vodes\\]|(?<!Not)-Vodes\\b","negate":false,"required":false},{"name":"WAP","type":"releaseTitle","value":"\\b(WAP)\\b","negate":false,"required":false},{"name":"YURI","type":"releaseTitle","value":"\\[YURI\\]|-YURI\\b","negate":false,"required":false},{"name":"ZeroBuild","type":"releaseTitle","value":"\\b(ZeroBuild)\\b","negate":false,"required":false}]', 1300, '["tv"]', 'Anime BD Tier 02 fansub release groups for Bluray sources', 'builtin', 0);--> statement-breakpoint
INSERT INTO custom_formats (name, category, specifications, default_score, content_types, description, origin, user_modified)
VALUES ('Anime BD Tier 03', 'Release Group', '[{"name":"Bluray","type":"videoSource","value":"Bluray","negate":false,"required":false},{"name":"Bluray Remux","type":"videoSource","value":"BlurayRaw","negate":false,"required":false},{"name":"DVD","type":"videoSource","value":"DVD","negate":false,"required":false},{"name":"ARC","type":"releaseTitle","value":"\\[ARC\\]|-ARC\\b","negate":false,"required":false},{"name":"BBT-RMX","type":"releaseTitle","value":"\\b(BBT-RMX)\\b","negate":false,"required":false},{"name":"cappybara","type":"releaseTitle","value":"\\[cappybara\\]|-cappybara\\b","negate":false,"required":false},{"name":"ChucksMux","type":"releaseTitle","value":"\\b(ChucksMux)\\b","negate":false,"required":false},{"name":"CRUCiBLE","type":"releaseTitle","value":"\\[CRUCiBLE\\]|-CRUCiBLE\\b","negate":false,"required":false},{"name":"CUNNY","type":"releaseTitle","value":"\\b(CUNNY)\\b","negate":false,"required":false},{"name":"Cunnysseur","type":"releaseTitle","value":"\\b(Cunnysseur)\\b","negate":false,"required":false},{"name":"Doc","type":"releaseTitle","value":"\\[Doc\\]|-Doc\\b","negate":false,"required":false},{"name":"fig","type":"releaseTitle","value":"\\[fig\\]|-fig\\b","negate":false,"required":false},{"name":"Headpatter","type":"releaseTitle","value":"\\[Headpatter\\]|-Headpatter\\b","negate":false,"required":false},{"name":"Inka-Subs","type":"releaseTitle","value":"\\b(Inka-Subs)\\b","negate":false,"required":false},{"name":"LaCroiX","type":"releaseTitle","value":"\\b(LaCroiX)\\b","negate":false,"required":false},{"name":"Legion","type":"releaseTitle","value":"\\[Legion\\]|-Legion\\b","negate":false,"required":false},{"name":"Mehul","type":"releaseTitle","value":"\\[Mehul\\]|-Mehul\\b","negate":false,"required":false},{"name":"MTBB","type":"releaseTitle","value":"\\b(MTBB)\\b","negate":false,"required":false},{"name":"Mysteria","type":"releaseTitle","value":"\\[Mysteria\\]|-Mysteria\\b","negate":false,"required":false},{"name":"Netaro","type":"releaseTitle","value":"\\b(Netaro)\\b","negate":false,"required":false},{"name":"Noiy","type":"releaseTitle","value":"\\b(Noiy)\\b","negate":false,"required":false},{"name":"npz","type":"releaseTitle","value":"\\b(npz)\\b","negate":false,"required":false},{"name":"NTRX","type":"releaseTitle","value":"\\b(NTRX)\\b","negate":false,"required":false},{"name":"Okay-Subs","type":"releaseTitle","value":"\\b(Okay-Subs)\\b","negate":false,"required":false},{"name":"P9","type":"releaseTitle","value":"\\b(P9)\\b","negate":false,"required":false},{"name":"RUDY","type":"releaseTitle","value":"\\[RUDY\\]|-RUDY\\b","negate":false,"required":false},{"name":"RaiN","type":"releaseTitle","value":"\\[RaiN\\]|-RaiN\\b","negate":false,"required":false},{"name":"RMX","type":"releaseTitle","value":"\\b(RMX)\\b","negate":false,"required":false},{"name":"Sekkon","type":"releaseTitle","value":"\\b(Sekkon)\\b","negate":false,"required":false},{"name":"Serendipity","type":"releaseTitle","value":"\\[Serendipity\\]|-Serendipity\\b","negate":false,"required":false},{"name":"sgt","type":"releaseTitle","value":"\\[sgt\\]|-sgt\\b","negate":false,"required":false},{"name":"SubsMix","type":"releaseTitle","value":"\\b(SubsMix)\\b","negate":false,"required":false},{"name":"uba","type":"releaseTitle","value":"\\[uba\\]|-uba\\b","negate":false,"required":false}]', 1200, '["tv"]', 'Anime BD Tier 03 fansub release groups for Bluray sources', 'builtin', 0);--> statement-breakpoint
INSERT INTO custom_formats (name, category, specifications, default_score, content_types, description, origin, user_modified)
VALUES ('Anime BD Tier 04', 'Release Group', '[{"name":"Bluray","type":"videoSource","value":"Bluray","negate":false,"required":false},{"name":"Bluray Remux","type":"videoSource","value":"BlurayRaw","negate":false,"required":false},{"name":"DVD","type":"videoSource","value":"DVD","negate":false,"required":false},{"name":"ABdex","type":"releaseTitle","value":"\\b(ABdex)\\b","negate":false,"required":false},{"name":"Afro","type":"releaseTitle","value":"\\[Afro\\]|-Afro\\b","negate":false,"required":false},{"name":"aRMX","type":"releaseTitle","value":"\\b(aRMX)\\b","negate":false,"required":false},{"name":"BiRJU","type":"releaseTitle","value":"\\b(BiRJU)\\b","negate":false,"required":false},{"name":"BKC","type":"releaseTitle","value":"\\b(BKC)\\b","negate":false,"required":false},{"name":"CBT","type":"releaseTitle","value":"\\b(CBT)\\b","negate":false,"required":false},{"name":"Chimera","type":"releaseTitle","value":"\\[Chimera\\]|-Chimera\\b","negate":false,"required":false},{"name":"derp","type":"releaseTitle","value":"\\[derp\\]|-derp\\b","negate":false,"required":false},{"name":"DIY","type":"releaseTitle","value":"\\[DIY\\]|-DIY\\b","negate":false,"required":false},{"name":"EXP","type":"releaseTitle","value":"\\[EXP\\]|-EXP\\b","negate":false,"required":false},{"name":"Foxtrot","type":"releaseTitle","value":"\\[Foxtrot\\]|-Foxtrot\\b","negate":false,"required":false},{"name":"grimf","type":"releaseTitle","value":"\\b(grimf)\\b","negate":false,"required":false},{"name":"IK","type":"releaseTitle","value":"\\b(IK)\\b","negate":false,"required":false},{"name":"Iznjie Biznjie","type":"releaseTitle","value":"\\b(Iznjie[ .-]Biznjie)\\b","negate":false,"required":false},{"name":"Kaleido-subs","type":"releaseTitle","value":"\\b(Kaleido-subs)\\b","negate":false,"required":false},{"name":"Kametsu","type":"releaseTitle","value":"\\b(Kametsu)\\b","negate":false,"required":false},{"name":"Kawatare","type":"releaseTitle","value":"\\[Kawatare\\]|-Kawatare\\b","negate":false,"required":false},{"name":"KH","type":"releaseTitle","value":"\\b(KH)\\b","negate":false,"required":false},{"name":"LazyRemux","type":"releaseTitle","value":"\\b(LazyRemux)\\b","negate":false,"required":false},{"name":"Metal","type":"releaseTitle","value":"\\[Metal\\]|-Metal\\b","negate":false,"required":false},{"name":"MK","type":"releaseTitle","value":"\\b(MK)\\b","negate":false,"required":false},{"name":"neko-kBaraka","type":"releaseTitle","value":"\\b(neko-kBaraka)\\b","negate":false,"required":false},{"name":"OZR","type":"releaseTitle","value":"\\b(OZR)\\b","negate":false,"required":false},{"name":"Pizza","type":"releaseTitle","value":"\\[Pizza\\]|-Pizza\\b","negate":false,"required":false},{"name":"pog42","type":"releaseTitle","value":"\\b(pog42)\\b","negate":false,"required":false},{"name":"Quetzal","type":"releaseTitle","value":"\\b(Quetzal)\\b","negate":false,"required":false},{"name":"Reza","type":"releaseTitle","value":"\\b(Reza)\\b","negate":false,"required":false},{"name":"SCY","type":"releaseTitle","value":"\\b(SCY)\\b","negate":false,"required":false},{"name":"Shimatta","type":"releaseTitle","value":"\\b(Shimatta)\\b","negate":false,"required":false},{"name":"Smoke","type":"releaseTitle","value":"\\[Smoke\\]|-Smoke\\b","negate":false,"required":false},{"name":"Spirale","type":"releaseTitle","value":"\\b(Spirale)\\b","negate":false,"required":false},{"name":"UDF","type":"releaseTitle","value":"\\b(UDF)\\b","negate":false,"required":false},{"name":"UQW","type":"releaseTitle","value":"\\b(UQW)\\b","negate":false,"required":false},{"name":"Virtuality","type":"releaseTitle","value":"\\b(Virtuality)\\b","negate":false,"required":false},{"name":"Vanilla","type":"releaseTitle","value":"\\[Vanilla\\]|-Vanilla\\b","negate":false,"required":false},{"name":"VULCAN","type":"releaseTitle","value":"\\[VULCAN\\]|-VULCAN\\b","negate":false,"required":false}]', 1100, '["tv"]', 'Anime BD Tier 04 fansub release groups for Bluray sources', 'builtin', 0);--> statement-breakpoint
INSERT INTO custom_formats (name, category, specifications, default_score, content_types, description, origin, user_modified)
VALUES ('Anime BD Tier 05', 'Release Group', '[{"name":"Bluray","type":"videoSource","value":"Bluray","negate":false,"required":false},{"name":"Bluray Remux","type":"videoSource","value":"BlurayRaw","negate":false,"required":false},{"name":"DVD","type":"videoSource","value":"DVD","negate":false,"required":false},{"name":"Animorphs","type":"releaseTitle","value":"\\b(Animorphs)\\b","negate":false,"required":false},{"name":"AOmundson","type":"releaseTitle","value":"\\b(AOmundson)\\b","negate":false,"required":false},{"name":"ASC","type":"releaseTitle","value":"\\b(ASC)\\b","negate":false,"required":false},{"name":"Baws","type":"releaseTitle","value":"\\b(Baws|McBalls)\\b","negate":false,"required":false},{"name":"Beatrice","type":"releaseTitle","value":"\\[Beatrice\\]|-Beatrice(?!-raws)\\b","negate":false,"required":false},{"name":"B00BA","type":"releaseTitle","value":"\\b(B00BA)\\b","negate":false,"required":false},{"name":"Cait-Sidhe","type":"releaseTitle","value":"\\b(Cait-Sidhe)\\b","negate":false,"required":false},{"name":"CsS","type":"releaseTitle","value":"\\b(CsS)\\b","negate":false,"required":false},{"name":"CTR","type":"releaseTitle","value":"\\b(CTR)\\b","negate":false,"required":false},{"name":"D4C","type":"releaseTitle","value":"\\b(D4C)\\b","negate":false,"required":false},{"name":"deanzel","type":"releaseTitle","value":"\\b(deanzel)\\b","negate":false,"required":false},{"name":"Drag","type":"releaseTitle","value":"\\[Drag\\]|-Drag\\b","negate":false,"required":false},{"name":"eldon","type":"releaseTitle","value":"\\b(eldon)\\b","negate":false,"required":false},{"name":"Freehold","type":"releaseTitle","value":"\\b(Freehold)\\b","negate":false,"required":false},{"name":"GHS","type":"releaseTitle","value":"\\b(GHS)\\b","negate":false,"required":false},{"name":"Hark0N","type":"releaseTitle","value":"\\b(Hark0N)\\b","negate":false,"required":false},{"name":"Holomux","type":"releaseTitle","value":"\\b(Holomux)\\b","negate":false,"required":false},{"name":"Judgement","type":"releaseTitle","value":"\\[Judgment\\]|-Judgment\\b","negate":false,"required":false},{"name":"MC","type":"releaseTitle","value":"\\b(MC)\\b","negate":false,"required":false},{"name":"mottoj","type":"releaseTitle","value":"\\b(mottoj)\\b","negate":false,"required":false},{"name":"NH","type":"releaseTitle","value":"\\b(NH)\\b","negate":false,"required":false},{"name":"NTRM","type":"releaseTitle","value":"\\b(NTRM)\\b","negate":false,"required":false},{"name":"o7","type":"releaseTitle","value":"\\b(o7)\\b","negate":false,"required":false},{"name":"QM","type":"releaseTitle","value":"\\b(QM)\\b","negate":false,"required":false},{"name":"Thighs","type":"releaseTitle","value":"\\[Thighs\\]|-Thighs\\b","negate":false,"required":false},{"name":"TTGA","type":"releaseTitle","value":"\\b(TTGA)\\b","negate":false,"required":false},{"name":"UltraRemux","type":"releaseTitle","value":"\\b(UltraRemux)\\b","negate":false,"required":false},{"name":"WBDP","type":"releaseTitle","value":"\\b(WBDP)\\b","negate":false,"required":false},{"name":"WSE","type":"releaseTitle","value":"\\b(WSE)\\b","negate":false,"required":false},{"name":"Yuki","type":"releaseTitle","value":"\\[Yuki\\]|-Yuki\\b","negate":false,"required":false}]', 1000, '["tv"]', 'Anime BD Tier 05 fansub release groups for Bluray sources', 'builtin', 0);--> statement-breakpoint
INSERT INTO custom_formats (name, category, specifications, default_score, content_types, description, origin, user_modified)
VALUES ('Anime BD Tier 06', 'Release Group', '[{"name":"Bluray","type":"videoSource","value":"Bluray","negate":false,"required":false},{"name":"Bluray Remux","type":"videoSource","value":"BlurayRaw","negate":false,"required":false},{"name":"DVD","type":"videoSource","value":"DVD","negate":false,"required":false},{"name":"ANE","type":"releaseTitle","value":"\\[ANE\\]|-ANE$","negate":false,"required":false},{"name":"Bunny-Apocalypse","type":"releaseTitle","value":"\\b(Bunny-Apocalypse)\\b","negate":false,"required":false},{"name":"CyC","type":"releaseTitle","value":"\\b(CyC)\\b","negate":false,"required":false},{"name":"Datte13","type":"releaseTitle","value":"\\b(Datte13)\\b","negate":false,"required":false},{"name":"EJF","type":"releaseTitle","value":"\\b(EJF)\\b","negate":false,"required":false},{"name":"GetItTwisted","type":"releaseTitle","value":"\\b(GetItTwisted)\\b","negate":false,"required":false},{"name":"GSK_kun","type":"releaseTitle","value":"\\b(GSK[._-]kun)\\b","negate":false,"required":false},{"name":"iKaos","type":"releaseTitle","value":"\\b(iKaos)\\b","negate":false,"required":false},{"name":"karios","type":"releaseTitle","value":"\\b(karios)\\b","negate":false,"required":false},{"name":"Pookie","type":"releaseTitle","value":"\\b(Pookie)\\b","negate":false,"required":false},{"name":"RASETSU","type":"releaseTitle","value":"\\b(RASETSU)\\b","negate":false,"required":false},{"name":"Starbez","type":"releaseTitle","value":"\\b(Starbez)\\b","negate":false,"required":false},{"name":"Tsundere","type":"releaseTitle","value":"\\[Tsundere\\]|-Tsundere(?!-)\\b","negate":false,"required":false},{"name":"Yoghurt","type":"releaseTitle","value":"\\b(Yoghurt)\\b","negate":false,"required":false},{"name":"YURASUKA","type":"releaseTitle","value":"\\[YURASUKA\\]|-YURASUKA\\b","negate":false,"required":false}]', 900, '["tv"]', 'Anime BD Tier 06 fansub release groups for Bluray sources', 'builtin', 0);--> statement-breakpoint
INSERT INTO custom_formats (name, category, specifications, default_score, content_types, description, origin, user_modified)
VALUES ('Anime BD Tier 07', 'Release Group', '[{"name":"Bluray","type":"videoSource","value":"Bluray","negate":false,"required":false},{"name":"Bluray Remux","type":"videoSource","value":"BlurayRaw","negate":false,"required":false},{"name":"DVD","type":"videoSource","value":"DVD","negate":false,"required":false},{"name":"9volt","type":"releaseTitle","value":"\\b(9volt)\\b","negate":false,"required":false},{"name":"AC","type":"releaseTitle","value":"\\[AC\\]|-AC$","negate":false,"required":false},{"name":"Almighty","type":"releaseTitle","value":"\\[Almighty\\]|-Almighty\\b","negate":false,"required":false},{"name":"Asakura","type":"releaseTitle","value":"\\[Asakura\\]|-Asakura\\b","negate":false,"required":false},{"name":"Asenshi","type":"releaseTitle","value":"\\b(Asenshi)\\b","negate":false,"required":false},{"name":"BlurayDesuYo","type":"releaseTitle","value":"\\b(BlurayDesuYo)\\b","negate":false,"required":false},{"name":"Bolshevik","type":"releaseTitle","value":"\\[Bolshevik\\]|-Bolshevik\\b","negate":false,"required":false},{"name":"Brrrrrrr","type":"releaseTitle","value":"\\b(Brrrrrrr)\\b","negate":false,"required":false},{"name":"Chihiro","type":"releaseTitle","value":"\\[Chihiro\\]|-Chihiro\\b","negate":false,"required":false},{"name":"Commie","type":"releaseTitle","value":"\\b(Commie)\\b","negate":false,"required":false},{"name":"Crow","type":"releaseTitle","value":"\\[Crow\\]|-Crow\\b","negate":false,"required":false},{"name":"Dae","type":"releaseTitle","value":"\\b(Dae)\\b","negate":false,"required":false},{"name":"Dekinai","type":"releaseTitle","value":"\\[Dekinai\\]|-Dekinai\\b","negate":false,"required":false},{"name":"Dragon-Releases","type":"releaseTitle","value":"\\b(Dragon-Releases)\\b","negate":false,"required":false},{"name":"DragsterPS","type":"releaseTitle","value":"\\b(DragsterPS)\\b","negate":false,"required":false},{"name":"Exiled-Destiny","type":"releaseTitle","value":"\\b(Exiled-Destiny|E-D)\\b","negate":false,"required":false},{"name":"FFF","type":"releaseTitle","value":"\\b(FFF)\\b","negate":false,"required":false},{"name":"Final8","type":"releaseTitle","value":"\\b(Final8)\\b","negate":false,"required":false},{"name":"Geonope","type":"releaseTitle","value":"\\b(Geonope)\\b","negate":false,"required":false},{"name":"GJM","type":"releaseTitle","value":"\\b(GJM)\\b","negate":false,"required":false},{"name":"iAHD","type":"releaseTitle","value":"\\b(iAHD)\\b","negate":false,"required":false},{"name":"inid4c","type":"releaseTitle","value":"\\b(inid4c)\\b","negate":false,"required":false},{"name":"Koten_Gars","type":"releaseTitle","value":"\\b(Koten[ ._-]Gars)\\b","negate":false,"required":false},{"name":"kuchikirukia","type":"releaseTitle","value":"\\b(kuchikirukia)\\b","negate":false,"required":false},{"name":"LCE","type":"releaseTitle","value":"\\b(LCE)\\b","negate":false,"required":false},{"name":"NTW","type":"releaseTitle","value":"\\b(NTW)\\b","negate":false,"required":false},{"name":"orz","type":"releaseTitle","value":"\\b(orz)\\b","negate":false,"required":false},{"name":"RAI","type":"releaseTitle","value":"\\b(RAI)\\b","negate":false,"required":false},{"name":"REVO","type":"releaseTitle","value":"\\b(REVO)\\b","negate":false,"required":false},{"name":"SCP-2223","type":"releaseTitle","value":"\\b(SCP-2223)\\b","negate":false,"required":false},{"name":"Senjou","type":"releaseTitle","value":"\\[Senjou\\]|-Senjou\\b","negate":false,"required":false},{"name":"SEV","type":"releaseTitle","value":"\\b(SEV)\\b","negate":false,"required":false},{"name":"THORA","type":"releaseTitle","value":"\\b(THORA)\\b","negate":false,"required":false},{"name":"Vivid","type":"releaseTitle","value":"\\[Vivid\\]|-Vivid\\b","negate":false,"required":false}]', 800, '["tv"]', 'Anime BD Tier 07 fansub release groups for Bluray sources', 'builtin', 0);--> statement-breakpoint
INSERT INTO custom_formats (name, category, specifications, default_score, content_types, description, origin, user_modified)
VALUES ('Anime BD Tier 08', 'Release Group', '[{"name":"Bluray","type":"videoSource","value":"Bluray","negate":false,"required":false},{"name":"Bluray Remux","type":"videoSource","value":"BlurayRaw","negate":false,"required":false},{"name":"DVD","type":"videoSource","value":"DVD","negate":false,"required":false},{"name":"AkihitoSubs","type":"releaseTitle","value":"\\b(AkihitoSubs)\\b","negate":false,"required":false},{"name":"Arukoru","type":"releaseTitle","value":"\\b(Arukoru)\\b","negate":false,"required":false},{"name":"EDGE","type":"releaseTitle","value":"\\[EDGE\\]|-EDGE\\b","negate":false,"required":false},{"name":"EMBER","type":"releaseTitle","value":"\\[EMBER\\]|-EMBER\\b","negate":false,"required":false},{"name":"GHOST","type":"releaseTitle","value":"\\[GHOST\\]|-GHOST\\b","negate":false,"required":false},{"name":"Judas","type":"releaseTitle","value":"\\[Judas\\]|-Judas","negate":false,"required":false},{"name":"naiyas","type":"releaseTitle","value":"\\[naiyas\\]|-naiyas\\b","negate":false,"required":false},{"name":"Nep_Blanc","type":"releaseTitle","value":"\\b(Nep[ ._-]Blanc)\\b","negate":false,"required":false},{"name":"Prof","type":"releaseTitle","value":"\\[Prof\\]|-Prof\\b","negate":false,"required":false},{"name":"Shirσ","type":"releaseTitle","value":"\\b(Shirσ)\\b","negate":false,"required":false}]', 700, '["tv"]', 'Anime BD Tier 08 fansub release groups for Bluray sources', 'builtin', 0);--> statement-breakpoint
INSERT INTO custom_formats (name, category, specifications, default_score, content_types, description, origin, user_modified)
VALUES ('Anime Web Tier 01', 'Release Group', '[{"name":"WEBDL","type":"videoSource","value":"Web","negate":false,"required":false},{"name":"WEBRIP","type":"videoSource","value":"WebRip","negate":false,"required":false},{"name":"WEB","type":"videoSource","value":"Web","negate":false,"required":false},{"name":"Arg0","type":"releaseTitle","value":"\\b(Arg0)\\b","negate":false,"required":false},{"name":"Arid","type":"releaseTitle","value":"\\[Arid\\]|-Arid\\b","negate":false,"required":false},{"name":"Baws","type":"releaseTitle","value":"\\b(Baws)\\b","negate":false,"required":false},{"name":"FLE","type":"releaseTitle","value":"\\b(FLE)\\b","negate":false,"required":false},{"name":"LostYears","type":"releaseTitle","value":"\\b(LostYears)\\b","negate":false,"required":false},{"name":"LYS1TH3A","type":"releaseTitle","value":"\\b(LYS1TH3A)\\b","negate":false,"required":false},{"name":"McBalls","type":"releaseTitle","value":"\\b(McBalls)\\b","negate":false,"required":false},{"name":"sam","type":"releaseTitle","value":"\\[sam\\]|-sam\\b","negate":false,"required":false},{"name":"SCY","type":"releaseTitle","value":"\\b(SCY)\\b","negate":false,"required":false},{"name":"Setsugen","type":"releaseTitle","value":"\\b(Setsugen)\\b","negate":false,"required":false},{"name":"smol","type":"releaseTitle","value":"\\[smol\\]|-smol\\b","negate":false,"required":false},{"name":"SoM","type":"releaseTitle","value":"\\[SoM\\]|-SoM\\b","negate":false,"required":false},{"name":"Vodes","type":"releaseTitle","value":"\\[Vodes\\]|(?<!Not)-Vodes\\b","negate":false,"required":false},{"name":"Z4ST1N","type":"releaseTitle","value":"\\b(Z4ST1N)\\b","negate":false,"required":false},{"name":"ZeroBuild","type":"releaseTitle","value":"\\b(ZeroBuild)\\b","negate":false,"required":false}]', 600, '["tv"]', 'Anime Web Tier 01 fansub release groups for WEB sources', 'builtin', 0);--> statement-breakpoint
INSERT INTO custom_formats (name, category, specifications, default_score, content_types, description, origin, user_modified)
VALUES ('Anime Web Tier 02', 'Release Group', '[{"name":"WEBDL","type":"videoSource","value":"Web","negate":false,"required":false},{"name":"WEBRIP","type":"videoSource","value":"WebRip","negate":false,"required":false},{"name":"WEB","type":"videoSource","value":"Web","negate":false,"required":false},{"name":"0x539","type":"releaseTitle","value":"\\b(0x539)\\b","negate":false,"required":false},{"name":"Asakura","type":"releaseTitle","value":"\\[Asakura\\]|-Asakura\\b","negate":false,"required":false},{"name":"Cyan","type":"releaseTitle","value":"\\[Cyan\\]|-Cyan\\b","negate":false,"required":false},{"name":"Cytox","type":"releaseTitle","value":"\\b(Cytox)\\b","negate":false,"required":false},{"name":"Dae","type":"releaseTitle","value":"\\[Dae\\]|-Dae\\b","negate":false,"required":false},{"name":"Foxtrot","type":"releaseTitle","value":"\\[Foxtrot\\]|-Foxtrot\\b","negate":false,"required":false},{"name":"Gao","type":"releaseTitle","value":"\\[Gao\\]|-Gao\\b","negate":false,"required":false},{"name":"GSK_kun","type":"releaseTitle","value":"\\b(GSK[._-]kun)\\b","negate":false,"required":false},{"name":"Half-Baked","type":"releaseTitle","value":"\\b(Half-Baked)\\b","negate":false,"required":false},{"name":"HatSubs","type":"releaseTitle","value":"\\b(HatSubs)\\b","negate":false,"required":false},{"name":"MALD","type":"releaseTitle","value":"\\b(MALD)\\b","negate":false,"required":false},{"name":"MTBB","type":"releaseTitle","value":"\\b(MTBB)\\b","negate":false,"required":false},{"name":"Not-Vodes","type":"releaseTitle","value":"\\[Not-Vodes\\]|-Not-Vodes\\b","negate":false,"required":false},{"name":"Okay-Subs","type":"releaseTitle","value":"\\b(Okay-Subs)\\b","negate":false,"required":false},{"name":"Pizza","type":"releaseTitle","value":"\\[Pizza\\]|-Pizza\\b","negate":false,"required":false},{"name":"Reza","type":"releaseTitle","value":"\\b(Reza)\\b","negate":false,"required":false},{"name":"Slyfox","type":"releaseTitle","value":"\\b(Slyfox)\\b","negate":false,"required":false},{"name":"SoLCE","type":"releaseTitle","value":"\\b(SoLCE)\\b","negate":false,"required":false},{"name":"Tenshi","type":"releaseTitle","value":"\\[tenshi\\]|-tenshi$","negate":false,"required":false}]', 500, '["tv"]', 'Anime Web Tier 02 fansub release groups for WEB sources', 'builtin', 0);--> statement-breakpoint
INSERT INTO custom_formats (name, category, specifications, default_score, content_types, description, origin, user_modified)
VALUES ('Anime Web Tier 03', 'Release Group', '[{"name":"WEBDL","type":"videoSource","value":"Web","negate":false,"required":false},{"name":"WEBRIP","type":"videoSource","value":"WebRip","negate":false,"required":false},{"name":"WEB","type":"videoSource","value":"Web","negate":false,"required":false},{"name":"AnoZu","type":"releaseTitle","value":"\\b(AnoZu)\\b","negate":false,"required":false},{"name":"Dooky","type":"releaseTitle","value":"\\b(Dooky)\\b","negate":false,"required":false},{"name":"Kitsune","type":"releaseTitle","value":"\\[Kitsune\\]|-Kitsune\\b","negate":false,"required":false},{"name":"SubsPlus+","type":"releaseTitle","value":"\\b(SubsPlus\\+?)\\b","negate":false,"required":false},{"name":"ZR","type":"releaseTitle","value":"\\b(ZR)\\b","negate":false,"required":false}]', 400, '["tv"]', 'Anime Web Tier 03 fansub release groups for WEB sources', 'builtin', 0);--> statement-breakpoint
INSERT INTO custom_formats (name, category, specifications, default_score, content_types, description, origin, user_modified)
VALUES ('Anime Web Tier 04', 'Release Group', '[{"name":"WEBDL","type":"videoSource","value":"Web","negate":false,"required":false},{"name":"WEBRIP","type":"videoSource","value":"WebRip","negate":false,"required":false},{"name":"WEB","type":"videoSource","value":"Web","negate":false,"required":false},{"name":"Erai-Raws","type":"releaseTitle","value":"\\b(Erai-raws)\\b","negate":false,"required":false},{"name":"ToonsHub","type":"releaseTitle","value":"\\b(ToonsHub)\\b","negate":false,"required":false},{"name":"VARYG","type":"releaseTitle","value":"\\b(VARYG)\\b","negate":false,"required":false}]', 300, '["tv"]', 'Anime Web Tier 04 fansub release groups for WEB sources', 'builtin', 0);--> statement-breakpoint
INSERT INTO custom_formats (name, category, specifications, default_score, content_types, description, origin, user_modified)
VALUES ('Anime Web Tier 05', 'Release Group', '[{"name":"WEBDL","type":"videoSource","value":"Web","negate":false,"required":false},{"name":"WEBRIP","type":"videoSource","value":"WebRip","negate":false,"required":false},{"name":"WEB","type":"videoSource","value":"Web","negate":false,"required":false},{"name":"BlueLobster","type":"releaseTitle","value":"\\b(BlueLobster)\\b","negate":false,"required":false},{"name":"GST","type":"releaseTitle","value":"\\b(GST)\\b","negate":false,"required":false},{"name":"HorribleRips","type":"releaseTitle","value":"\\b(HorribleRips)\\b","negate":false,"required":false},{"name":"HorribleSubs","type":"releaseTitle","value":"\\b(HorribleSubs)\\b","negate":false,"required":false},{"name":"KAN3D2M","type":"releaseTitle","value":"\\b(KAN3D2M)\\b","negate":false,"required":false},{"name":"KiyoshiStar","type":"releaseTitle","value":"\\b(KS|KiyoshiStar)\\b","negate":false,"required":false},{"name":"Lia","type":"releaseTitle","value":"\\[Lia\\]|-Lia\\b","negate":false,"required":false},{"name":"NanDesuKa","type":"releaseTitle","value":"\\b(NanDesuKa)\\b","negate":false,"required":false},{"name":"PlayWeb","type":"releaseTitle","value":"\\b(PlayWeb)\\b","negate":false,"required":false},{"name":"SobsPlease","type":"releaseTitle","value":"\\b(SobsPlease)\\b","negate":false,"required":false},{"name":"Some-Stuffs","type":"releaseTitle","value":"\\b(Some-Stuffs)\\b","negate":false,"required":false},{"name":"SubsPlease","type":"releaseTitle","value":"\\b(SubsPlease)\\b","negate":false,"required":false},{"name":"URANIME","type":"releaseTitle","value":"\\b(URANIME)\\b","negate":false,"required":false},{"name":"ZigZag","type":"releaseTitle","value":"\\[ZigZag\\]|-ZigZab\b","negate":false,"required":false}]', 200, '["tv"]', 'Anime Web Tier 05 fansub release groups for WEB sources', 'builtin', 0);--> statement-breakpoint
INSERT INTO custom_formats (name, category, specifications, default_score, content_types, description, origin, user_modified)
VALUES ('Anime Web Tier 06', 'Release Group', '[{"name":"WEBDL","type":"videoSource","value":"Web","negate":false,"required":false},{"name":"WEBRIP","type":"videoSource","value":"WebRip","negate":false,"required":false},{"name":"WEB","type":"videoSource","value":"Web","negate":false,"required":false},{"name":"9volt","type":"releaseTitle","value":"\\b(9volt)\\b","negate":false,"required":false},{"name":"Asenshi","type":"releaseTitle","value":"\\b(Asenshi)\\b","negate":false,"required":false},{"name":"Chihiro","type":"releaseTitle","value":"\\[Chihiro\\]|-Chihiro\\b","negate":false,"required":false},{"name":"Commie","type":"releaseTitle","value":"\\b(Commie)\\b","negate":false,"required":false},{"name":"DameDesuYo","type":"releaseTitle","value":"\\b(DameDesuYo)\\b","negate":false,"required":false},{"name":"Doki","type":"releaseTitle","value":"\\[Doki\\]|-Doki\\b","negate":false,"required":false},{"name":"GJM","type":"releaseTitle","value":"\\b(GJM)\\b","negate":false,"required":false},{"name":"Kaleido","type":"releaseTitle","value":"\\b(Kaleido)\\b","negate":false,"required":false},{"name":"Kantai","type":"releaseTitle","value":"\\[Kantai\\]|-Kantai\\b","negate":false,"required":false},{"name":"KawaSubs","type":"releaseTitle","value":"\\b(KawaSubs)\\b","negate":false,"required":false},{"name":"Tsundere","type":"releaseTitle","value":"\\[Tsundere\\]|-Tsundere(?!-)\\b","negate":false,"required":false}]', 100, '["tv"]', 'Anime Web Tier 06 fansub release groups for WEB sources', 'builtin', 0);--> statement-breakpoint
INSERT INTO custom_formats (name, category, specifications, default_score, content_types, description, origin, user_modified)
VALUES ('Remux Tier 01', 'Release Group', '[{"name":"Remux","type":"videoSource","value":"BlurayRaw","negate":false,"required":true},{"name":"BLURANiUM","type":"releaseGroup","value":"^(BLURANiUM)$","negate":false,"required":false},{"name":"BMF","type":"releaseGroup","value":"^(BMF)$","negate":false,"required":false},{"name":"FraMeSToR","type":"releaseGroup","value":"^(FraMeSToR)$","negate":false,"required":false},{"name":"PmP","type":"releaseGroup","value":"^(PmP)$","negate":false,"required":false}]', 975, '["tv"]', 'Remux Tier 01 remux release groups', 'builtin', 0);--> statement-breakpoint
INSERT INTO custom_formats (name, category, specifications, default_score, content_types, description, origin, user_modified)
VALUES ('Remux Tier 02', 'Release Group', '[{"name":"Remux","type":"videoSource","value":"BlurayRaw","negate":false,"required":true},{"name":"12GaugeShotgun","type":"releaseGroup","value":"^(12GaugeShotgun)$","negate":false,"required":false},{"name":"decibeL","type":"releaseGroup","value":"^(decibeL)$","negate":false,"required":false},{"name":"EPSiLON","type":"releaseGroup","value":"^(EPSiLON)$","negate":false,"required":false},{"name":"HiFi","type":"releaseGroup","value":"^(HiFi)$","negate":false,"required":false},{"name":"KRaLiMaRKo","type":"releaseGroup","value":"^(KRaLiMaRKo)$","negate":false,"required":false},{"name":"playBD","type":"releaseGroup","value":"^(playBD)$","negate":false,"required":false},{"name":"PTer","type":"releaseGroup","value":"^(PTer)$","negate":false,"required":false},{"name":"SiCFoI","type":"releaseGroup","value":"^(SiCFoI)$","negate":false,"required":false},{"name":"TRiToN","type":"releaseGroup","value":"^(TRiToN)$","negate":false,"required":false}]', 950, '["tv"]', 'Remux Tier 02 remux release groups', 'builtin', 0);--> statement-breakpoint
INSERT INTO custom_formats (name, category, specifications, default_score, content_types, description, origin, user_modified)
VALUES ('Anime Raws', 'Unwanted', '[{"name":"AsukaRaws","type":"releaseTitle","value":"Asuka[ ._-]?(Raws)","negate":false,"required":false},{"name":"Beatrice-Raws","type":"releaseTitle","value":"Beatrice[ ._-]?(Raws)","negate":false,"required":false},{"name":"Daddy-Raws","type":"releaseTitle","value":"Daddy[ ._-]?(Raws)","negate":false,"required":false},{"name":"Fumi-Raws","type":"releaseTitle","value":"Fumi[ ._-]?(Raws)","negate":false,"required":false},{"name":"IrizaRaws","type":"releaseTitle","value":"Iriza[ ._-]?(Raws)","negate":false,"required":false},{"name":"Kawaiika-Raws","type":"releaseTitle","value":"Kawaiika[ ._-]?(Raws)","negate":false,"required":false},{"name":"km","type":"releaseTitle","value":"\\[km\\]|-km\\b","negate":false,"required":false},{"name":"Koi-Raws","type":"releaseTitle","value":"Koi[ ._-]?(Raws)","negate":false,"required":false},{"name":"Lilith-Raws","type":"releaseTitle","value":"Lilith[ ._-]?(Raws)","negate":false,"required":false},{"name":"LowPower-Raws","type":"releaseTitle","value":"LowPower[ ._-]?(Raws)","negate":false,"required":false},{"name":"Moozzi2","type":"releaseTitle","value":"\\b(Moozzi2)\\b","negate":false,"required":false},{"name":"NanakoRaws","type":"releaseTitle","value":"Nanako[ ._-]?(Raws)","negate":false,"required":false},{"name":"NC-Raws","type":"releaseTitle","value":"NC[ ._-]?(Raws)","negate":false,"required":false},{"name":"neko-raws","type":"releaseTitle","value":"neko[ ._-]?(raws)","negate":false,"required":false},{"name":"New-raws","type":"releaseTitle","value":"New[ ._-]?(raws)","negate":false,"required":false},{"name":"Ohys-Raws","type":"releaseTitle","value":"Ohys[ ._-]?(Raws)","negate":false,"required":false},{"name":"Pandoratv-Raws","type":"releaseTitle","value":"Pandoratv[ ._-]?(Raws)","negate":false,"required":false},{"name":"Raws-Maji","type":"releaseTitle","value":"\\b(Raws-Maji)\\b","negate":false,"required":false},{"name":"ReinForce","type":"releaseTitle","value":"\\b(ReinForce)\\b","negate":false,"required":false},{"name":"Scryous-Raws","type":"releaseTitle","value":"Scryous[ ._-]?(Raws)","negate":false,"required":false},{"name":"Seicher-Raws","type":"releaseTitle","value":"Seicher[ ._-]?(Raws)","negate":false,"required":false},{"name":"Shiniori-Raws","type":"releaseTitle","value":"Shiniori[ ._-]?(Raws)","negate":false,"required":false}]', -10000, '["tv"]', 'Raw anime releases without subtitles', 'builtin', 0);--> statement-breakpoint
INSERT INTO custom_formats (name, category, specifications, default_score, content_types, description, origin, user_modified)
VALUES ('Anime LQ Groups', 'Unwanted', '[{"name":"$tore-Chill","type":"releaseTitle","value":"\\b(\\$tore-Chill)\\b","negate":false,"required":false},{"name":"0neshot","type":"releaseTitle","value":"\\b(0neshot)\\b","negate":false,"required":false},{"name":"224","type":"releaseTitle","value":"\\[224\\]|-224\\b","negate":false,"required":false},{"name":"A-Destiny","type":"releaseTitle","value":"\\b(A-Destiny)\\b","negate":false,"required":false},{"name":"AceAres","type":"releaseTitle","value":"\\b(AceAres)\\b","negate":false,"required":false},{"name":"AhmadDev","type":"releaseTitle","value":"\\b(AhmadDev)\\b","negate":false,"required":false},{"name":"Anime Chap","type":"releaseTitle","value":"\\b(Anime[ .-]?Chap)\\b","negate":false,"required":false},{"name":"Anime Land","type":"releaseTitle","value":"\\b(Anime[ .-]?Land)\\b","negate":false,"required":false},{"name":"Anime Time","type":"releaseTitle","value":"\\b(Anime[ .-]?Time)\\b","negate":false,"required":false},{"name":"AnimeDynastyEN","type":"releaseTitle","value":"\\b(AnimeDynastyEN)\\b","negate":false,"required":false},{"name":"AnimeKuro","type":"releaseTitle","value":"\\b(AnimeKuro)\\b","negate":false,"required":false},{"name":"AnimeRG","type":"releaseTitle","value":"\\b(AnimeRG)\\b","negate":false,"required":false},{"name":"Animesubs","type":"releaseTitle","value":"\\b(Animesubs)\\b","negate":false,"required":false},{"name":"AnimeTR","type":"releaseTitle","value":"\\b(AnimeTR)\\b","negate":false,"required":false},{"name":"Anitsu","type":"releaseTitle","value":"\\b(Anitsu)\\b","negate":false,"required":false},{"name":"AniVoid","type":"releaseTitle","value":"\\b(AniVoid)\\b","negate":false,"required":false},{"name":"ArataEnc","type":"releaseTitle","value":"\\b(ArataEnc)\\b","negate":false,"required":false},{"name":"AREY","type":"releaseTitle","value":"\\b(AREY)\\b","negate":false,"required":false},{"name":"Ari","type":"releaseTitle","value":"\\[Ari\\]|-Ari\\b","negate":false,"required":false},{"name":"ASW","type":"releaseTitle","value":"\\b(ASW)\\b","negate":false,"required":false},{"name":"BJX","type":"releaseTitle","value":"\\b(BJX)\\b","negate":false,"required":false},{"name":"BlackLuster","type":"releaseTitle","value":"\\b(BlackLuster)\\b","negate":false,"required":false},{"name":"bonkai77","type":"releaseTitle","value":"\\b(bonkai77)\\b","negate":false,"required":false},{"name":"CameEsp","type":"releaseTitle","value":"\\b(CameEsp)\\b","negate":false,"required":false},{"name":"Cat66","type":"releaseTitle","value":"\\b(Cat66)\\b","negate":false,"required":false},{"name":"CBB","type":"releaseTitle","value":"\\b(CBB)\\b","negate":false,"required":false},{"name":"Cerberus","type":"releaseTitle","value":"\\[Cerberus\\]|-Cerberus\\b","negate":false,"required":false},{"name":"Cleo","type":"releaseTitle","value":"\\[Cleo\\]|-Cleo","negate":false,"required":false},{"name":"CuaP","type":"releaseTitle","value":"\\b(CuaP)\\b","negate":false,"required":false},{"name":"DaddySubs","type":"releaseTitle","value":"\\[Daddy(Subs)?\\]|-Daddy(Subs)?\\b","negate":false,"required":false},{"name":"DARKFLiX","type":"releaseTitle","value":"\\b(DARKFLiX)\\b","negate":false,"required":false},{"name":"DB","type":"releaseTitle","value":"\\[DB\\]","negate":false,"required":false},{"name":"DBArabic","type":"releaseTitle","value":"\\b(DBArabic)\\b","negate":false,"required":false},{"name":"Deadmau- RAWS","type":"releaseTitle","value":"\\b(Deadmau[ .-]?[ .-]?RAWS)\\b","negate":false,"required":false},{"name":"DKB","type":"releaseTitle","value":"\\b(DKB)\\b","negate":false,"required":false},{"name":"DP","type":"releaseTitle","value":"\\b(DP)\\b","negate":false,"required":false},{"name":"DsunS","type":"releaseTitle","value":"\\b(DsunS)\\b","negate":false,"required":false},{"name":"Emmid","type":"releaseTitle","value":"\\[Emmid\\]|-Emmid\\b","negate":false,"required":false},{"name":"ExREN","type":"releaseTitle","value":"\\b(ExREN)\\b","negate":false,"required":false},{"name":"FAV","type":"releaseTitle","value":"\\[FAV\\]|-FAV\\b","negate":false,"required":false},{"name":"Fish","type":"releaseTitle","value":"\\b((Baked|Dead|Space)Fish)\\b","negate":false,"required":false},{"name":"FunArts","type":"releaseTitle","value":"\\b(FunArts)\\b","negate":false,"required":false},{"name":"GERMini","type":"releaseTitle","value":"\\b(GERMini)\\b","negate":false,"required":false},{"name":"Hakata Ramen","type":"releaseTitle","value":"\\b(Hakata[ .-]?Ramen)\\b","negate":false,"required":false},{"name":"Hall_of_C","type":"releaseTitle","value":"\\b(Hall_of_C)\\b","negate":false,"required":false},{"name":"Hatsuyuki","type":"releaseTitle","value":"\\[Hatsuyuki\\]|-Hatsuyuki\\b","negate":false,"required":false},{"name":"HAV1T","type":"releaseTitle","value":"\\b(HAV1T)\\b","negate":false,"required":false},{"name":"HENiL","type":"releaseTitle","value":"\\b(HENiL)\\b","negate":false,"required":false},{"name":"Hitoku","type":"releaseTitle","value":"\\[Hitoku\\]|-Hitoku\\b","negate":false,"required":false},{"name":"HollowRoxas","type":"releaseTitle","value":"\\b(HollowRoxas)\\b","negate":false,"required":false},{"name":"HR","type":"releaseTitle","value":"\\[HR\\]|-HR\\b","negate":false,"required":false},{"name":"ICEBLUE","type":"releaseTitle","value":"\\b(ICEBLUE)\\b","negate":false,"required":false},{"name":"iPUNISHER","type":"releaseTitle","value":"\\b(iPUNISHER)\\b","negate":false,"required":false},{"name":"JacobSwaggedUp","type":"releaseTitle","value":"\\b(JacobSwaggedUp)\\b","negate":false,"required":false},{"name":"Johnny-englishsubs","type":"releaseTitle","value":"\\b(Johnny-englishsubs)\\b","negate":false,"required":false},{"name":"Kallango","type":"releaseTitle","value":"\\[Kallango\\]|-Kallango\\b","negate":false,"required":false},{"name":"Kanjouteki","type":"releaseTitle","value":"\\b(Kanjouteki)\\b","negate":false,"required":false},{"name":"KEKMASTERS","type":"releaseTitle","value":"\\b(KEKMASTERS)\\b","negate":false,"required":false},{"name":"Kirion","type":"releaseTitle","value":"\\b(Kirion)\\b","negate":false,"required":false},{"name":"KQRM","type":"releaseTitle","value":"\\b(KQRM)\\b","negate":false,"required":false},{"name":"KRP","type":"releaseTitle","value":"\\b(KRP)\\b","negate":false,"required":false},{"name":"LoliHouse","type":"releaseTitle","value":"\\b(LoliHouse)\\b","negate":false,"required":false},{"name":"M@nI","type":"releaseTitle","value":"\\b(M@nI)\\b","negate":false,"required":false},{"name":"mal lu zen","type":"releaseTitle","value":"\\b(mal[ .-]lu[ .-]zen)\\b","negate":false,"required":false},{"name":"Man.K","type":"releaseTitle","value":"\\b(Man\\.K)\\b","negate":false,"required":false},{"name":"Maximus","type":"releaseTitle","value":"\\[Maximus\\]|-Maximus\\b","negate":false,"required":false},{"name":"MD","type":"releaseTitle","value":"\\[MD\\]|-MD\\b","negate":false,"required":false},{"name":"mdcx","type":"releaseTitle","value":"\\b(mdcx)\\b","negate":false,"required":false},{"name":"Metaljerk","type":"releaseTitle","value":"\\b(Metaljerk)\\b","negate":false,"required":false},{"name":"MGD","type":"releaseTitle","value":"\\b(MGD)\\b","negate":false,"required":false},{"name":"MiniFreeza","type":"releaseTitle","value":"\\b(MiniFreeza)\\b","negate":false,"required":false},{"name":"MiniMTBB","type":"releaseTitle","value":"\\b(MiniMTBB)\\b","negate":false,"required":false},{"name":"MinisCuba","type":"releaseTitle","value":"\\b(MinisCuba)\\b","negate":false,"required":false},{"name":"MiniTheatre","type":"releaseTitle","value":"\\b(MiniTheatre)\\b","negate":false,"required":false},{"name":"Mites","type":"releaseTitle","value":"\\b(Mites)\\b","negate":false,"required":false},{"name":"Modders Bay","type":"releaseTitle","value":"\\b(Modders[ .-]?Bay)\\b","negate":false,"required":false},{"name":"Mr. Deadpool","type":"releaseTitle","value":"\\b(Mr\\.Deadpool)\\b","negate":false,"required":false},{"name":"NemDiggers","type":"releaseTitle","value":"\\b(NemDiggers)\\b","negate":false,"required":false},{"name":"neoHEVC","type":"releaseTitle","value":"\\b(neoHEVC)\\b","negate":false,"required":false},{"name":"Nokou","type":"releaseTitle","value":"\\b(Nokou)\\b","negate":false,"required":false},{"name":"NoobSubs","type":"releaseTitle","value":"\\b(N[eo][wo]b[ ._-]?Subs)\\b","negate":false,"required":false},{"name":"NS","type":"releaseTitle","value":"\\b(NS)\\b","negate":false,"required":false},{"name":"Nyanpasu","type":"releaseTitle","value":"\\b(Nyanpasu)\\b","negate":false,"required":false},{"name":"OldCastle","type":"releaseTitle","value":"\\b(OldCastle)\\b","negate":false,"required":false},{"name":"Pantsu","type":"releaseTitle","value":"\\[Pantsu\\]|-Pantsu\\b","negate":false,"required":false},{"name":"Pao","type":"releaseTitle","value":"\\[Pao\\]|-Pao\\b","negate":false,"required":false},{"name":"phazer11","type":"releaseTitle","value":"\\b(phazer11)\\b","negate":false,"required":false},{"name":"Pixel","type":"releaseTitle","value":"\\[Pixel\\]|-Pixel\\b","negate":false,"required":false},{"name":"Plex Friendly","type":"releaseTitle","value":"\\b(Plex[ .-]?Friendly)\\b","negate":false,"required":false},{"name":"PnPSubs","type":"releaseTitle","value":"\\b(PnPSubs)\\b","negate":false,"required":false},{"name":"Polarwindz","type":"releaseTitle","value":"\\b(Polarwindz)\\b","negate":false,"required":false},{"name":"Project-gxs","type":"releaseTitle","value":"\\b(Project-gxs)\\b","negate":false,"required":false},{"name":"PuyaSubs","type":"releaseTitle","value":"\\b(PuyaSubs)\\b","negate":false,"required":false},{"name":"QaS","type":"releaseTitle","value":"\\b(QAS)\\b","negate":false,"required":false},{"name":"QCE","type":"releaseTitle","value":"\\b(QCE)\\b","negate":false,"required":false},{"name":"Rando235","type":"releaseTitle","value":"\\b(Rando235)\\b","negate":false,"required":false},{"name":"Ranger","type":"releaseTitle","value":"\\[Ranger\\]|-Ranger\\b","negate":false,"required":false},{"name":"Rapta","type":"releaseTitle","value":"\\[Rapta\\]|-Rapta\\b","negate":false,"required":false},{"name":"Raw Files","type":"releaseTitle","value":"\\b(M2TS|BDMV|BDVD)\\b","negate":false,"required":false},{"name":"Raze","type":"releaseTitle","value":"\\[Raze\\]|-Raze\\b","negate":false,"required":false},{"name":"Reaktor","type":"releaseTitle","value":"\\b(Reaktor)\\b","negate":false,"required":false},{"name":"RightShiftBy2","type":"releaseTitle","value":"\\b(RightShiftBy2)\\b","negate":false,"required":false},{"name":"Rip Time","type":"releaseTitle","value":"\\b(Rip[ .-]?Time)\\b","negate":false,"required":false},{"name":"SAD","type":"releaseTitle","value":"\\[SAD\\]|-SAD\\b","negate":false,"required":false},{"name":"Salieri","type":"releaseTitle","value":"\\b(Salieri)\\b","negate":false,"required":false},{"name":"Samir755","type":"releaseTitle","value":"\\b(Samir755)\\b","negate":false,"required":false},{"name":"SanKyuu","type":"releaseTitle","value":"\\b(SanKyuu)\\b","negate":false,"required":false},{"name":"SEiN","type":"releaseTitle","value":"\\[SEiN\\]|-SEiN\\b","negate":false,"required":false},{"name":"sekkusu&ok","type":"releaseTitle","value":"\\b(sekkusu&ok)\\b","negate":false,"required":false},{"name":"SHFS","type":"releaseTitle","value":"\\b(SHFS)\\b","negate":false,"required":false},{"name":"shincaps","type":"releaseTitle","value":"\\b(shincaps)\\b","negate":false,"required":false},{"name":"SLAX","type":"releaseTitle","value":"\\b(SLAX)\\b","negate":false,"required":false},{"name":"Sokudo","type":"releaseTitle","value":"\\[Sokudo\\]|-Sokudo\\b","negate":false,"required":false},{"name":"SRW","type":"releaseTitle","value":"\\b(SRW)\\b","negate":false,"required":false},{"name":"SSA","type":"releaseTitle","value":"\\b(SSA)\\b","negate":false,"required":false},{"name":"StrayGods","type":"releaseTitle","value":"\\b(StrayGods)\\b","negate":false,"required":false},{"name":"Suki Desu","type":"releaseTitle","value":"\\[Suki[ .-]?Desu\\]|-Suki[ .-]?Desu\\b","negate":false,"required":false},{"name":"TeamTurquoize","type":"releaseTitle","value":"\\b(TeamTurquoize)\\b","negate":false,"required":false},{"name":"Tenrai Sensei","type":"releaseTitle","value":"\\b(Tenrai[ .-]?Sensei)\\b","negate":false,"required":false},{"name":"TnF","type":"releaseTitle","value":"\\b(TnF)\\b","negate":false,"required":false},{"name":"TOPKEK","type":"releaseTitle","value":"\\b(TOPKEK)\\b","negate":false,"required":false},{"name":"Trix","type":"releaseTitle","value":"\\[Trix\\]|-Trix\\b","negate":false,"required":false},{"name":"U3-Web","type":"releaseTitle","value":"\\b(U3-Web)\\b","negate":false,"required":false},{"name":"UNBIASED","type":"releaseTitle","value":"\\[UNBIASED\\]|-UNBIASED\\b","negate":false,"required":false},{"name":"uP","type":"releaseTitle","value":"\\[uP\\]","negate":false,"required":false},{"name":"USD","type":"releaseTitle","value":"\\[USD\\]|-USD\\b","negate":false,"required":false},{"name":"Valenciano","type":"releaseTitle","value":"\\b(Valenciano)\\b","negate":false,"required":false},{"name":"VipapkStudios","type":"releaseTitle","value":"\\b(VipapkStudios)\\b","negate":false,"required":false},{"name":"Wardevil","type":"releaseTitle","value":"\\[Wardevil\\]|-Wardevil\\b","negate":false,"required":false},{"name":"WtF Anime","type":"releaseTitle","value":"\\b(WtF[ ._-]?Anime)\\b","negate":false,"required":false},{"name":"xiao-av1","type":"releaseTitle","value":"\\b(xiao-av1)\\b","negate":false,"required":false},{"name":"Yabai_Desu_NeRandomRemux","type":"releaseTitle","value":"\\b(Yabai_Desu_NeRandomRemux)\\b","negate":false,"required":false},{"name":"YakuboEncodes","type":"releaseTitle","value":"\\b(YakuboEncodes)\\b","negate":false,"required":false},{"name":"youshikibi","type":"releaseTitle","value":"\\b(youshikibi)\\b","negate":false,"required":false},{"name":"YuiSubs","type":"releaseTitle","value":"\\b(YuiSubs)\\b","negate":false,"required":false},{"name":"Yun","type":"releaseTitle","value":"\\[Yun\\]|-Yun\\b","negate":false,"required":false},{"name":"zza","type":"releaseTitle","value":"\\[zza\\]|-zza\\b","negate":false,"required":false}]', -10000, '["tv"]', 'Low-quality anime release groups', 'builtin', 0);--> statement-breakpoint
INSERT INTO custom_formats (name, category, specifications, default_score, content_types, description, origin, user_modified)
VALUES ('AV1', 'Unwanted', '[{"name":"AV1","type":"releaseTitle","value":"\\bAV1\\b","negate":false,"required":true}]', -10000, '["tv"]', 'AV1 codec - penalized for anime due to quality concerns', 'builtin', 0);--> statement-breakpoint
INSERT INTO custom_formats (name, category, specifications, default_score, content_types, description, origin, user_modified)
VALUES ('Dubs Only', 'Unwanted', '[{"name":"Dubbed","type":"releaseTitle","value":"^(?!.*(Dual|Multi)[-_. ]?Audio).*((?<!multi-)\\b(dub(bed)?)\\b|(funi|eng(lish)?)_?dub)","negate":false,"required":false},{"name":"Golumpa","type":"releaseTitle","value":"\\b(Golumpa)\\b","negate":false,"required":false},{"name":"KaiDubs (Not Dual Audio)","type":"releaseTitle","value":"^(?!.*(dual[ ._-]?audio|[([]dual[])]|(JA|ZH|KO)\\+EN|EN\\+(JA|ZH|KO))).*\\b(KaiDubs)\\b","negate":false,"required":false},{"name":"KamiFS","type":"releaseTitle","value":"\\b(KamiFS)\\b","negate":false,"required":false},{"name":"KS (Not Dual Audio)","type":"releaseTitle","value":"^(?!.*(dual[ ._-]?audio|[([]dual[])]|(JA|ZH|KO)\\+EN|EN\\+(JA|ZH|KO))).*\\bKS\\b","negate":false,"required":false},{"name":"torenter69","type":"releaseTitle","value":"\\b(torenter69)\\b","negate":false,"required":false},{"name":"Yameii","type":"releaseTitle","value":"\\[Yameii\\]|-Yameii\\b","negate":false,"required":false}]', -10000, '["tv"]', 'Dubbed-only anime releases without original audio', 'builtin', 0);--> statement-breakpoint
INSERT INTO custom_formats (name, category, specifications, default_score, content_types, description, origin, user_modified)
VALUES ('v0', 'Release Type', '[{"name":"v0","type":"releaseTitle","value":"(\\b|\\d)(v0)\\b","negate":false,"required":true}]', -51, '["tv"]', 'Version v0 release revision', 'builtin', 0);--> statement-breakpoint
INSERT INTO custom_formats (name, category, specifications, default_score, content_types, description, origin, user_modified)
VALUES ('v1', 'Release Type', '[{"name":"v1","type":"releaseTitle","value":"(\\b|\\d)(v1)\\b","negate":false,"required":true}]', 1, '["tv"]', 'Version v1 release revision', 'builtin', 0);--> statement-breakpoint
INSERT INTO custom_formats (name, category, specifications, default_score, content_types, description, origin, user_modified)
VALUES ('v2', 'Release Type', '[{"name":"v2","type":"releaseTitle","value":"(\\b|\\d)(v2)\\b","negate":false,"required":true}]', 2, '["tv"]', 'Version v2 release revision', 'builtin', 0);--> statement-breakpoint
INSERT INTO custom_formats (name, category, specifications, default_score, content_types, description, origin, user_modified)
VALUES ('v3', 'Release Type', '[{"name":"v3","type":"releaseTitle","value":"(\\b|\\d)(v3)\\b","negate":false,"required":true}]', 3, '["tv"]', 'Version v3 release revision', 'builtin', 0);--> statement-breakpoint
INSERT INTO custom_formats (name, category, specifications, default_score, content_types, description, origin, user_modified)
VALUES ('v4', 'Release Type', '[{"name":"v4","type":"releaseTitle","value":"(\\b|\\d)(v4)\\b","negate":false,"required":true}]', 4, '["tv"]', 'Version v4 release revision', 'builtin', 0);--> statement-breakpoint
INSERT INTO custom_formats (name, category, specifications, default_score, content_types, description, origin, user_modified)
VALUES ('10bit', 'Video Codec', '[{"name":"10bit","type":"releaseTitle","value":"10[.-]?bit","negate":false,"required":false},{"name":"hi10p","type":"releaseTitle","value":"hi10p","negate":false,"required":false}]', 0, '["tv"]', '10-bit color depth video encoding', 'builtin', 0);--> statement-breakpoint
INSERT INTO custom_formats (name, category, specifications, default_score, content_types, description, origin, user_modified)
VALUES ('Anime Dual Audio', 'Language', '[{"name":"Dual Audio","type":"releaseTitle","value":"dual[ ._-]?(audio)|[([]dual[])]|\\b(JA|ZH|KO)(?= ?\\+ ?.*?\\b(EN))|\\b(EN)(?= ?\\+ ?.*?\\b(JA|ZH|KO))|\\b(Japanese|Chinese|Korean) ?[ ._\\+&-] ?\\b(English)|\\b(English) ?[ ._\\+&-] ?\\b(Japanese|Chinese|Korean)|\\b(\\d{3,4}(p|i)|4K|U(ltra)?HD)\\b.*\\b(DUAL)\\b(?!.*\\(|\\))","negate":false,"required":true},{"name":"Not Single Language Only","type":"releaseTitle","value":"\\[(JA|ZH|KO)\\]","negate":true,"required":true},{"name":"Japanese Language","type":"language","value":"Japanese","negate":false,"required":false},{"name":"Chinese Language","type":"language","value":"Chinese","negate":false,"required":false},{"name":"Korean Language","type":"language","value":"Korean","negate":false,"required":false}]', 0, '["tv"]', 'Anime releases with both Japanese and English audio tracks', 'builtin', 0);--> statement-breakpoint
INSERT INTO custom_formats (name, category, specifications, default_score, content_types, description, origin, user_modified)
VALUES ('Uncensored', 'Edition', '[{"name":"Uncensored","type":"releaseTitle","value":"\\b(Uncut|Unrated|Uncensored|AT[-_. ]?X)\\b","negate":false,"required":true}]', 0, '["tv"]', 'Uncensored or uncut anime releases', 'builtin', 0);--> statement-breakpoint
INSERT INTO custom_formats (name, category, specifications, default_score, content_types, description, origin, user_modified)
VALUES ('CR', 'Streaming Service', '[{"name":"CR","type":"releaseTitle","value":"\\b(C(runchy)?[ .-]?R(oll)?)\\b","negate":false,"required":true},{"name":"WEBDL","type":"videoSource","value":"Web","negate":false,"required":false},{"name":"WEBRIP","type":"videoSource","value":"WebRip","negate":false,"required":false},{"name":"WEB","type":"videoSource","value":"Web","negate":false,"required":false}]', 6, '["tv"]', 'CR streaming service releases', 'builtin', 0);--> statement-breakpoint
INSERT INTO custom_formats (name, category, specifications, default_score, content_types, description, origin, user_modified)
VALUES ('DSNP', 'Streaming Service', '[{"name":"DSNP","type":"releaseTitle","value":"\\b(dsnp|dsny|disney|Disney\\+)\\b","negate":false,"required":true},{"name":"WEBDL","type":"videoSource","value":"Web","negate":false,"required":false},{"name":"WEBRIP","type":"videoSource","value":"WebRip","negate":false,"required":false}]', 5, '["tv"]', 'DSNP streaming service releases', 'builtin', 0);--> statement-breakpoint
INSERT INTO custom_formats (name, category, specifications, default_score, content_types, description, origin, user_modified)
VALUES ('NF', 'Streaming Service', '[{"name":"NF","type":"releaseTitle","value":"\\b(nf|netflix(u?hd)?)\\b","negate":false,"required":true},{"name":"WEBDL","type":"videoSource","value":"Web","negate":false,"required":false},{"name":"WEBRIP","type":"videoSource","value":"WebRip","negate":false,"required":false}]', 4, '["tv"]', 'NF streaming service releases', 'builtin', 0);--> statement-breakpoint
INSERT INTO custom_formats (name, category, specifications, default_score, content_types, description, origin, user_modified)
VALUES ('AMZN', 'Streaming Service', '[{"name":"AMZN","type":"releaseTitle","value":"\\b(amzn|amazon(hd)?)\\b","negate":false,"required":true},{"name":"WEBDL","type":"videoSource","value":"Web","negate":false,"required":false},{"name":"WEBRIP","type":"videoSource","value":"WebRip","negate":false,"required":false}]', 3, '["tv"]', 'AMZN streaming service releases', 'builtin', 0);--> statement-breakpoint
INSERT INTO custom_formats (name, category, specifications, default_score, content_types, description, origin, user_modified)
VALUES ('VRV', 'Streaming Service', '[{"name":"VRV","type":"releaseTitle","value":"\\b(VRV)\\b","negate":false,"required":true},{"name":"WEBDL","type":"videoSource","value":"Web","negate":false,"required":false},{"name":"WEBRIP","type":"videoSource","value":"WebRip","negate":false,"required":false},{"name":"WEB","type":"videoSource","value":"Web","negate":false,"required":false}]', 3, '["tv"]', 'VRV streaming service releases', 'builtin', 0);--> statement-breakpoint
INSERT INTO custom_formats (name, category, specifications, default_score, content_types, description, origin, user_modified)
VALUES ('FUNi', 'Streaming Service', '[{"name":"FUNi","type":"releaseTitle","value":"\\b(FUNi(mation)?)\\b","negate":false,"required":true},{"name":"WEBDL","type":"videoSource","value":"Web","negate":false,"required":false},{"name":"WEBRIP","type":"videoSource","value":"WebRip","negate":false,"required":false},{"name":"WEB","type":"videoSource","value":"Web","negate":false,"required":false}]', 2, '["tv"]', 'FUNi streaming service releases', 'builtin', 0);--> statement-breakpoint
INSERT INTO custom_formats (name, category, specifications, default_score, content_types, description, origin, user_modified)
VALUES ('ABEMA', 'Streaming Service', '[{"name":"ABEMA","type":"releaseTitle","value":"\\b(ABEMA[ ._-]?(TV)?)\\b","negate":false,"required":true},{"name":"WEBDL","type":"videoSource","value":"Web","negate":false,"required":false},{"name":"WEBRIP","type":"videoSource","value":"WebRip","negate":false,"required":false},{"name":"WEB","type":"videoSource","value":"Web","negate":false,"required":false}]', 1, '["tv"]', 'ABEMA streaming service releases', 'builtin', 0);--> statement-breakpoint
INSERT INTO custom_formats (name, category, specifications, default_score, content_types, description, origin, user_modified)
VALUES ('ADN', 'Streaming Service', '[{"name":"ADN","type":"releaseTitle","value":"\\b(ADN|Anime Digital Network)\\b","negate":false,"required":true},{"name":"WEBDL","type":"videoSource","value":"Web","negate":false,"required":false},{"name":"WEBRIP","type":"videoSource","value":"WebRip","negate":false,"required":false},{"name":"WEB","type":"videoSource","value":"Web","negate":false,"required":false}]', 1, '["tv"]', 'ADN streaming service releases', 'builtin', 0);--> statement-breakpoint
INSERT INTO custom_formats (name, category, specifications, default_score, content_types, description, origin, user_modified)
VALUES ('B-Global', 'Streaming Service', '[{"name":"B-Global","type":"releaseTitle","value":"\\b(B[ .-]?Global)\\b","negate":false,"required":true},{"name":"WEBDL","type":"videoSource","value":"Web","negate":false,"required":false},{"name":"WEBRIP","type":"videoSource","value":"WebRip","negate":false,"required":false},{"name":"WEB","type":"videoSource","value":"Web","negate":false,"required":false}]', 0, '["tv"]', 'B-Global streaming service releases', 'builtin', 0);--> statement-breakpoint
INSERT INTO custom_formats (name, category, specifications, default_score, content_types, description, origin, user_modified)
VALUES ('Bilibili', 'Streaming Service', '[{"name":"Bilibili","type":"releaseTitle","value":"\\b(Bili(bili)?)\\b","negate":false,"required":true},{"name":"WEBDL","type":"videoSource","value":"Web","negate":false,"required":false},{"name":"WEBRIP","type":"videoSource","value":"WebRip","negate":false,"required":false},{"name":"WEB","type":"videoSource","value":"Web","negate":false,"required":false}]', 0, '["tv"]', 'Bilibili streaming service releases', 'builtin', 0);--> statement-breakpoint
INSERT INTO custom_formats (name, category, specifications, default_score, content_types, description, origin, user_modified)
VALUES ('HIDIVE', 'Streaming Service', '[{"name":"HIDIVE","type":"releaseTitle","value":"\\b(HIDI(VE)?)\\b","negate":false,"required":true},{"name":"WEBDL","type":"videoSource","value":"Web","negate":false,"required":false},{"name":"WEBRIP","type":"videoSource","value":"WebRip","negate":false,"required":false},{"name":"WEB","type":"videoSource","value":"Web","negate":false,"required":false}]', 0, '["tv"]', 'HIDIVE streaming service releases', 'builtin', 0);--> statement-breakpoint
INSERT INTO profile_custom_formats (profile_id, custom_format_id, score)
SELECT
  (SELECT id FROM download_profiles WHERE name = 'Anime 1080p'),
  cf.id,
  CASE cf.name
    WHEN 'Anime BD Tier 01' THEN 1400
    WHEN 'Anime BD Tier 02' THEN 1300
    WHEN 'Anime BD Tier 03' THEN 1200
    WHEN 'Anime BD Tier 04' THEN 1100
    WHEN 'Anime BD Tier 05' THEN 1000
    WHEN 'Anime BD Tier 06' THEN 900
    WHEN 'Anime BD Tier 07' THEN 800
    WHEN 'Anime BD Tier 08' THEN 700
    WHEN 'Anime Web Tier 01' THEN 600
    WHEN 'Anime Web Tier 02' THEN 500
    WHEN 'Anime Web Tier 03' THEN 400
    WHEN 'Anime Web Tier 04' THEN 300
    WHEN 'Anime Web Tier 05' THEN 200
    WHEN 'Anime Web Tier 06' THEN 100
    WHEN 'Remux Tier 01' THEN 975
    WHEN 'Remux Tier 02' THEN 950
    WHEN 'Anime Raws' THEN -10000
    WHEN 'Anime LQ Groups' THEN -10000
    WHEN 'AV1' THEN -10000
    WHEN 'Dubs Only' THEN -10000
    WHEN 'v0' THEN -51
    WHEN 'v1' THEN 1
    WHEN 'v2' THEN 2
    WHEN 'v3' THEN 3
    WHEN 'v4' THEN 4
    WHEN '10bit' THEN 0
    WHEN 'Anime Dual Audio' THEN 0
    WHEN 'Uncensored' THEN 0
    WHEN 'CR' THEN 6
    WHEN 'DSNP' THEN 5
    WHEN 'NF' THEN 4
    WHEN 'AMZN' THEN 3
    WHEN 'VRV' THEN 3
    WHEN 'FUNi' THEN 2
    WHEN 'ABEMA' THEN 1
    WHEN 'ADN' THEN 1
    WHEN 'B-Global' THEN 0
    WHEN 'Bilibili' THEN 0
    WHEN 'HIDIVE' THEN 0
  END
FROM custom_formats cf
WHERE cf.name IN ('Anime BD Tier 01', 'Anime BD Tier 02', 'Anime BD Tier 03', 'Anime BD Tier 04', 'Anime BD Tier 05', 'Anime BD Tier 06', 'Anime BD Tier 07', 'Anime BD Tier 08', 'Anime Web Tier 01', 'Anime Web Tier 02', 'Anime Web Tier 03', 'Anime Web Tier 04', 'Anime Web Tier 05', 'Anime Web Tier 06', 'Remux Tier 01', 'Remux Tier 02', 'Anime Raws', 'Anime LQ Groups', 'AV1', 'Dubs Only', 'v0', 'v1', 'v2', 'v3', 'v4', '10bit', 'Anime Dual Audio', 'Uncensored', 'CR', 'DSNP', 'NF', 'AMZN', 'VRV', 'FUNi', 'ABEMA', 'ADN', 'B-Global', 'Bilibili', 'HIDIVE')
AND cf.origin = 'builtin';
