CREATE TABLE `job_runs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`source_type` text NOT NULL,
	`job_type` text NOT NULL,
	`display_name` text NOT NULL,
	`dedupe_key` text,
	`dedupe_value` text,
	`status` text DEFAULT 'queued' NOT NULL,
	`progress` text,
	`attempt` integer DEFAULT 1 NOT NULL,
	`result` text,
	`error` text,
	`metadata` text,
	`started_at` integer,
	`last_heartbeat_at` integer,
	`finished_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
