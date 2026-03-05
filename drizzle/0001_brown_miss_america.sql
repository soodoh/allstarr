ALTER TABLE `author_quality_profiles` RENAME TO `author_download_profiles`;--> statement-breakpoint
ALTER TABLE `edition_quality_profiles` RENAME TO `edition_download_profiles`;--> statement-breakpoint
ALTER TABLE `quality_profiles` RENAME TO `download_profiles`;--> statement-breakpoint
ALTER TABLE `quality_definitions` RENAME TO `download_formats`;--> statement-breakpoint
ALTER TABLE `author_download_profiles` RENAME COLUMN "quality_profile_id" TO "download_profile_id";--> statement-breakpoint
ALTER TABLE `edition_download_profiles` RENAME COLUMN "quality_profile_id" TO "download_profile_id";--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_author_download_profiles` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`author_id` integer NOT NULL,
	`download_profile_id` integer NOT NULL,
	FOREIGN KEY (`author_id`) REFERENCES `authors`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`download_profile_id`) REFERENCES `download_profiles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_author_download_profiles`("id", "author_id", "download_profile_id") SELECT "id", "author_id", "download_profile_id" FROM `author_download_profiles`;--> statement-breakpoint
DROP TABLE `author_download_profiles`;--> statement-breakpoint
ALTER TABLE `__new_author_download_profiles` RENAME TO `author_download_profiles`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `author_download_profiles_author_id_download_profile_id_unique` ON `author_download_profiles` (`author_id`,`download_profile_id`);--> statement-breakpoint
CREATE TABLE `__new_edition_download_profiles` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`edition_id` integer NOT NULL,
	`download_profile_id` integer NOT NULL,
	FOREIGN KEY (`edition_id`) REFERENCES `editions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`download_profile_id`) REFERENCES `download_profiles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_edition_download_profiles`("id", "edition_id", "download_profile_id") SELECT "id", "edition_id", "download_profile_id" FROM `edition_download_profiles`;--> statement-breakpoint
DROP TABLE `edition_download_profiles`;--> statement-breakpoint
ALTER TABLE `__new_edition_download_profiles` RENAME TO `edition_download_profiles`;--> statement-breakpoint
CREATE UNIQUE INDEX `edition_download_profiles_edition_id_download_profile_id_unique` ON `edition_download_profiles` (`edition_id`,`download_profile_id`);