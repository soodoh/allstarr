DROP INDEX `import_provenance_source_key_idx`;--> statement-breakpoint
DROP INDEX `import_provenance_source_target_idx`;--> statement-breakpoint
CREATE UNIQUE INDEX `import_provenance_source_item_idx` ON `import_provenance` (`source_id`,`source_key`);