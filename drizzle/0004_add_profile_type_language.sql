ALTER TABLE `download_profiles` ADD `type` text NOT NULL DEFAULT 'ebook';--> statement-breakpoint
ALTER TABLE `download_profiles` ADD `language` text NOT NULL DEFAULT 'en';--> statement-breakpoint
UPDATE `download_profiles` SET `type` = 'audiobook' WHERE `name` = 'Audiobook';
