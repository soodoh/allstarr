-- ============================================================
-- 0009_multi_media_foundation
-- Extends Allstarr to support TV shows and movies alongside books
-- ============================================================

-- ------------------------------------------------------------
-- 1. Rename audiobook -> audio in download_formats.type and download_profiles.type
-- ------------------------------------------------------------
UPDATE download_formats SET type = 'audio' WHERE type = 'audiobook';--> statement-breakpoint
UPDATE download_profiles SET type = 'audio' WHERE type = 'audiobook';--> statement-breakpoint

-- ------------------------------------------------------------
-- 2. Add columns to download_formats: source, resolution, enabled
-- ------------------------------------------------------------
ALTER TABLE download_formats ADD COLUMN source TEXT;--> statement-breakpoint
ALTER TABLE download_formats ADD COLUMN resolution INTEGER NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE download_formats ADD COLUMN enabled INTEGER NOT NULL DEFAULT 1;--> statement-breakpoint

-- ------------------------------------------------------------
-- 3. Convert maxSize=0 and preferredSize=0 to NULL (no limit)
-- ------------------------------------------------------------
UPDATE download_formats SET max_size = NULL WHERE max_size = 0;--> statement-breakpoint
UPDATE download_formats SET preferred_size = NULL WHERE preferred_size = 0;--> statement-breakpoint

-- ------------------------------------------------------------
-- 4. Add columns to download_profiles: content_type, enabled
-- ------------------------------------------------------------
ALTER TABLE download_profiles ADD COLUMN content_type TEXT NOT NULL DEFAULT 'book';--> statement-breakpoint
ALTER TABLE download_profiles ADD COLUMN enabled INTEGER NOT NULL DEFAULT 1;--> statement-breakpoint

-- ------------------------------------------------------------
-- 5. Rename settings keys: naming.audiobook.* -> naming.audio.*
--    and mediaManagement.audiobook.* -> mediaManagement.audio.*
-- ------------------------------------------------------------
UPDATE settings SET key = 'naming.audio.bookFile'    WHERE key = 'naming.audiobook.bookFile';--> statement-breakpoint
UPDATE settings SET key = 'naming.audio.authorFolder' WHERE key = 'naming.audiobook.authorFolder';--> statement-breakpoint
UPDATE settings SET key = 'naming.audio.bookFolder'  WHERE key = 'naming.audiobook.bookFolder';--> statement-breakpoint
UPDATE settings SET key = 'mediaManagement.audio.extraFileExtensions'   WHERE key = 'mediaManagement.audiobook.extraFileExtensions';--> statement-breakpoint
UPDATE settings SET key = 'mediaManagement.audio.renameBooks'           WHERE key = 'mediaManagement.audiobook.renameBooks';--> statement-breakpoint
UPDATE settings SET key = 'mediaManagement.audio.replaceIllegalCharacters' WHERE key = 'mediaManagement.audiobook.replaceIllegalCharacters';--> statement-breakpoint
UPDATE settings SET key = 'mediaManagement.audio.createEmptyAuthorFolders' WHERE key = 'mediaManagement.audiobook.createEmptyAuthorFolders';--> statement-breakpoint
UPDATE settings SET key = 'mediaManagement.audio.deleteEmptyAuthorFolders' WHERE key = 'mediaManagement.audiobook.deleteEmptyAuthorFolders';--> statement-breakpoint
UPDATE settings SET key = 'mediaManagement.audio.useHardLinks'          WHERE key = 'mediaManagement.audiobook.useHardLinks';--> statement-breakpoint
UPDATE settings SET key = 'mediaManagement.audio.skipFreeSpaceCheck'    WHERE key = 'mediaManagement.audiobook.skipFreeSpaceCheck';--> statement-breakpoint
UPDATE settings SET key = 'mediaManagement.audio.minimumFreeSpace'      WHERE key = 'mediaManagement.audiobook.minimumFreeSpace';--> statement-breakpoint
UPDATE settings SET key = 'mediaManagement.audio.importExtraFiles'      WHERE key = 'mediaManagement.audiobook.importExtraFiles';--> statement-breakpoint
UPDATE settings SET key = 'mediaManagement.audio.propersAndRepacks'     WHERE key = 'mediaManagement.audiobook.propersAndRepacks';--> statement-breakpoint
UPDATE settings SET key = 'mediaManagement.audio.ignoreDeletedBooks'    WHERE key = 'mediaManagement.audiobook.ignoreDeletedBooks';--> statement-breakpoint
UPDATE settings SET key = 'mediaManagement.audio.changeFileDate'        WHERE key = 'mediaManagement.audiobook.changeFileDate';--> statement-breakpoint
UPDATE settings SET key = 'mediaManagement.audio.recyclingBin'          WHERE key = 'mediaManagement.audiobook.recyclingBin';--> statement-breakpoint
UPDATE settings SET key = 'mediaManagement.audio.recyclingBinCleanup'   WHERE key = 'mediaManagement.audiobook.recyclingBinCleanup';--> statement-breakpoint
UPDATE settings SET key = 'mediaManagement.audio.setPermissions'        WHERE key = 'mediaManagement.audiobook.setPermissions';--> statement-breakpoint
UPDATE settings SET key = 'mediaManagement.audio.fileChmod'             WHERE key = 'mediaManagement.audiobook.fileChmod';--> statement-breakpoint
UPDATE settings SET key = 'mediaManagement.audio.folderChmod'           WHERE key = 'mediaManagement.audiobook.folderChmod';--> statement-breakpoint
UPDATE settings SET key = 'mediaManagement.audio.chownGroup'            WHERE key = 'mediaManagement.audiobook.chownGroup';--> statement-breakpoint

