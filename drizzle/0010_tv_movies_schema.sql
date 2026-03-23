-- ============================================================
-- 0010_tv_movies_schema
-- Adds shows, seasons, episodes, movies tables and related files/join tables
-- ============================================================

-- ------------------------------------------------------------
-- 1. shows
-- ------------------------------------------------------------
CREATE TABLE `shows` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text NOT NULL,
	`sort_title` text NOT NULL,
	`overview` text NOT NULL DEFAULT '',
	`tmdb_id` integer NOT NULL,
	`imdb_id` text,
	`status` text NOT NULL DEFAULT 'continuing',
	`series_type` text NOT NULL DEFAULT 'standard',
	`network` text NOT NULL DEFAULT '',
	`year` integer NOT NULL DEFAULT 0,
	`runtime` integer NOT NULL DEFAULT 0,
	`genres` text NOT NULL DEFAULT '[]',
	`tags` text NOT NULL DEFAULT '[]',
	`poster_url` text NOT NULL DEFAULT '',
	`fanart_url` text NOT NULL DEFAULT '',
	`monitored` integer NOT NULL DEFAULT 1,
	`path` text NOT NULL DEFAULT '',
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `shows_tmdb_id_unique` ON `shows` (`tmdb_id`);
--> statement-breakpoint

-- ------------------------------------------------------------
-- 2. seasons
-- ------------------------------------------------------------
CREATE TABLE `seasons` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`show_id` integer NOT NULL REFERENCES `shows`(`id`) ON DELETE CASCADE,
	`season_number` integer NOT NULL,
	`monitored` integer NOT NULL DEFAULT 1,
	`overview` text,
	`poster_url` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `seasons_show_id_season_number_unique` ON `seasons` (`show_id`, `season_number`);
--> statement-breakpoint

-- ------------------------------------------------------------
-- 3. episodes
-- ------------------------------------------------------------
CREATE TABLE `episodes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`show_id` integer NOT NULL REFERENCES `shows`(`id`) ON DELETE CASCADE,
	`season_id` integer NOT NULL REFERENCES `seasons`(`id`) ON DELETE CASCADE,
	`episode_number` integer NOT NULL,
	`absolute_number` integer,
	`title` text NOT NULL DEFAULT '',
	`overview` text,
	`air_date` text,
	`runtime` integer,
	`tmdb_id` integer NOT NULL,
	`has_file` integer NOT NULL DEFAULT 0,
	`monitored` integer NOT NULL DEFAULT 1
);
--> statement-breakpoint
CREATE UNIQUE INDEX `episodes_tmdb_id_unique` ON `episodes` (`tmdb_id`);
--> statement-breakpoint

-- ------------------------------------------------------------
-- 4. episode_files
-- ------------------------------------------------------------
CREATE TABLE `episode_files` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`episode_id` integer NOT NULL REFERENCES `episodes`(`id`) ON DELETE CASCADE,
	`path` text NOT NULL,
	`size` integer NOT NULL DEFAULT 0,
	`quality` text,
	`date_added` integer NOT NULL,
	`scene_name` text,
	`duration` integer,
	`codec` text,
	`container` text
);
--> statement-breakpoint

-- ------------------------------------------------------------
-- 5. movies
-- ------------------------------------------------------------
CREATE TABLE `movies` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text NOT NULL,
	`sort_title` text NOT NULL,
	`overview` text NOT NULL DEFAULT '',
	`tmdb_id` integer NOT NULL,
	`imdb_id` text,
	`status` text NOT NULL DEFAULT 'announced',
	`studio` text NOT NULL DEFAULT '',
	`year` integer NOT NULL DEFAULT 0,
	`runtime` integer NOT NULL DEFAULT 0,
	`genres` text NOT NULL DEFAULT '[]',
	`tags` text NOT NULL DEFAULT '[]',
	`poster_url` text NOT NULL DEFAULT '',
	`fanart_url` text NOT NULL DEFAULT '',
	`monitored` integer NOT NULL DEFAULT 1,
	`minimum_availability` text NOT NULL DEFAULT 'released',
	`path` text NOT NULL DEFAULT '',
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `movies_tmdb_id_unique` ON `movies` (`tmdb_id`);
--> statement-breakpoint

-- ------------------------------------------------------------
-- 6. movie_files
-- ------------------------------------------------------------
CREATE TABLE `movie_files` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`movie_id` integer NOT NULL REFERENCES `movies`(`id`) ON DELETE CASCADE,
	`path` text NOT NULL,
	`size` integer NOT NULL DEFAULT 0,
	`quality` text,
	`date_added` integer NOT NULL,
	`scene_name` text,
	`duration` integer,
	`codec` text,
	`container` text
);
--> statement-breakpoint

-- ------------------------------------------------------------
-- 7. show_download_profiles (join table)
-- ------------------------------------------------------------
CREATE TABLE `show_download_profiles` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`show_id` integer NOT NULL REFERENCES `shows`(`id`) ON DELETE CASCADE,
	`download_profile_id` integer NOT NULL REFERENCES `download_profiles`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE UNIQUE INDEX `show_download_profiles_show_id_download_profile_id_unique` ON `show_download_profiles` (`show_id`, `download_profile_id`);
--> statement-breakpoint

-- ------------------------------------------------------------
-- 8. movie_download_profiles (join table)
-- ------------------------------------------------------------
CREATE TABLE `movie_download_profiles` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`movie_id` integer NOT NULL REFERENCES `movies`(`id`) ON DELETE CASCADE,
	`download_profile_id` integer NOT NULL REFERENCES `download_profiles`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE UNIQUE INDEX `movie_download_profiles_movie_id_download_profile_id_unique` ON `movie_download_profiles` (`movie_id`, `download_profile_id`);
--> statement-breakpoint

-- ------------------------------------------------------------
-- 9. Extend history
-- ------------------------------------------------------------
ALTER TABLE `history` ADD COLUMN `show_id` integer REFERENCES `shows`(`id`) ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE `history` ADD COLUMN `episode_id` integer REFERENCES `episodes`(`id`) ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE `history` ADD COLUMN `movie_id` integer REFERENCES `movies`(`id`) ON DELETE SET NULL;
--> statement-breakpoint

-- ------------------------------------------------------------
-- 10. Extend tracked_downloads
-- ------------------------------------------------------------
ALTER TABLE `tracked_downloads` ADD COLUMN `show_id` integer REFERENCES `shows`(`id`) ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE `tracked_downloads` ADD COLUMN `episode_id` integer REFERENCES `episodes`(`id`) ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE `tracked_downloads` ADD COLUMN `movie_id` integer REFERENCES `movies`(`id`) ON DELETE SET NULL;
--> statement-breakpoint

-- ------------------------------------------------------------
-- 11. Extend blocklist
-- ------------------------------------------------------------
ALTER TABLE `blocklist` ADD COLUMN `show_id` integer REFERENCES `shows`(`id`) ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE `blocklist` ADD COLUMN `movie_id` integer REFERENCES `movies`(`id`) ON DELETE SET NULL;
--> statement-breakpoint

-- ------------------------------------------------------------
-- 12. Seed scheduled task
-- ------------------------------------------------------------
INSERT INTO `scheduled_tasks` (`id`, `name`, `interval`, `enabled`) VALUES ('refresh-tmdb-metadata', 'Refresh TMDB Metadata', 43200, 1);
