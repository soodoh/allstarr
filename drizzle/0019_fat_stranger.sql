ALTER TABLE `manga` ADD `wikipedia_page_title` text;--> statement-breakpoint
ALTER TABLE `manga` DROP COLUMN `cached_poster_path`;--> statement-breakpoint
ALTER TABLE `manga` DROP COLUMN `cached_fanart_path`;--> statement-breakpoint
ALTER TABLE `manga_volumes` ADD `mapping_source` text DEFAULT 'mangaupdates' NOT NULL;--> statement-breakpoint
ALTER TABLE `authors` DROP COLUMN `cached_image_path`;--> statement-breakpoint
ALTER TABLE `books` DROP COLUMN `cached_image_path`;--> statement-breakpoint
ALTER TABLE `editions` DROP COLUMN `cached_image_path`;--> statement-breakpoint
ALTER TABLE `seasons` DROP COLUMN `cached_poster_path`;--> statement-breakpoint
ALTER TABLE `shows` DROP COLUMN `cached_poster_path`;--> statement-breakpoint
ALTER TABLE `shows` DROP COLUMN `cached_fanart_path`;--> statement-breakpoint
ALTER TABLE `movies` DROP COLUMN `cached_poster_path`;--> statement-breakpoint
ALTER TABLE `movies` DROP COLUMN `cached_fanart_path`;