-- ------------------------------------------------------------
-- 6. Migrate naming keys to book namespace
--    naming.ebook.* -> naming.book.ebook.*
--    naming.audio.* -> naming.book.audio.*
-- ------------------------------------------------------------
INSERT OR IGNORE INTO settings (key, value) SELECT 'naming.book.ebook.bookFile',    value FROM settings WHERE key = 'naming.ebook.bookFile';--> statement-breakpoint
INSERT OR IGNORE INTO settings (key, value) SELECT 'naming.book.ebook.authorFolder', value FROM settings WHERE key = 'naming.ebook.authorFolder';--> statement-breakpoint
INSERT OR IGNORE INTO settings (key, value) SELECT 'naming.book.ebook.bookFolder',  value FROM settings WHERE key = 'naming.ebook.bookFolder';--> statement-breakpoint
INSERT OR IGNORE INTO settings (key, value) SELECT 'naming.book.audio.bookFile',    value FROM settings WHERE key = 'naming.audio.bookFile';--> statement-breakpoint
INSERT OR IGNORE INTO settings (key, value) SELECT 'naming.book.audio.authorFolder', value FROM settings WHERE key = 'naming.audio.authorFolder';--> statement-breakpoint
INSERT OR IGNORE INTO settings (key, value) SELECT 'naming.book.audio.bookFolder',  value FROM settings WHERE key = 'naming.audio.bookFolder';--> statement-breakpoint
DELETE FROM settings WHERE key IN (
  'naming.ebook.bookFile', 'naming.ebook.authorFolder', 'naming.ebook.bookFolder',
  'naming.audio.bookFile', 'naming.audio.authorFolder', 'naming.audio.bookFolder'
);--> statement-breakpoint

-- Seed defaults for fresh installs
INSERT OR IGNORE INTO settings (key, value) VALUES ('naming.book.ebook.bookFile',    '"{Author Name} - {Book Title}"');--> statement-breakpoint
INSERT OR IGNORE INTO settings (key, value) VALUES ('naming.book.ebook.authorFolder', '"{Author Name}"');--> statement-breakpoint
INSERT OR IGNORE INTO settings (key, value) VALUES ('naming.book.ebook.bookFolder',  '"{Book Title} ({Release Year})"');--> statement-breakpoint
INSERT OR IGNORE INTO settings (key, value) VALUES ('naming.book.audio.bookFile',    '"{Author Name} - {Book Title} - Part {PartNumber:00}"');--> statement-breakpoint
INSERT OR IGNORE INTO settings (key, value) VALUES ('naming.book.audio.authorFolder', '"{Author Name}"');--> statement-breakpoint
INSERT OR IGNORE INTO settings (key, value) VALUES ('naming.book.audio.bookFolder',  '"{Book Title} ({Release Year})"');--> statement-breakpoint

