-- ============================================================
-- 0011_custom_formats
-- Adds custom_formats table, profile_custom_formats join table,
-- and custom format score columns to download_profiles
-- ============================================================

-- ------------------------------------------------------------
-- 1. custom_formats
-- ------------------------------------------------------------
CREATE TABLE `custom_formats` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`category` text NOT NULL,
	`specifications` text NOT NULL DEFAULT '[]',
	`default_score` integer NOT NULL DEFAULT 0,
	`content_types` text NOT NULL DEFAULT '[]',
	`include_in_renaming` integer NOT NULL DEFAULT 0,
	`description` text,
	`origin` text,
	`user_modified` integer NOT NULL DEFAULT 0
);
--> statement-breakpoint

-- ------------------------------------------------------------
-- 2. profile_custom_formats (join table with score)
-- ------------------------------------------------------------
CREATE TABLE `profile_custom_formats` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`profile_id` integer NOT NULL REFERENCES `download_profiles`(`id`) ON DELETE CASCADE,
	`custom_format_id` integer NOT NULL REFERENCES `custom_formats`(`id`) ON DELETE CASCADE,
	`score` integer NOT NULL DEFAULT 0
);
--> statement-breakpoint
CREATE UNIQUE INDEX `profile_custom_format_idx` ON `profile_custom_formats` (`profile_id`, `custom_format_id`);
--> statement-breakpoint

-- ------------------------------------------------------------
-- 3. Add custom format score thresholds to download_profiles
-- ------------------------------------------------------------
ALTER TABLE `download_profiles` ADD COLUMN `min_custom_format_score` integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE `download_profiles` ADD COLUMN `upgrade_until_custom_format_score` integer NOT NULL DEFAULT 0;
