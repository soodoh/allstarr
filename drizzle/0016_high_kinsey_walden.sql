PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_active_adhoc_commands` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`command_type` text NOT NULL,
	`name` text NOT NULL,
	`body` text NOT NULL,
	`progress` text,
	`started_at` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_active_adhoc_commands`("id", "command_type", "name", "body", "progress", "started_at", "created_at") SELECT "id", "command_type", "name", "body", "progress", "started_at", "created_at" FROM `active_adhoc_commands`;--> statement-breakpoint
DROP TABLE `active_adhoc_commands`;--> statement-breakpoint
ALTER TABLE `__new_active_adhoc_commands` RENAME TO `active_adhoc_commands`;--> statement-breakpoint
PRAGMA foreign_keys=ON;