-- ------------------------------------------------------------
-- 7. Migrate media management keys to book namespace
--    mediaManagement.ebook.* -> mediaManagement.book.*
--    mediaManagement.audio.* merged into mediaManagement.book.*
-- ------------------------------------------------------------
INSERT OR IGNORE INTO settings (key, value) SELECT 'mediaManagement.book.extraFileExtensions',      value FROM settings WHERE key = 'mediaManagement.ebook.extraFileExtensions';--> statement-breakpoint
INSERT OR IGNORE INTO settings (key, value) SELECT 'mediaManagement.book.renameBooks',              value FROM settings WHERE key = 'mediaManagement.ebook.renameBooks';--> statement-breakpoint
INSERT OR IGNORE INTO settings (key, value) SELECT 'mediaManagement.book.replaceIllegalCharacters', value FROM settings WHERE key = 'mediaManagement.ebook.replaceIllegalCharacters';--> statement-breakpoint
INSERT OR IGNORE INTO settings (key, value) SELECT 'mediaManagement.book.createEmptyAuthorFolders', value FROM settings WHERE key = 'mediaManagement.ebook.createEmptyAuthorFolders';--> statement-breakpoint
INSERT OR IGNORE INTO settings (key, value) SELECT 'mediaManagement.book.deleteEmptyAuthorFolders', value FROM settings WHERE key = 'mediaManagement.ebook.deleteEmptyAuthorFolders';--> statement-breakpoint
INSERT OR IGNORE INTO settings (key, value) SELECT 'mediaManagement.book.useHardLinks',             value FROM settings WHERE key = 'mediaManagement.ebook.useHardLinks';--> statement-breakpoint
INSERT OR IGNORE INTO settings (key, value) SELECT 'mediaManagement.book.skipFreeSpaceCheck',       value FROM settings WHERE key = 'mediaManagement.ebook.skipFreeSpaceCheck';--> statement-breakpoint
INSERT OR IGNORE INTO settings (key, value) SELECT 'mediaManagement.book.minimumFreeSpace',         value FROM settings WHERE key = 'mediaManagement.ebook.minimumFreeSpace';--> statement-breakpoint
INSERT OR IGNORE INTO settings (key, value) SELECT 'mediaManagement.book.importExtraFiles',         value FROM settings WHERE key = 'mediaManagement.ebook.importExtraFiles';--> statement-breakpoint
INSERT OR IGNORE INTO settings (key, value) SELECT 'mediaManagement.book.propersAndRepacks',        value FROM settings WHERE key = 'mediaManagement.ebook.propersAndRepacks';--> statement-breakpoint
INSERT OR IGNORE INTO settings (key, value) SELECT 'mediaManagement.book.ignoreDeletedBooks',       value FROM settings WHERE key = 'mediaManagement.ebook.ignoreDeletedBooks';--> statement-breakpoint
INSERT OR IGNORE INTO settings (key, value) SELECT 'mediaManagement.book.changeFileDate',           value FROM settings WHERE key = 'mediaManagement.ebook.changeFileDate';--> statement-breakpoint
INSERT OR IGNORE INTO settings (key, value) SELECT 'mediaManagement.book.recyclingBin',             value FROM settings WHERE key = 'mediaManagement.ebook.recyclingBin';--> statement-breakpoint
INSERT OR IGNORE INTO settings (key, value) SELECT 'mediaManagement.book.recyclingBinCleanup',      value FROM settings WHERE key = 'mediaManagement.ebook.recyclingBinCleanup';--> statement-breakpoint
INSERT OR IGNORE INTO settings (key, value) SELECT 'mediaManagement.book.setPermissions',           value FROM settings WHERE key = 'mediaManagement.ebook.setPermissions';--> statement-breakpoint
INSERT OR IGNORE INTO settings (key, value) SELECT 'mediaManagement.book.fileChmod',                value FROM settings WHERE key = 'mediaManagement.ebook.fileChmod';--> statement-breakpoint
INSERT OR IGNORE INTO settings (key, value) SELECT 'mediaManagement.book.folderChmod',              value FROM settings WHERE key = 'mediaManagement.ebook.folderChmod';--> statement-breakpoint
INSERT OR IGNORE INTO settings (key, value) SELECT 'mediaManagement.book.chownGroup',               value FROM settings WHERE key = 'mediaManagement.ebook.chownGroup';--> statement-breakpoint
-- Merge audio keys into book namespace (INSERT OR IGNORE skips if ebook key already provided the value)
INSERT OR IGNORE INTO settings (key, value) SELECT 'mediaManagement.book.extraFileExtensions',      value FROM settings WHERE key = 'mediaManagement.audio.extraFileExtensions';--> statement-breakpoint
-- Delete old ebook and audio keys
DELETE FROM settings WHERE key IN (
  'mediaManagement.ebook.extraFileExtensions',
  'mediaManagement.ebook.renameBooks',
  'mediaManagement.ebook.replaceIllegalCharacters',
  'mediaManagement.ebook.createEmptyAuthorFolders',
  'mediaManagement.ebook.deleteEmptyAuthorFolders',
  'mediaManagement.ebook.useHardLinks',
  'mediaManagement.ebook.skipFreeSpaceCheck',
  'mediaManagement.ebook.minimumFreeSpace',
  'mediaManagement.ebook.importExtraFiles',
  'mediaManagement.ebook.propersAndRepacks',
  'mediaManagement.ebook.ignoreDeletedBooks',
  'mediaManagement.ebook.changeFileDate',
  'mediaManagement.ebook.recyclingBin',
  'mediaManagement.ebook.recyclingBinCleanup',
  'mediaManagement.ebook.setPermissions',
  'mediaManagement.ebook.fileChmod',
  'mediaManagement.ebook.folderChmod',
  'mediaManagement.ebook.chownGroup',
  'mediaManagement.audio.extraFileExtensions',
  'mediaManagement.audio.renameBooks',
  'mediaManagement.audio.replaceIllegalCharacters',
  'mediaManagement.audio.createEmptyAuthorFolders',
  'mediaManagement.audio.deleteEmptyAuthorFolders',
  'mediaManagement.audio.useHardLinks',
  'mediaManagement.audio.skipFreeSpaceCheck',
  'mediaManagement.audio.minimumFreeSpace',
  'mediaManagement.audio.importExtraFiles',
  'mediaManagement.audio.propersAndRepacks',
  'mediaManagement.audio.ignoreDeletedBooks',
  'mediaManagement.audio.changeFileDate',
  'mediaManagement.audio.recyclingBin',
  'mediaManagement.audio.recyclingBinCleanup',
  'mediaManagement.audio.setPermissions',
  'mediaManagement.audio.fileChmod',
  'mediaManagement.audio.folderChmod',
  'mediaManagement.audio.chownGroup'
);--> statement-breakpoint

-- Seed defaults for fresh installs
INSERT OR IGNORE INTO settings (key, value) VALUES ('mediaManagement.book.extraFileExtensions',      '""');--> statement-breakpoint
INSERT OR IGNORE INTO settings (key, value) VALUES ('mediaManagement.book.renameBooks',              'false');--> statement-breakpoint
INSERT OR IGNORE INTO settings (key, value) VALUES ('mediaManagement.book.replaceIllegalCharacters', 'true');--> statement-breakpoint
INSERT OR IGNORE INTO settings (key, value) VALUES ('mediaManagement.book.createEmptyAuthorFolders', 'false');--> statement-breakpoint
INSERT OR IGNORE INTO settings (key, value) VALUES ('mediaManagement.book.deleteEmptyAuthorFolders', 'false');--> statement-breakpoint
INSERT OR IGNORE INTO settings (key, value) VALUES ('mediaManagement.book.useHardLinks',             'true');--> statement-breakpoint
INSERT OR IGNORE INTO settings (key, value) VALUES ('mediaManagement.book.skipFreeSpaceCheck',       'false');--> statement-breakpoint
INSERT OR IGNORE INTO settings (key, value) VALUES ('mediaManagement.book.minimumFreeSpace',         '100');--> statement-breakpoint
INSERT OR IGNORE INTO settings (key, value) VALUES ('mediaManagement.book.importExtraFiles',         'false');--> statement-breakpoint
INSERT OR IGNORE INTO settings (key, value) VALUES ('mediaManagement.book.propersAndRepacks',        '"preferAndUpgrade"');--> statement-breakpoint
INSERT OR IGNORE INTO settings (key, value) VALUES ('mediaManagement.book.ignoreDeletedBooks',       'false');--> statement-breakpoint
INSERT OR IGNORE INTO settings (key, value) VALUES ('mediaManagement.book.changeFileDate',           '"none"');--> statement-breakpoint
INSERT OR IGNORE INTO settings (key, value) VALUES ('mediaManagement.book.recyclingBin',             '""');--> statement-breakpoint
INSERT OR IGNORE INTO settings (key, value) VALUES ('mediaManagement.book.recyclingBinCleanup',      '7');--> statement-breakpoint
INSERT OR IGNORE INTO settings (key, value) VALUES ('mediaManagement.book.setPermissions',           'false');--> statement-breakpoint
INSERT OR IGNORE INTO settings (key, value) VALUES ('mediaManagement.book.fileChmod',                '"0644"');--> statement-breakpoint
INSERT OR IGNORE INTO settings (key, value) VALUES ('mediaManagement.book.folderChmod',              '"0755"');--> statement-breakpoint
INSERT OR IGNORE INTO settings (key, value) VALUES ('mediaManagement.book.chownGroup',               '""');--> statement-breakpoint

