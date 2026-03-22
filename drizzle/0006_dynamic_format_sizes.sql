-- Convert ebook format sizes from flat MB to MB/100 pages
UPDATE `download_formats` SET `min_size` = 0, `preferred_size` = 1.5, `max_size` = 15 WHERE `title` = 'EPUB';--> statement-breakpoint
UPDATE `download_formats` SET `min_size` = 0, `preferred_size` = 2, `max_size` = 15 WHERE `title` = 'MOBI';--> statement-breakpoint
UPDATE `download_formats` SET `min_size` = 0, `preferred_size` = 2, `max_size` = 15 WHERE `title` = 'AZW3';--> statement-breakpoint
UPDATE `download_formats` SET `min_size` = 0, `preferred_size` = 5, `max_size` = 50 WHERE `title` = 'PDF';--> statement-breakpoint
-- Convert audiobook format sizes from flat MB to kbps
UPDATE `download_formats` SET `min_size` = 0, `preferred_size` = 195, `max_size` = 350 WHERE `title` = 'MP3';--> statement-breakpoint
UPDATE `download_formats` SET `min_size` = 0, `preferred_size` = 195, `max_size` = 350 WHERE `title` = 'M4B';--> statement-breakpoint
UPDATE `download_formats` SET `min_size` = 0, `preferred_size` = 895, `max_size` = 0 WHERE `title` = 'FLAC';--> statement-breakpoint
-- Add default dimension settings for fallback calculations
INSERT OR IGNORE INTO `settings` (`key`, `value`) VALUES ('format.defaultPageCount', '300');--> statement-breakpoint
INSERT OR IGNORE INTO `settings` (`key`, `value`) VALUES ('format.defaultAudioDuration', '600');
