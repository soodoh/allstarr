CREATE TABLE `active_adhoc_commands` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`command_type` text NOT NULL,
	`name` text NOT NULL,
	`body` text NOT NULL,
	`progress` text,
	`started_at` text NOT NULL,
	`created_at` text DEFAULT 'CURRENT_TIMESTAMP' NOT NULL
);
