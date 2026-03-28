ALTER TABLE `authors` ADD `cached_image_path` text;--> statement-breakpoint
ALTER TABLE `books` ADD `cached_image_path` text;--> statement-breakpoint
ALTER TABLE `editions` ADD `cached_image_path` text;--> statement-breakpoint
ALTER TABLE `seasons` ADD `cached_poster_path` text;--> statement-breakpoint
ALTER TABLE `shows` ADD `cached_poster_path` text;--> statement-breakpoint
ALTER TABLE `shows` ADD `cached_fanart_path` text;--> statement-breakpoint
ALTER TABLE `movies` ADD `cached_poster_path` text;--> statement-breakpoint
ALTER TABLE `movies` ADD `cached_fanart_path` text;--> statement-breakpoint
ALTER TABLE `manga` ADD `cached_poster_path` text;--> statement-breakpoint
ALTER TABLE `manga` ADD `cached_fanart_path` text;