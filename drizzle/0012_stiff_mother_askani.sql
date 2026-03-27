CREATE TABLE `manga` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text NOT NULL,
	`sort_title` text NOT NULL,
	`overview` text DEFAULT '' NOT NULL,
	`manga_updates_id` integer NOT NULL,
	`manga_updates_slug` text,
	`type` text DEFAULT 'manga' NOT NULL,
	`year` text,
	`status` text DEFAULT 'ongoing' NOT NULL,
	`latest_chapter` integer,
	`poster_url` text DEFAULT '' NOT NULL,
	`fanart_url` text DEFAULT '' NOT NULL,
	`images` text,
	`tags` text,
	`genres` text,
	`monitored` integer DEFAULT true,
	`monitor_new_chapters` text DEFAULT 'all' NOT NULL,
	`path` text DEFAULT '' NOT NULL,
	`created_at` integer,
	`updated_at` integer,
	`metadata_updated_at` integer,
	CONSTRAINT `manga_manga_updates_id_unique` UNIQUE(`manga_updates_id`)
);--> statement-breakpoint
CREATE TABLE `manga_volumes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`manga_id` integer NOT NULL,
	`volume_number` integer,
	`title` text,
	`monitored` integer DEFAULT true,
	CONSTRAINT `manga_volumes_manga_volume_unique` UNIQUE(`manga_id`,`volume_number`),
	FOREIGN KEY (`manga_id`) REFERENCES `manga`(`id`) ON UPDATE no action ON DELETE cascade
);--> statement-breakpoint
CREATE TABLE `manga_chapters` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`manga_volume_id` integer NOT NULL,
	`manga_id` integer NOT NULL,
	`chapter_number` text NOT NULL,
	`title` text,
	`release_date` text,
	`scanlation_group` text,
	`has_file` integer DEFAULT false,
	`monitored` integer DEFAULT true,
	FOREIGN KEY (`manga_volume_id`) REFERENCES `manga_volumes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`manga_id`) REFERENCES `manga`(`id`) ON UPDATE no action ON DELETE cascade
);--> statement-breakpoint
CREATE TABLE `manga_files` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`chapter_id` integer NOT NULL,
	`path` text NOT NULL,
	`size` integer DEFAULT 0 NOT NULL,
	`format` text,
	`quality` text,
	`scanlation_group` text,
	`language` text,
	`date_added` integer NOT NULL,
	FOREIGN KEY (`chapter_id`) REFERENCES `manga_chapters`(`id`) ON UPDATE no action ON DELETE cascade
);--> statement-breakpoint
CREATE TABLE `manga_download_profiles` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`manga_id` integer NOT NULL,
	`download_profile_id` integer NOT NULL,
	CONSTRAINT `manga_download_profiles_manga_id_download_profile_id_unique` UNIQUE(`manga_id`,`download_profile_id`),
	FOREIGN KEY (`manga_id`) REFERENCES `manga`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`download_profile_id`) REFERENCES `download_profiles`(`id`) ON UPDATE no action ON DELETE cascade
);--> statement-breakpoint
CREATE UNIQUE INDEX `manga_manga_updates_id_unique` ON `manga` (`manga_updates_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `manga_volumes_manga_volume_unique` ON `manga_volumes` (`manga_id`,`volume_number`);--> statement-breakpoint
CREATE UNIQUE INDEX `manga_download_profiles_manga_id_download_profile_id_unique` ON `manga_download_profiles` (`manga_id`,`download_profile_id`);
