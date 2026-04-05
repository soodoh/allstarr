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
	`impersonated_by` text,
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
	`updated_at` integer NOT NULL,
	`role` text,
	`banned` integer DEFAULT false,
	`ban_reason` text,
	`ban_expires` integer
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
CREATE TABLE `oidc_providers` (
	`id` text PRIMARY KEY NOT NULL,
	`provider_id` text NOT NULL,
	`display_name` text NOT NULL,
	`client_id` text NOT NULL,
	`client_secret` text NOT NULL,
	`discovery_url` text NOT NULL,
	`scopes` text DEFAULT '["openid","profile","email"]' NOT NULL,
	`trusted` integer DEFAULT false NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `oidc_providers_provider_id_unique` ON `oidc_providers` (`provider_id`);--> statement-breakpoint
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