-- ------------------------------------------------------------
-- 8. Migrate metadata key: metadata.profile -> metadata.hardcover.profile
-- ------------------------------------------------------------
INSERT OR IGNORE INTO settings (key, value) SELECT 'metadata.hardcover.profile', value FROM settings WHERE key = 'metadata.profile';--> statement-breakpoint
DELETE FROM settings WHERE key = 'metadata.profile';--> statement-breakpoint
INSERT OR IGNORE INTO settings (key, value) VALUES ('metadata.hardcover.profile', '{"skipMissingReleaseDate":false,"skipMissingIsbnAsin":false,"skipCompilations":true,"minimumPopularity":10,"minimumPages":0}');--> statement-breakpoint

-- ------------------------------------------------------------
-- 9. Seed TMDB defaults
-- ------------------------------------------------------------
INSERT OR IGNORE INTO settings (key, value) VALUES ('metadata.tmdb.language',     '"en"');--> statement-breakpoint
INSERT OR IGNORE INTO settings (key, value) VALUES ('metadata.tmdb.includeAdult', 'false');--> statement-breakpoint
INSERT OR IGNORE INTO settings (key, value) VALUES ('metadata.tmdb.region',       '""');--> statement-breakpoint

-- ------------------------------------------------------------
-- 10. Seed TV and Movie naming defaults
--     Values are double-JSON-encoded (outer quotes because Drizzle JSON mode does JSON.parse on read)
-- ------------------------------------------------------------
INSERT OR IGNORE INTO settings (key, value) VALUES ('naming.tv.seriesFolder',  '"{Series Title} ({Series Year})"');--> statement-breakpoint
INSERT OR IGNORE INTO settings (key, value) VALUES ('naming.tv.seasonFolder',  '"Season {season:00}"');--> statement-breakpoint
INSERT OR IGNORE INTO settings (key, value) VALUES ('naming.tv.episodeFile',   '"{Series Title} - S{season:00}E{episode:00} - {Episode Title}"');--> statement-breakpoint
INSERT OR IGNORE INTO settings (key, value) VALUES ('naming.movie.movieFolder', '"{Movie Title} ({Release Year})"');--> statement-breakpoint
INSERT OR IGNORE INTO settings (key, value) VALUES ('naming.movie.movieFile',   '"{Movie Title} ({Release Year}) {Quality Full}"');--> statement-breakpoint

-- ------------------------------------------------------------
-- 11 & 12. Seed 20 TRaSH video formats (enabled) + 20 conservative (disabled)
-- ------------------------------------------------------------
-- TRaSH enabled video formats
INSERT INTO download_formats (title, weight, min_size, max_size, preferred_size, color, specifications, type, source, resolution, enabled) VALUES
  ('Unknown Video',  0,  NULL, NULL, NULL, 'gray',   '[]', 'video', 'Unknown',    0,    1),
  ('SDTV',           1,  5,    NULL, NULL, 'gray',   '[{"type":"releaseTitle","value":"\\bsdtv\\b","negate":false,"required":true}]', 'video', 'Television', 480,  1),
  ('WEBRip-480p',    2,  5,    NULL, NULL, 'gray',   '[{"type":"releaseTitle","value":"\\bwebrip\\b.*\\b480p\\b","negate":false,"required":true}]', 'video', 'WebRip',     480,  1),
  ('WEBDL-480p',     3,  5,    NULL, NULL, 'gray',   '[{"type":"releaseTitle","value":"\\bweb[-. ]?dl\\b.*\\b480p\\b","negate":false,"required":true}]', 'video', 'Web',        480,  1),
  ('DVD',            4,  5,    NULL, NULL, 'yellow', '[{"type":"releaseTitle","value":"\\bdvd(?:rip)?\\b","negate":false,"required":true}]', 'video', 'DVD',        480,  1),
  ('Bluray-480p',    5,  5,    NULL, NULL, 'gray',   '[{"type":"releaseTitle","value":"\\bblu[-. ]?ray\\b.*\\b480p\\b","negate":false,"required":true}]', 'video', 'Bluray',     480,  1),
  ('HDTV-720p',      10, 10,   NULL, NULL, 'green',  '[{"type":"releaseTitle","value":"\\bhdtv\\b.*\\b720p\\b","negate":false,"required":true}]', 'video', 'Television', 720,  1),
  ('WEBRip-720p',    11, 10,   NULL, NULL, 'green',  '[{"type":"releaseTitle","value":"\\bwebrip\\b.*\\b720p\\b","negate":false,"required":true}]', 'video', 'WebRip',     720,  1),
  ('WEBDL-720p',     12, 10,   NULL, NULL, 'green',  '[{"type":"releaseTitle","value":"\\bweb[-. ]?dl\\b.*\\b720p\\b","negate":false,"required":true}]', 'video', 'Web',        720,  1),
  ('Bluray-720p',    13, 17.1, NULL, NULL, 'green',  '[{"type":"releaseTitle","value":"\\bblu[-. ]?ray\\b.*\\b720p\\b","negate":false,"required":true}]', 'video', 'Bluray',     720,  1),
  ('HDTV-1080p',     20, 15,   NULL, NULL, 'green',  '[{"type":"releaseTitle","value":"\\bhdtv\\b.*\\b1080p\\b","negate":false,"required":true}]', 'video', 'Television', 1080, 1),
  ('WEBRip-1080p',   21, 15,   NULL, NULL, 'green',  '[{"type":"releaseTitle","value":"\\bwebrip\\b.*\\b1080p\\b","negate":false,"required":true}]', 'video', 'WebRip',     1080, 1),
  ('WEBDL-1080p',    22, 15,   NULL, NULL, 'green',  '[{"type":"releaseTitle","value":"\\bweb[-. ]?dl\\b.*\\b1080p\\b","negate":false,"required":true}]', 'video', 'Web',        1080, 1),
  ('Bluray-1080p',   23, 50.4, NULL, NULL, 'blue',   '[{"type":"releaseTitle","value":"\\bblu[-. ]?ray\\b.*\\b1080p\\b","negate":false,"required":true}]', 'video', 'Bluray',     1080, 1),
  ('Remux-1080p',    24, 69.1, NULL, NULL, 'cyan',   '[{"type":"releaseTitle","value":"\\bremux\\b.*\\b1080p\\b","negate":false,"required":true}]', 'video', 'BlurayRaw',  1080, 1),
  ('HDTV-2160p',     30, 25,   NULL, NULL, 'purple', '[{"type":"releaseTitle","value":"\\bhdtv\\b.*\\b2160p\\b","negate":false,"required":true}]', 'video', 'Television', 2160, 1),
  ('WEBRip-2160p',   31, 25,   NULL, NULL, 'purple', '[{"type":"releaseTitle","value":"\\bwebrip\\b.*\\b2160p\\b","negate":false,"required":true}]', 'video', 'WebRip',     2160, 1),
  ('WEBDL-2160p',    32, 25,   NULL, NULL, 'purple', '[{"type":"releaseTitle","value":"\\bweb[-. ]?dl\\b.*\\b2160p\\b","negate":false,"required":true}]', 'video', 'Web',        2160, 1),
  ('Bluray-2160p',   33, 94.6, NULL, NULL, 'purple', '[{"type":"releaseTitle","value":"\\bblu[-. ]?ray\\b.*\\b2160p\\b","negate":false,"required":true}]', 'video', 'Bluray',     2160, 1),
  ('Remux-2160p',    34, 187.4,NULL, NULL, 'purple', '[{"type":"releaseTitle","value":"\\bremux\\b.*\\b2160p\\b","negate":false,"required":true}]', 'video', 'BlurayRaw',  2160, 1);--> statement-breakpoint

