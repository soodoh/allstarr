CREATE TABLE `import_provenance` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`source_id` integer NOT NULL,
	`source_key` text NOT NULL,
	`target_type` text NOT NULL,
	`target_id` integer NOT NULL,
	`last_imported_at` integer,
	FOREIGN KEY (`source_id`) REFERENCES `import_sources`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `import_review_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`source_id` integer NOT NULL,
	`source_key` text NOT NULL,
	`resource_type` text NOT NULL,
	`status` text DEFAULT 'unresolved' NOT NULL,
	`payload` text NOT NULL,
	`created_at` integer,
	`updated_at` integer,
	FOREIGN KEY (`source_id`) REFERENCES `import_sources`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `import_snapshots` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`source_id` integer NOT NULL,
	`payload` text NOT NULL,
	`fetched_at` integer,
	FOREIGN KEY (`source_id`) REFERENCES `import_sources`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `import_sources` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`kind` text NOT NULL,
	`label` text NOT NULL,
	`base_url` text NOT NULL,
	`api_key` text NOT NULL,
	`last_sync_status` text DEFAULT 'idle' NOT NULL,
	`last_sync_error` text,
	`last_synced_at` integer,
	`created_at` integer,
	`updated_at` integer
);
