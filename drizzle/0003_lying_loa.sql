ALTER TABLE `authors` ADD `monitor_new_books` text DEFAULT 'all' NOT NULL;--> statement-breakpoint
ALTER TABLE `shows` ADD `monitor_new_seasons` text DEFAULT 'all' NOT NULL;