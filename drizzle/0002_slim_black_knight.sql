CREATE TABLE `episode_download_profiles` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`episode_id` integer NOT NULL,
	`download_profile_id` integer NOT NULL,
	FOREIGN KEY (`episode_id`) REFERENCES `episodes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`download_profile_id`) REFERENCES `download_profiles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `episode_download_profiles_episode_id_download_profile_id_unique` ON `episode_download_profiles` (`episode_id`,`download_profile_id`);--> statement-breakpoint
ALTER TABLE `episodes` DROP COLUMN `monitored`;--> statement-breakpoint
ALTER TABLE `seasons` DROP COLUMN `monitored`;--> statement-breakpoint
ALTER TABLE `shows` DROP COLUMN `monitored`;--> statement-breakpoint
ALTER TABLE `movies` DROP COLUMN `monitored`;