-- Conservative disabled video formats
INSERT INTO download_formats (title, weight, min_size, max_size, preferred_size, color, specifications, type, source, resolution, enabled) VALUES
  ('Unknown Video (Conservative)',  0,  NULL, NULL, NULL, 'gray',   '[]', 'video', 'Unknown',    0,    0),
  ('SDTV (Conservative)',           1,  NULL, NULL, NULL, 'gray',   '[{"type":"releaseTitle","value":"\\bsdtv\\b","negate":false,"required":true}]', 'video', 'Television', 480,  0),
  ('WEBRip-480p (Conservative)',    2,  NULL, NULL, NULL, 'gray',   '[{"type":"releaseTitle","value":"\\bwebrip\\b.*\\b480p\\b","negate":false,"required":true}]', 'video', 'WebRip',     480,  0),
  ('WEBDL-480p (Conservative)',     3,  NULL, NULL, NULL, 'gray',   '[{"type":"releaseTitle","value":"\\bweb[-. ]?dl\\b.*\\b480p\\b","negate":false,"required":true}]', 'video', 'Web',        480,  0),
  ('DVD (Conservative)',            4,  NULL, NULL, NULL, 'yellow', '[{"type":"releaseTitle","value":"\\bdvd(?:rip)?\\b","negate":false,"required":true}]', 'video', 'DVD',        480,  0),
  ('Bluray-480p (Conservative)',    5,  NULL, NULL, NULL, 'gray',   '[{"type":"releaseTitle","value":"\\bblu[-. ]?ray\\b.*\\b480p\\b","negate":false,"required":true}]', 'video', 'Bluray',     480,  0),
  ('HDTV-720p (Conservative)',      10, NULL, NULL, NULL, 'green',  '[{"type":"releaseTitle","value":"\\bhdtv\\b.*\\b720p\\b","negate":false,"required":true}]', 'video', 'Television', 720,  0),
  ('WEBRip-720p (Conservative)',    11, NULL, NULL, NULL, 'green',  '[{"type":"releaseTitle","value":"\\bwebrip\\b.*\\b720p\\b","negate":false,"required":true}]', 'video', 'WebRip',     720,  0),
  ('WEBDL-720p (Conservative)',     12, NULL, NULL, NULL, 'green',  '[{"type":"releaseTitle","value":"\\bweb[-. ]?dl\\b.*\\b720p\\b","negate":false,"required":true}]', 'video', 'Web',        720,  0),
  ('Bluray-720p (Conservative)',    13, NULL, NULL, NULL, 'green',  '[{"type":"releaseTitle","value":"\\bblu[-. ]?ray\\b.*\\b720p\\b","negate":false,"required":true}]', 'video', 'Bluray',     720,  0),
  ('HDTV-1080p (Conservative)',     20, NULL, NULL, NULL, 'green',  '[{"type":"releaseTitle","value":"\\bhdtv\\b.*\\b1080p\\b","negate":false,"required":true}]', 'video', 'Television', 1080, 0),
  ('WEBRip-1080p (Conservative)',   21, NULL, NULL, NULL, 'green',  '[{"type":"releaseTitle","value":"\\bwebrip\\b.*\\b1080p\\b","negate":false,"required":true}]', 'video', 'WebRip',     1080, 0),
  ('WEBDL-1080p (Conservative)',    22, NULL, NULL, NULL, 'green',  '[{"type":"releaseTitle","value":"\\bweb[-. ]?dl\\b.*\\b1080p\\b","negate":false,"required":true}]', 'video', 'Web',        1080, 0),
  ('Bluray-1080p (Conservative)',   23, NULL, NULL, NULL, 'blue',   '[{"type":"releaseTitle","value":"\\bblu[-. ]?ray\\b.*\\b1080p\\b","negate":false,"required":true}]', 'video', 'Bluray',     1080, 0),
  ('Remux-1080p (Conservative)',    24, NULL, NULL, NULL, 'cyan',   '[{"type":"releaseTitle","value":"\\bremux\\b.*\\b1080p\\b","negate":false,"required":true}]', 'video', 'BlurayRaw',  1080, 0),
  ('HDTV-2160p (Conservative)',     30, NULL, NULL, NULL, 'purple', '[{"type":"releaseTitle","value":"\\bhdtv\\b.*\\b2160p\\b","negate":false,"required":true}]', 'video', 'Television', 2160, 0),
  ('WEBRip-2160p (Conservative)',   31, NULL, NULL, NULL, 'purple', '[{"type":"releaseTitle","value":"\\bwebrip\\b.*\\b2160p\\b","negate":false,"required":true}]', 'video', 'WebRip',     2160, 0),
  ('WEBDL-2160p (Conservative)',    32, NULL, NULL, NULL, 'purple', '[{"type":"releaseTitle","value":"\\bweb[-. ]?dl\\b.*\\b2160p\\b","negate":false,"required":true}]', 'video', 'Web',        2160, 0),
  ('Bluray-2160p (Conservative)',   33, NULL, NULL, NULL, 'purple', '[{"type":"releaseTitle","value":"\\bblu[-. ]?ray\\b.*\\b2160p\\b","negate":false,"required":true}]', 'video', 'Bluray',     2160, 0),
  ('Remux-2160p (Conservative)',    34, NULL, NULL, NULL, 'purple', '[{"type":"releaseTitle","value":"\\bremux\\b.*\\b2160p\\b","negate":false,"required":true}]', 'video', 'BlurayRaw',  2160, 0);--> statement-breakpoint

