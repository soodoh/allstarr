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
CREATE TABLE `author_download_profiles` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`author_id` integer NOT NULL,
	`download_profile_id` integer NOT NULL,
	FOREIGN KEY (`author_id`) REFERENCES `authors`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`download_profile_id`) REFERENCES `download_profiles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `author_download_profiles_author_id_download_profile_id_unique` ON `author_download_profiles` (`author_id`,`download_profile_id`);--> statement-breakpoint
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
CREATE TABLE `edition_download_profiles` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`edition_id` integer NOT NULL,
	`download_profile_id` integer NOT NULL,
	FOREIGN KEY (`edition_id`) REFERENCES `editions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`download_profile_id`) REFERENCES `download_profiles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `edition_download_profiles_edition_id_download_profile_id_unique` ON `edition_download_profiles` (`edition_id`,`download_profile_id`);--> statement-breakpoint
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
CREATE TABLE `download_profiles` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`root_folder_path` text DEFAULT '' NOT NULL,
	`cutoff` integer DEFAULT 0 NOT NULL,
	`items` text DEFAULT '[]' NOT NULL,
	`upgrade_allowed` integer DEFAULT false NOT NULL,
	`icon` text DEFAULT 'book-open' NOT NULL,
	`categories` text DEFAULT '[]' NOT NULL,
	`type` text DEFAULT 'ebook' NOT NULL,
	`content_type` text DEFAULT 'book' NOT NULL,
	`language` text DEFAULT 'en' NOT NULL,
	`min_custom_format_score` integer DEFAULT 0 NOT NULL,
	`upgrade_until_custom_format_score` integer DEFAULT 0 NOT NULL
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
	`type` text DEFAULT 'ebook' NOT NULL,
	`source` text,
	`resolution` integer DEFAULT 0 NOT NULL,
	`no_max_limit` integer DEFAULT 0 NOT NULL,
	`no_preferred_limit` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
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
	`monitored` integer DEFAULT true,
	FOREIGN KEY (`show_id`) REFERENCES `shows`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`season_id`) REFERENCES `seasons`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `episodes_tmdb_id_unique` ON `episodes` (`tmdb_id`);--> statement-breakpoint
CREATE TABLE `seasons` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`show_id` integer NOT NULL,
	`season_number` integer NOT NULL,
	`monitored` integer DEFAULT true,
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
	`monitored` integer DEFAULT true,
	`path` text DEFAULT '' NOT NULL,
	`created_at` integer,
	`updated_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `shows_tmdb_id_unique` ON `shows` (`tmdb_id`);--> statement-breakpoint
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
CREATE TABLE `show_download_profiles` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`show_id` integer NOT NULL,
	`download_profile_id` integer NOT NULL,
	FOREIGN KEY (`show_id`) REFERENCES `shows`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`download_profile_id`) REFERENCES `download_profiles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `show_download_profiles_show_id_download_profile_id_unique` ON `show_download_profiles` (`show_id`,`download_profile_id`);--> statement-breakpoint
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
	`monitored` integer DEFAULT true,
	`minimum_availability` text DEFAULT 'released' NOT NULL,
	`path` text DEFAULT '' NOT NULL,
	`created_at` integer,
	`updated_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `movies_tmdb_id_unique` ON `movies` (`tmdb_id`);--> statement-breakpoint
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
CREATE TABLE `movie_download_profiles` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`movie_id` integer NOT NULL,
	`download_profile_id` integer NOT NULL,
	FOREIGN KEY (`movie_id`) REFERENCES `movies`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`download_profile_id`) REFERENCES `download_profiles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `movie_download_profiles_movie_id_download_profile_id_unique` ON `movie_download_profiles` (`movie_id`,`download_profile_id`);--> statement-breakpoint
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
	`tag` text,
	`remove_completed_downloads` integer DEFAULT true NOT NULL,
	`settings` text,
	`created_at` integer,
	`updated_at` integer
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
	`created_at` integer,
	`updated_at` integer,
	FOREIGN KEY (`download_client_id`) REFERENCES `download_clients`(`id`) ON UPDATE no action ON DELETE set null
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
	`tag` text,
	`download_client_id` integer,
	`created_at` integer,
	`updated_at` integer,
	FOREIGN KEY (`download_client_id`) REFERENCES `download_clients`(`id`) ON UPDATE no action ON DELETE set null
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

-- ============================================================
-- Seed Data
-- ============================================================

-- Download Formats: Ebook
INSERT INTO download_formats (title, weight, min_size, max_size, preferred_size, color, type, no_max_limit, no_preferred_limit) VALUES
  ('Unknown Text', 1, 0,    100,  100,  'gray',   'ebook', 1, 1),
  ('PDF',          2, 0,    50,   5,    'yellow', 'ebook', 0, 0),
  ('MOBI',         3, 0,    15,   2,    'amber',  'ebook', 0, 0),
  ('EPUB',         4, 0,    15,   1.5,  'green',  'ebook', 0, 0),
  ('AZW3',         5, 0,    15,   2,    'blue',   'ebook', 0, 0);--> statement-breakpoint

-- Download Formats: Audio
INSERT INTO download_formats (title, weight, min_size, max_size, preferred_size, color, type, no_max_limit, no_preferred_limit) VALUES
  ('Unknown Audio', 1, 0,    1500, 1500, 'gray',   'audio', 1, 1),
  ('MP3',           6, 0,    350,  195,  'orange', 'audio', 0, 0),
  ('M4B',           7, 0,    350,  195,  'cyan',   'audio', 0, 0),
  ('FLAC',          8, 0,    1500, 895,  'purple', 'audio', 1, 0);--> statement-breakpoint

-- Download Formats: Video
INSERT INTO download_formats (title, weight, min_size, max_size, preferred_size, color, type, source, resolution, no_max_limit, no_preferred_limit) VALUES
  ('Unknown Video',  0,  0,     2000, 2000, 'gray',   'video', 'Unknown',    0,    1, 1),
  ('SDTV',           1,  5,     2000, 2000, 'gray',   'video', 'Television', 480,  1, 1),
  ('WEBRip-480p',    2,  5,     2000, 2000, 'gray',   'video', 'WebRip',     480,  1, 1),
  ('WEBDL-480p',     3,  5,     2000, 2000, 'gray',   'video', 'Web',        480,  1, 1),
  ('DVD',            4,  5,     2000, 2000, 'yellow', 'video', 'DVD',        480,  1, 1),
  ('Bluray-480p',    5,  5,     2000, 2000, 'gray',   'video', 'Bluray',     480,  1, 1),
  ('HDTV-720p',      10, 10,    2000, 2000, 'green',  'video', 'Television', 720,  1, 1),
  ('WEBRip-720p',    11, 10,    2000, 2000, 'green',  'video', 'WebRip',     720,  1, 1),
  ('WEBDL-720p',     12, 10,    2000, 2000, 'green',  'video', 'Web',        720,  1, 1),
  ('Bluray-720p',    13, 17.1,  2000, 2000, 'green',  'video', 'Bluray',     720,  1, 1),
  ('HDTV-1080p',     20, 15,    2000, 2000, 'green',  'video', 'Television', 1080, 1, 1),
  ('WEBRip-1080p',   21, 15,    2000, 2000, 'green',  'video', 'WebRip',     1080, 1, 1),
  ('WEBDL-1080p',    22, 15,    2000, 2000, 'green',  'video', 'Web',        1080, 1, 1),
  ('Bluray-1080p',   23, 50.4,  2000, 2000, 'blue',   'video', 'Bluray',     1080, 1, 1),
  ('Remux-1080p',    24, 69.1,  2000, 2000, 'cyan',   'video', 'BlurayRaw',  1080, 1, 1),
  ('HDTV-2160p',     30, 25,    2000, 2000, 'purple', 'video', 'Television', 2160, 1, 1),
  ('WEBRip-2160p',   31, 25,    2000, 2000, 'purple', 'video', 'WebRip',     2160, 1, 1),
  ('WEBDL-2160p',    32, 25,    2000, 2000, 'purple', 'video', 'Web',        2160, 1, 1),
  ('Bluray-2160p',   33, 94.6,  2000, 2000, 'purple', 'video', 'Bluray',     2160, 1, 1),
  ('Remux-2160p',    34, 187.4, 2000, 2000, 'purple', 'video', 'BlurayRaw',  2160, 1, 1);--> statement-breakpoint

-- Download Profiles: Book
INSERT INTO download_profiles (name, root_folder_path, cutoff, items, upgrade_allowed, icon, categories, type, content_type, language, min_custom_format_score, upgrade_until_custom_format_score) VALUES
  ('Ebook',     './data/books',      0, '[[4],[5],[3],[2]]', 0, 'book-marked',  '[7020,8010]', 'ebook', 'book', 'en', 0, 2000),
  ('Audiobook', './data/audiobooks', 0, '[[7],[8],[6]]',     0, 'audio-lines',  '[3030]',      'audio', 'book', 'en', 0, 1000);--> statement-breakpoint

-- Download Profiles: Video (items populated via UPDATE below)
INSERT INTO download_profiles (name, root_folder_path, cutoff, items, upgrade_allowed, icon, categories, type, content_type, language, min_custom_format_score, upgrade_until_custom_format_score) VALUES
  ('WEB-1080p',       './data/tv',     0, '[]', 1, 'tv',            '[5030,5040,5045]',      'video', 'tv',    'en', 0, 5000),
  ('WEB-2160p',       './data/tv',     0, '[]', 1, 'hd',            '[5030,5040,5045]',      'video', 'tv',    'en', 0, 5000),
  ('HD Bluray + WEB', './data/movies', 0, '[]', 1, 'film',          '[2030,2040,2045,2050]',  'video', 'movie', 'en', 0, 10000),
  ('Remux + WEB 2160p','./data/movies',0, '[]', 1, 'hd',            '[2030,2040,2045,2050]',  'video', 'movie', 'en', 0, 10000);--> statement-breakpoint

-- Video profile items (grouped format arrays)
UPDATE download_profiles SET
  cutoff = (SELECT id FROM download_formats WHERE title = 'WEBDL-1080p' AND type = 'video' LIMIT 1),
  items = json_array(
    json_array((SELECT id FROM download_formats WHERE title = 'WEBDL-1080p'  AND type = 'video' LIMIT 1)),
    json_array((SELECT id FROM download_formats WHERE title = 'WEBRip-1080p' AND type = 'video' LIMIT 1)),
    json_array((SELECT id FROM download_formats WHERE title = 'HDTV-1080p'   AND type = 'video' LIMIT 1))
  )
WHERE name = 'WEB-1080p';--> statement-breakpoint

UPDATE download_profiles SET
  cutoff = (SELECT id FROM download_formats WHERE title = 'WEBDL-2160p' AND type = 'video' LIMIT 1),
  items = json_array(
    json_array((SELECT id FROM download_formats WHERE title = 'WEBDL-2160p'  AND type = 'video' LIMIT 1)),
    json_array((SELECT id FROM download_formats WHERE title = 'WEBRip-2160p' AND type = 'video' LIMIT 1)),
    json_array((SELECT id FROM download_formats WHERE title = 'Bluray-2160p' AND type = 'video' LIMIT 1))
  )
WHERE name = 'WEB-2160p';--> statement-breakpoint

UPDATE download_profiles SET
  cutoff = (SELECT id FROM download_formats WHERE title = 'Bluray-1080p' AND type = 'video' LIMIT 1),
  items = json_array(
    json_array((SELECT id FROM download_formats WHERE title = 'Bluray-1080p'  AND type = 'video' LIMIT 1)),
    json_array((SELECT id FROM download_formats WHERE title = 'WEBDL-1080p'   AND type = 'video' LIMIT 1)),
    json_array((SELECT id FROM download_formats WHERE title = 'WEBRip-1080p'  AND type = 'video' LIMIT 1)),
    json_array((SELECT id FROM download_formats WHERE title = 'Bluray-720p'   AND type = 'video' LIMIT 1)),
    json_array((SELECT id FROM download_formats WHERE title = 'WEBDL-720p'    AND type = 'video' LIMIT 1)),
    json_array((SELECT id FROM download_formats WHERE title = 'WEBRip-720p'   AND type = 'video' LIMIT 1))
  )
WHERE name = 'HD Bluray + WEB';--> statement-breakpoint

UPDATE download_profiles SET
  cutoff = (SELECT id FROM download_formats WHERE title = 'Remux-2160p' AND type = 'video' LIMIT 1),
  items = json_array(
    json_array((SELECT id FROM download_formats WHERE title = 'Remux-2160p'  AND type = 'video' LIMIT 1)),
    json_array((SELECT id FROM download_formats WHERE title = 'Bluray-2160p' AND type = 'video' LIMIT 1)),
    json_array((SELECT id FROM download_formats WHERE title = 'WEBDL-2160p'  AND type = 'video' LIMIT 1)),
    json_array((SELECT id FROM download_formats WHERE title = 'WEBRip-2160p' AND type = 'video' LIMIT 1)),
    json_array((SELECT id FROM download_formats WHERE title = 'Remux-1080p'  AND type = 'video' LIMIT 1)),
    json_array((SELECT id FROM download_formats WHERE title = 'Bluray-1080p' AND type = 'video' LIMIT 1)),
    json_array((SELECT id FROM download_formats WHERE title = 'WEBDL-1080p'  AND type = 'video' LIMIT 1))
  )
WHERE name = 'Remux + WEB 2160p';--> statement-breakpoint

-- Scheduled Tasks
INSERT INTO scheduled_tasks (id, name, interval, enabled) VALUES
  ('rss-sync',              'RSS Sync',              900,    1),
  ('refresh-metadata',      'Refresh Metadata',      43200,  1),
  ('check-health',          'Check Health',           1500,   1),
  ('housekeeping',          'Housekeeping',           86400,  1),
  ('backup',                'Backup Database',        604800, 1),
  ('rescan-folders',        'Rescan Folders',         21600,  1),
  ('refresh-downloads',     'Refresh Downloads',      60,     1),
  ('refresh-tmdb-metadata', 'Refresh TMDB Metadata',  43200,  1);--> statement-breakpoint

-- Settings
INSERT INTO settings (key, value) VALUES
  ('general.logLevel',       '"info"'),
  ('metadata.hardcover.profile', '{"skipMissingReleaseDate":false,"skipMissingIsbnAsin":false,"skipCompilations":true,"minimumPopularity":10,"minimumPages":0}'),
  ('format.defaultPageCount',    '300'),
  ('format.defaultAudioDuration','600'),
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
  ('mediaManagement.book.chownGroup',                '""');