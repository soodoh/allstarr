ALTER TABLE `history` ADD `manga_id` integer REFERENCES `manga`(`id`) ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE `history` ADD `manga_chapter_id` integer REFERENCES `manga_chapters`(`id`) ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE `tracked_downloads` ADD `manga_id` integer REFERENCES `manga`(`id`) ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE `tracked_downloads` ADD `manga_chapter_id` integer REFERENCES `manga_chapters`(`id`) ON DELETE SET NULL;