-- ------------------------------------------------------------
-- 13. Seed 9 conservative book formats (disabled)
-- ------------------------------------------------------------
INSERT INTO download_formats (title, weight, min_size, max_size, preferred_size, color, specifications, type, enabled) VALUES
  ('Unknown Text (Conservative)',  0, NULL, 350,  NULL, 'gray',   '[]', 'ebook', 0),
  ('PDF (Conservative)',           1, NULL, 350,  NULL, 'yellow', '[{"type":"releaseTitle","value":"\\bpdf\\b","negate":false,"required":true}]', 'ebook', 0),
  ('MOBI (Conservative)',          2, NULL, 350,  NULL, 'amber',  '[{"type":"releaseTitle","value":"\\bmobi\\b","negate":false,"required":true}]', 'ebook', 0),
  ('EPUB (Conservative)',          3, NULL, 350,  NULL, 'green',  '[{"type":"releaseTitle","value":"\\bepub\\b","negate":false,"required":true}]', 'ebook', 0),
  ('AZW3 (Conservative)',          4, NULL, 350,  NULL, 'blue',   '[{"type":"releaseTitle","value":"\\bazw3\\b","negate":false,"required":true}]', 'ebook', 0),
  ('Unknown Audio (Conservative)', 5, NULL, 350,  NULL, 'gray',   '[]', 'audio', 0),
  ('MP3 (Conservative)',           6, NULL, 350,  NULL, 'orange', '[{"type":"releaseTitle","value":"\\bmp3\\b","negate":false,"required":true}]', 'audio', 0),
  ('M4B (Conservative)',           7, NULL, 350,  NULL, 'cyan',   '[{"type":"releaseTitle","value":"\\bm4[ab]\\b","negate":false,"required":true}]', 'audio', 0),
  ('FLAC (Conservative)',          8, NULL, NULL, NULL, 'purple', '[{"type":"releaseTitle","value":"\\bflac\\b","negate":false,"required":true}]', 'audio', 0);--> statement-breakpoint

-- ------------------------------------------------------------
-- 14 & 15. Seed 4 TRaSH video profiles (enabled) + 4 conservative (disabled)
-- ------------------------------------------------------------

-- WEB-1080p (TV, TRaSH, enabled)
INSERT INTO download_profiles (name, root_folder_path, cutoff, items, upgrade_allowed, content_type, categories, type, language, icon, enabled)
  VALUES ('WEB-1080p', './data/tv', 0, '[]', 1, 'tv', '[5030,5040,5045]', 'video', 'en', 'tv', 1);--> statement-breakpoint
UPDATE download_profiles SET
  cutoff = (SELECT id FROM download_formats WHERE title = 'WEBDL-1080p' AND type = 'video' AND enabled = 1 LIMIT 1),
  items = json_array(
    (SELECT id FROM download_formats WHERE title = 'WEBDL-1080p'  AND type = 'video' AND enabled = 1 LIMIT 1),
    (SELECT id FROM download_formats WHERE title = 'WEBRip-1080p' AND type = 'video' AND enabled = 1 LIMIT 1),
    (SELECT id FROM download_formats WHERE title = 'HDTV-1080p'   AND type = 'video' AND enabled = 1 LIMIT 1)
  )
WHERE name = 'WEB-1080p' AND content_type = 'tv';--> statement-breakpoint

-- WEB-2160p (TV, TRaSH, enabled)
INSERT INTO download_profiles (name, root_folder_path, cutoff, items, upgrade_allowed, content_type, categories, type, language, icon, enabled)
  VALUES ('WEB-2160p', './data/tv', 0, '[]', 1, 'tv', '[5030,5040,5045]', 'video', 'en', 'tv-minimal', 1);--> statement-breakpoint
