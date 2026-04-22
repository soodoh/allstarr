PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_import_provenance` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`source_id` integer NOT NULL,
	`source_key` text NOT NULL,
	`target_type` text NOT NULL,
	`target_id` text NOT NULL,
	`last_imported_at` integer,
	FOREIGN KEY (`source_id`) REFERENCES `import_sources`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_import_provenance`("id", "source_id", "source_key", "target_type", "target_id", "last_imported_at") SELECT "id", "source_id", "source_key", "target_type", "target_id", "last_imported_at" FROM `import_provenance`;--> statement-breakpoint
DROP TABLE `import_provenance`;--> statement-breakpoint
ALTER TABLE `__new_import_provenance` RENAME TO `import_provenance`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `import_provenance_source_key_idx` ON `import_provenance` (`source_id`,`source_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `import_provenance_source_target_idx` ON `import_provenance` (`source_id`,`source_key`,`target_type`,`target_id`);