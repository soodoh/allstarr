-- Add part tracking and metadata columns to book_files
ALTER TABLE book_files ADD COLUMN part INTEGER;--> statement-breakpoint
ALTER TABLE book_files ADD COLUMN part_count INTEGER;--> statement-breakpoint
ALTER TABLE book_files ADD COLUMN duration INTEGER;--> statement-breakpoint
ALTER TABLE book_files ADD COLUMN bitrate INTEGER;--> statement-breakpoint
ALTER TABLE book_files ADD COLUMN sample_rate INTEGER;--> statement-breakpoint
ALTER TABLE book_files ADD COLUMN channels INTEGER;--> statement-breakpoint
ALTER TABLE book_files ADD COLUMN codec TEXT;--> statement-breakpoint
ALTER TABLE book_files ADD COLUMN page_count INTEGER;--> statement-breakpoint
ALTER TABLE book_files ADD COLUMN language TEXT;--> statement-breakpoint
-- Migrate existing naming settings to per-type keys
-- Settings values are JSON-encoded (e.g., '"{Author Name}"') — copy raw bytes as-is
INSERT INTO settings (key, value) SELECT 'naming.ebook.bookFile', value FROM settings WHERE key = 'naming.bookFile';--> statement-breakpoint
INSERT INTO settings (key, value) SELECT 'naming.audiobook.bookFile', value FROM settings WHERE key = 'naming.bookFile';--> statement-breakpoint
INSERT INTO settings (key, value) SELECT 'naming.ebook.authorFolder', value FROM settings WHERE key = 'naming.authorFolder';--> statement-breakpoint
INSERT INTO settings (key, value) SELECT 'naming.audiobook.authorFolder', value FROM settings WHERE key = 'naming.authorFolder';--> statement-breakpoint
INSERT INTO settings (key, value) SELECT 'naming.ebook.bookFolder', value FROM settings WHERE key = 'naming.bookFolder';--> statement-breakpoint
INSERT INTO settings (key, value) SELECT 'naming.audiobook.bookFolder', value FROM settings WHERE key = 'naming.bookFolder';--> statement-breakpoint
INSERT INTO settings (key, value) SELECT 'mediaManagement.ebook.extraFileExtensions', value FROM settings WHERE key = 'mediaManagement.extraFileExtensions';--> statement-breakpoint
INSERT INTO settings (key, value) SELECT 'mediaManagement.audiobook.extraFileExtensions', value FROM settings WHERE key = 'mediaManagement.extraFileExtensions';--> statement-breakpoint
-- Delete old keys
DELETE FROM settings WHERE key IN ('naming.bookFile', 'naming.authorFolder', 'naming.bookFolder', 'mediaManagement.extraFileExtensions');--> statement-breakpoint
-- Seed defaults for fresh installs (INSERT OR IGNORE skips if rows already exist from copy above)
INSERT OR IGNORE INTO settings (key, value) VALUES ('naming.ebook.bookFile', '"{Author Name} - {Book Title}"');--> statement-breakpoint
INSERT OR IGNORE INTO settings (key, value) VALUES ('naming.ebook.authorFolder', '"{Author Name}"');--> statement-breakpoint
INSERT OR IGNORE INTO settings (key, value) VALUES ('naming.ebook.bookFolder', '"{Book Title} ({Release Year})"');--> statement-breakpoint
INSERT OR IGNORE INTO settings (key, value) VALUES ('naming.audiobook.bookFile', '"{Author Name} - {Book Title} - Part {PartNumber:00}"');--> statement-breakpoint
INSERT OR IGNORE INTO settings (key, value) VALUES ('naming.audiobook.authorFolder', '"{Author Name}"');--> statement-breakpoint
INSERT OR IGNORE INTO settings (key, value) VALUES ('naming.audiobook.bookFolder', '"{Book Title} ({Release Year})"');--> statement-breakpoint
INSERT OR IGNORE INTO settings (key, value) VALUES ('mediaManagement.ebook.extraFileExtensions', '""');--> statement-breakpoint
INSERT OR IGNORE INTO settings (key, value) VALUES ('mediaManagement.audiobook.extraFileExtensions', '".cue,.nfo"');
