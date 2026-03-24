ALTER TABLE `download_formats` ADD `no_max_limit` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `download_formats` ADD `no_preferred_limit` integer DEFAULT 0 NOT NULL;--> statement-breakpoint

-- Backfill: set flags BEFORE updating NULL values (detection relies on IS NULL)
UPDATE download_formats SET no_max_limit = 1 WHERE max_size IS NULL;--> statement-breakpoint
UPDATE download_formats SET no_preferred_limit = 1 WHERE preferred_size IS NULL;--> statement-breakpoint

-- Backfill: set reasonable numeric max values for rows that were NULL
UPDATE download_formats SET max_size = 100  WHERE max_size IS NULL AND type = 'ebook';--> statement-breakpoint
UPDATE download_formats SET max_size = 1500 WHERE max_size IS NULL AND type = 'audio';--> statement-breakpoint
UPDATE download_formats SET max_size = 2000 WHERE max_size IS NULL AND type = 'video';--> statement-breakpoint

UPDATE download_formats SET preferred_size = 100  WHERE preferred_size IS NULL AND type = 'ebook';--> statement-breakpoint
UPDATE download_formats SET preferred_size = 1500 WHERE preferred_size IS NULL AND type = 'audio';--> statement-breakpoint
UPDATE download_formats SET preferred_size = 2000 WHERE preferred_size IS NULL AND type = 'video';--> statement-breakpoint

UPDATE download_formats SET min_size = 0 WHERE min_size IS NULL;--> statement-breakpoint

-- Fix artifacts from old slider saving 0 when at max position (meant "no limit")
UPDATE download_formats SET no_max_limit = 1, max_size = 100  WHERE max_size = 0 AND no_max_limit = 0 AND type = 'ebook';--> statement-breakpoint
UPDATE download_formats SET no_max_limit = 1, max_size = 1500 WHERE max_size = 0 AND no_max_limit = 0 AND type = 'audio';--> statement-breakpoint
UPDATE download_formats SET no_max_limit = 1, max_size = 2000 WHERE max_size = 0 AND no_max_limit = 0 AND type = 'video';--> statement-breakpoint
UPDATE download_formats SET no_preferred_limit = 1, preferred_size = 100  WHERE preferred_size = 0 AND no_preferred_limit = 0 AND type = 'ebook';--> statement-breakpoint
UPDATE download_formats SET no_preferred_limit = 1, preferred_size = 1500 WHERE preferred_size = 0 AND no_preferred_limit = 0 AND type = 'audio';--> statement-breakpoint
UPDATE download_formats SET no_preferred_limit = 1, preferred_size = 2000 WHERE preferred_size = 0 AND no_preferred_limit = 0 AND type = 'video';