UPDATE download_profiles SET
  cutoff = (SELECT id FROM download_formats WHERE title = 'WEBDL-2160p' AND type = 'video' AND enabled = 1 LIMIT 1),
  items = json_array(
    (SELECT id FROM download_formats WHERE title = 'WEBDL-2160p'  AND type = 'video' AND enabled = 1 LIMIT 1),
    (SELECT id FROM download_formats WHERE title = 'WEBRip-2160p' AND type = 'video' AND enabled = 1 LIMIT 1),
    (SELECT id FROM download_formats WHERE title = 'Bluray-2160p' AND type = 'video' AND enabled = 1 LIMIT 1)
  )
WHERE name = 'WEB-2160p' AND content_type = 'tv';--> statement-breakpoint

-- HD Bluray + WEB (movie, TRaSH, enabled)
INSERT INTO download_profiles (name, root_folder_path, cutoff, items, upgrade_allowed, content_type, categories, type, language, icon, enabled)
  VALUES ('HD Bluray + WEB', './data/movies', 0, '[]', 1, 'movie', '[2030,2040,2045,2050]', 'video', 'en', 'film', 1);--> statement-breakpoint
UPDATE download_profiles SET
  cutoff = (SELECT id FROM download_formats WHERE title = 'Bluray-1080p' AND type = 'video' AND enabled = 1 LIMIT 1),
  items = json_array(
    (SELECT id FROM download_formats WHERE title = 'Bluray-1080p'  AND type = 'video' AND enabled = 1 LIMIT 1),
    (SELECT id FROM download_formats WHERE title = 'WEBDL-1080p'   AND type = 'video' AND enabled = 1 LIMIT 1),
    (SELECT id FROM download_formats WHERE title = 'WEBRip-1080p'  AND type = 'video' AND enabled = 1 LIMIT 1),
    (SELECT id FROM download_formats WHERE title = 'Bluray-720p'   AND type = 'video' AND enabled = 1 LIMIT 1),
    (SELECT id FROM download_formats WHERE title = 'WEBDL-720p'    AND type = 'video' AND enabled = 1 LIMIT 1),
    (SELECT id FROM download_formats WHERE title = 'WEBRip-720p'   AND type = 'video' AND enabled = 1 LIMIT 1)
  )
WHERE name = 'HD Bluray + WEB' AND content_type = 'movie';--> statement-breakpoint

-- Remux + WEB 2160p (movie, TRaSH, enabled)
INSERT INTO download_profiles (name, root_folder_path, cutoff, items, upgrade_allowed, content_type, categories, type, language, icon, enabled)
  VALUES ('Remux + WEB 2160p', './data/movies', 0, '[]', 1, 'movie', '[2030,2040,2045,2050]', 'video', 'en', 'clapperboard', 1);--> statement-breakpoint
UPDATE download_profiles SET
  cutoff = (SELECT id FROM download_formats WHERE title = 'Remux-2160p' AND type = 'video' AND enabled = 1 LIMIT 1),
  items = json_array(
    (SELECT id FROM download_formats WHERE title = 'Remux-2160p'  AND type = 'video' AND enabled = 1 LIMIT 1),
    (SELECT id FROM download_formats WHERE title = 'Bluray-2160p' AND type = 'video' AND enabled = 1 LIMIT 1),
    (SELECT id FROM download_formats WHERE title = 'WEBDL-2160p'  AND type = 'video' AND enabled = 1 LIMIT 1),
    (SELECT id FROM download_formats WHERE title = 'WEBRip-2160p' AND type = 'video' AND enabled = 1 LIMIT 1),
    (SELECT id FROM download_formats WHERE title = 'Remux-1080p'  AND type = 'video' AND enabled = 1 LIMIT 1),
    (SELECT id FROM download_formats WHERE title = 'Bluray-1080p' AND type = 'video' AND enabled = 1 LIMIT 1),
    (SELECT id FROM download_formats WHERE title = 'WEBDL-1080p'  AND type = 'video' AND enabled = 1 LIMIT 1)
  )
WHERE name = 'Remux + WEB 2160p' AND content_type = 'movie';--> statement-breakpoint

-- Any 1080p (TV, conservative, disabled)
INSERT INTO download_profiles (name, root_folder_path, cutoff, items, upgrade_allowed, content_type, categories, type, language, icon, enabled)
  VALUES ('Any 1080p', './data/tv', 0, '[]', 0, 'tv', '[5030,5040,5045]', 'video', 'en', 'tv', 0);--> statement-breakpoint
UPDATE download_profiles SET
  items = json_array(
    (SELECT id FROM download_formats WHERE title = 'WEBDL-1080p'  AND type = 'video' AND enabled = 1 LIMIT 1),
    (SELECT id FROM download_formats WHERE title = 'WEBRip-1080p' AND type = 'video' AND enabled = 1 LIMIT 1),
    (SELECT id FROM download_formats WHERE title = 'HDTV-1080p'   AND type = 'video' AND enabled = 1 LIMIT 1),
    (SELECT id FROM download_formats WHERE title = 'Bluray-1080p' AND type = 'video' AND enabled = 1 LIMIT 1)
  )
WHERE name = 'Any 1080p' AND content_type = 'tv';--> statement-breakpoint

-- Any 2160p (TV, conservative, disabled)
INSERT INTO download_profiles (name, root_folder_path, cutoff, items, upgrade_allowed, content_type, categories, type, language, icon, enabled)
  VALUES ('Any 2160p', './data/tv', 0, '[]', 0, 'tv', '[5030,5040,5045]', 'video', 'en', 'tv-minimal', 0);--> statement-breakpoint
