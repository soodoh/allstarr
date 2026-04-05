CREATE TABLE `series_download_profiles` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`series_id` integer NOT NULL,
	`download_profile_id` integer NOT NULL,
	FOREIGN KEY (`series_id`) REFERENCES `series`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`download_profile_id`) REFERENCES `download_profiles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `series_download_profiles_series_id_download_profile_id_unique` ON `series_download_profiles` (`series_id`,`download_profile_id`);