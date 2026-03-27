ALTER TABLE `books` ADD `last_searched_at` integer;--> statement-breakpoint
ALTER TABLE `episodes` ADD `last_searched_at` integer;--> statement-breakpoint
ALTER TABLE `movies` ADD `last_searched_at` integer;--> statement-breakpoint
ALTER TABLE `indexers` ADD `request_interval` integer DEFAULT 5000 NOT NULL;--> statement-breakpoint
ALTER TABLE `indexers` ADD `daily_query_limit` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `indexers` ADD `daily_grab_limit` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `indexers` ADD `backoff_until` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `indexers` ADD `escalation_level` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `synced_indexers` ADD `request_interval` integer DEFAULT 5000 NOT NULL;--> statement-breakpoint
ALTER TABLE `synced_indexers` ADD `daily_query_limit` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `synced_indexers` ADD `daily_grab_limit` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `synced_indexers` ADD `backoff_until` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `synced_indexers` ADD `escalation_level` integer DEFAULT 0 NOT NULL;