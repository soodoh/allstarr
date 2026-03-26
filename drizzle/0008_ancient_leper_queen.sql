CREATE TABLE `user_table_settings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`table_id` text NOT NULL,
	`column_order` text NOT NULL,
	`hidden_columns` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_table_settings_user_table_idx` ON `user_table_settings` (`user_id`,`table_id`);