UPDATE download_profiles SET
  items = json_array(
    (SELECT id FROM download_formats WHERE title = 'WEBDL-2160p'  AND type = 'video' AND enabled = 1 LIMIT 1),
    (SELECT id FROM download_formats WHERE title = 'WEBRip-2160p' AND type = 'video' AND enabled = 1 LIMIT 1),
    (SELECT id FROM download_formats WHERE title = 'HDTV-2160p'   AND type = 'video' AND enabled = 1 LIMIT 1),
    (SELECT id FROM download_formats WHERE title = 'Bluray-2160p' AND type = 'video' AND enabled = 1 LIMIT 1)
  )
WHERE name = 'Any 2160p' AND content_type = 'tv';--> statement-breakpoint

-- Any 1080p (movie, conservative, disabled)
INSERT INTO download_profiles (name, root_folder_path, cutoff, items, upgrade_allowed, content_type, categories, type, language, icon, enabled)
  VALUES ('Any 1080p', './data/movies', 0, '[]', 0, 'movie', '[2030,2040,2045,2050]', 'video', 'en', 'film', 0);--> statement-breakpoint
UPDATE download_profiles SET
  items = json_array(
    (SELECT id FROM download_formats WHERE title = 'WEBDL-1080p'  AND type = 'video' AND enabled = 1 LIMIT 1),
    (SELECT id FROM download_formats WHERE title = 'WEBRip-1080p' AND type = 'video' AND enabled = 1 LIMIT 1),
    (SELECT id FROM download_formats WHERE title = 'HDTV-1080p'   AND type = 'video' AND enabled = 1 LIMIT 1),
    (SELECT id FROM download_formats WHERE title = 'Bluray-1080p' AND type = 'video' AND enabled = 1 LIMIT 1),
    (SELECT id FROM download_formats WHERE title = 'Remux-1080p'  AND type = 'video' AND enabled = 1 LIMIT 1)
  )
WHERE name = 'Any 1080p' AND content_type = 'movie';--> statement-breakpoint

-- Any 2160p (movie, conservative, disabled)
INSERT INTO download_profiles (name, root_folder_path, cutoff, items, upgrade_allowed, content_type, categories, type, language, icon, enabled)
  VALUES ('Any 2160p', './data/movies', 0, '[]', 0, 'movie', '[2030,2040,2045,2050]', 'video', 'en', 'clapperboard', 0);--> statement-breakpoint
UPDATE download_profiles SET
  items = json_array(
    (SELECT id FROM download_formats WHERE title = 'WEBDL-2160p'  AND type = 'video' AND enabled = 1 LIMIT 1),
    (SELECT id FROM download_formats WHERE title = 'WEBRip-2160p' AND type = 'video' AND enabled = 1 LIMIT 1),
    (SELECT id FROM download_formats WHERE title = 'HDTV-2160p'   AND type = 'video' AND enabled = 1 LIMIT 1),
    (SELECT id FROM download_formats WHERE title = 'Bluray-2160p' AND type = 'video' AND enabled = 1 LIMIT 1),
    (SELECT id FROM download_formats WHERE title = 'Remux-2160p'  AND type = 'video' AND enabled = 1 LIMIT 1)
  )
WHERE name = 'Any 2160p' AND content_type = 'movie';--> statement-breakpoint

-- ------------------------------------------------------------
-- 16. Seed 2 conservative book profiles (disabled)
-- ------------------------------------------------------------

-- Ebook (Conservative) - disabled
INSERT INTO download_profiles (name, root_folder_path, cutoff, items, upgrade_allowed, content_type, categories, type, language, icon, enabled)
  VALUES ('Ebook (Conservative)', './data/books', 0, '[]', 0, 'book', '[7020,8010]', 'ebook', 'en', 'book-marked', 0);--> statement-breakpoint
UPDATE download_profiles SET
  items = json_array(
    (SELECT id FROM download_formats WHERE title = 'EPUB (Conservative)'         AND type = 'ebook' AND enabled = 0 LIMIT 1),
    (SELECT id FROM download_formats WHERE title = 'AZW3 (Conservative)'         AND type = 'ebook' AND enabled = 0 LIMIT 1),
    (SELECT id FROM download_formats WHERE title = 'MOBI (Conservative)'         AND type = 'ebook' AND enabled = 0 LIMIT 1),
    (SELECT id FROM download_formats WHERE title = 'PDF (Conservative)'          AND type = 'ebook' AND enabled = 0 LIMIT 1),
    (SELECT id FROM download_formats WHERE title = 'Unknown Text (Conservative)' AND type = 'ebook' AND enabled = 0 LIMIT 1)
  )
WHERE name = 'Ebook (Conservative)' AND content_type = 'book';--> statement-breakpoint

-- Audiobook (Conservative) - disabled
INSERT INTO download_profiles (name, root_folder_path, cutoff, items, upgrade_allowed, content_type, categories, type, language, icon, enabled)
  VALUES ('Audiobook (Conservative)', './data/audiobooks', 0, '[]', 0, 'book', '[3030]', 'audio', 'en', 'audio-lines', 0);--> statement-breakpoint
UPDATE download_profiles SET
  items = json_array(
    (SELECT id FROM download_formats WHERE title = 'MP3 (Conservative)'          AND type = 'audio' AND enabled = 0 LIMIT 1),
    (SELECT id FROM download_formats WHERE title = 'M4B (Conservative)'          AND type = 'audio' AND enabled = 0 LIMIT 1),
    (SELECT id FROM download_formats WHERE title = 'FLAC (Conservative)'         AND type = 'audio' AND enabled = 0 LIMIT 1),
    (SELECT id FROM download_formats WHERE title = 'Unknown Audio (Conservative)' AND type = 'audio' AND enabled = 0 LIMIT 1)
  )
WHERE name = 'Audiobook (Conservative)' AND content_type = 'book';
