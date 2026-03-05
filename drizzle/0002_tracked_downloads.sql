CREATE TABLE `tracked_downloads` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`download_client_id` integer NOT NULL REFERENCES `download_clients`(`id`) ON DELETE cascade,
	`download_id` text NOT NULL,
	`book_id` integer REFERENCES `books`(`id`) ON DELETE set null,
	`author_id` integer REFERENCES `authors`(`id`) ON DELETE set null,
	`download_profile_id` integer REFERENCES `download_profiles`(`id`) ON DELETE set null,
	`release_title` text NOT NULL,
	`protocol` text NOT NULL,
	`indexer_id` integer,
	`guid` text,
	`state` text NOT NULL DEFAULT 'queued',
	`output_path` text,
	`message` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
