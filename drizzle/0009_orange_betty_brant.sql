ALTER TABLE `user_table_settings` RENAME TO `user_settings`;
--> statement-breakpoint
DROP INDEX IF EXISTS `user_table_settings_user_table_idx`;
--> statement-breakpoint
CREATE UNIQUE INDEX `user_settings_user_table_idx` ON `user_settings` (`user_id`, `table_id`);
--> statement-breakpoint
ALTER TABLE `user_settings` ADD `view_mode` text;
