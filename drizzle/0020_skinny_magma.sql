ALTER TABLE `manga` ADD `wikipedia_page_title` text;--> statement-breakpoint
ALTER TABLE `manga` ADD `wikipedia_fetched_at` integer;--> statement-breakpoint
ALTER TABLE `manga_volumes` ADD `mapping_source` text DEFAULT 'mangaupdates' NOT NULL;
