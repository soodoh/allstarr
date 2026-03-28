ALTER TABLE `scheduled_tasks` ADD `progress` text;--> statement-breakpoint
ALTER TABLE `scheduled_tasks` ADD `group` text DEFAULT 'maintenance' NOT NULL;
--> statement-breakpoint
-- Rename refresh-metadata to refresh-hardcover-metadata
UPDATE scheduled_tasks SET id = 'refresh-hardcover-metadata', name = 'Refresh Hardcover Metadata' WHERE id = 'refresh-metadata';
--> statement-breakpoint
-- Set group values for existing tasks
UPDATE scheduled_tasks SET "group" = 'search' WHERE id = 'rss-sync';
--> statement-breakpoint
UPDATE scheduled_tasks SET "group" = 'metadata' WHERE id = 'refresh-hardcover-metadata';
--> statement-breakpoint
UPDATE scheduled_tasks SET "group" = 'metadata' WHERE id = 'refresh-tmdb-metadata';
--> statement-breakpoint
UPDATE scheduled_tasks SET "group" = 'media' WHERE id = 'refresh-downloads';
--> statement-breakpoint
UPDATE scheduled_tasks SET "group" = 'media' WHERE id = 'rescan-folders';
--> statement-breakpoint
UPDATE scheduled_tasks SET "group" = 'maintenance' WHERE id IN ('check-health', 'housekeeping', 'backup');