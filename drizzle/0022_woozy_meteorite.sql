CREATE TABLE `manga_sources` (
	`source_id` text PRIMARY KEY NOT NULL,
	`enabled` integer DEFAULT false NOT NULL,
	`config` text
);
--> statement-breakpoint
DROP TABLE `manga_download_profiles`;--> statement-breakpoint
DROP INDEX `manga_manga_updates_id_unique`;--> statement-breakpoint
ALTER TABLE `manga` ADD `source_id` text NOT NULL;--> statement-breakpoint
ALTER TABLE `manga` ADD `source_manga_url` text NOT NULL;--> statement-breakpoint
ALTER TABLE `manga` ADD `source_manga_thumbnail` text;--> statement-breakpoint
CREATE UNIQUE INDEX `manga_source_url_unique` ON `manga` (`source_id`,`source_manga_url`);--> statement-breakpoint
ALTER TABLE `manga` DROP COLUMN `manga_updates_id`;--> statement-breakpoint
ALTER TABLE `manga` DROP COLUMN `manga_updates_slug`;--> statement-breakpoint
ALTER TABLE `manga` DROP COLUMN `wikipedia_page_title`;--> statement-breakpoint
ALTER TABLE `manga` DROP COLUMN `wikipedia_fetched_at`;--> statement-breakpoint
ALTER TABLE `manga` DROP COLUMN `manga_dex_id`;--> statement-breakpoint
ALTER TABLE `manga` DROP COLUMN `manga_dex_fetched_at`;--> statement-breakpoint
ALTER TABLE `manga_chapters` ADD `source_chapter_url` text;--> statement-breakpoint
ALTER TABLE `manga_volumes` DROP COLUMN `mapping_source`;