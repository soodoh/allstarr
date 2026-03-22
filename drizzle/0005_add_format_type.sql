ALTER TABLE `download_formats` ADD `type` text NOT NULL DEFAULT 'ebook';--> statement-breakpoint
UPDATE `download_formats` SET `type` = 'audiobook' WHERE `title` IN ('MP3', 'M4B', 'FLAC');--> statement-breakpoint
UPDATE `download_formats` SET `title` = 'Unknown Text' WHERE `title` = 'Unknown';--> statement-breakpoint
INSERT INTO `download_formats` (`title`, `weight`, `min_size`, `max_size`, `preferred_size`, `color`, `specifications`, `type`) VALUES ('Unknown Audio', 1, 0, 0, 0, 'gray', '[]', 'audiobook');
