-- Copy existing global values to per-type keys
INSERT INTO settings (key, value) SELECT 'mediaManagement.ebook.renameBooks', value FROM settings WHERE key = 'mediaManagement.renameBooks';--> statement-breakpoint
INSERT INTO settings (key, value) SELECT 'mediaManagement.audiobook.renameBooks', value FROM settings WHERE key = 'mediaManagement.renameBooks';--> statement-breakpoint
INSERT INTO settings (key, value) SELECT 'mediaManagement.ebook.replaceIllegalCharacters', value FROM settings WHERE key = 'mediaManagement.replaceIllegalCharacters';--> statement-breakpoint
INSERT INTO settings (key, value) SELECT 'mediaManagement.audiobook.replaceIllegalCharacters', value FROM settings WHERE key = 'mediaManagement.replaceIllegalCharacters';--> statement-breakpoint
INSERT INTO settings (key, value) SELECT 'mediaManagement.ebook.createEmptyAuthorFolders', value FROM settings WHERE key = 'mediaManagement.createEmptyAuthorFolders';--> statement-breakpoint
INSERT INTO settings (key, value) SELECT 'mediaManagement.audiobook.createEmptyAuthorFolders', value FROM settings WHERE key = 'mediaManagement.createEmptyAuthorFolders';--> statement-breakpoint
INSERT INTO settings (key, value) SELECT 'mediaManagement.ebook.deleteEmptyAuthorFolders', value FROM settings WHERE key = 'mediaManagement.deleteEmptyAuthorFolders';--> statement-breakpoint
INSERT INTO settings (key, value) SELECT 'mediaManagement.audiobook.deleteEmptyAuthorFolders', value FROM settings WHERE key = 'mediaManagement.deleteEmptyAuthorFolders';--> statement-breakpoint
INSERT INTO settings (key, value) SELECT 'mediaManagement.ebook.useHardLinks', value FROM settings WHERE key = 'mediaManagement.useHardLinks';--> statement-breakpoint
INSERT INTO settings (key, value) SELECT 'mediaManagement.audiobook.useHardLinks', value FROM settings WHERE key = 'mediaManagement.useHardLinks';--> statement-breakpoint
INSERT INTO settings (key, value) SELECT 'mediaManagement.ebook.skipFreeSpaceCheck', value FROM settings WHERE key = 'mediaManagement.skipFreeSpaceCheck';--> statement-breakpoint
INSERT INTO settings (key, value) SELECT 'mediaManagement.audiobook.skipFreeSpaceCheck', value FROM settings WHERE key = 'mediaManagement.skipFreeSpaceCheck';--> statement-breakpoint
INSERT INTO settings (key, value) SELECT 'mediaManagement.ebook.minimumFreeSpace', value FROM settings WHERE key = 'mediaManagement.minimumFreeSpace';--> statement-breakpoint
INSERT INTO settings (key, value) SELECT 'mediaManagement.audiobook.minimumFreeSpace', value FROM settings WHERE key = 'mediaManagement.minimumFreeSpace';--> statement-breakpoint
INSERT INTO settings (key, value) SELECT 'mediaManagement.ebook.importExtraFiles', value FROM settings WHERE key = 'mediaManagement.importExtraFiles';--> statement-breakpoint
INSERT INTO settings (key, value) SELECT 'mediaManagement.audiobook.importExtraFiles', value FROM settings WHERE key = 'mediaManagement.importExtraFiles';--> statement-breakpoint
INSERT INTO settings (key, value) SELECT 'mediaManagement.ebook.propersAndRepacks', value FROM settings WHERE key = 'mediaManagement.propersAndRepacks';--> statement-breakpoint
INSERT INTO settings (key, value) SELECT 'mediaManagement.audiobook.propersAndRepacks', value FROM settings WHERE key = 'mediaManagement.propersAndRepacks';--> statement-breakpoint
INSERT INTO settings (key, value) SELECT 'mediaManagement.ebook.ignoreDeletedBooks', value FROM settings WHERE key = 'mediaManagement.ignoreDeletedBooks';--> statement-breakpoint
INSERT INTO settings (key, value) SELECT 'mediaManagement.audiobook.ignoreDeletedBooks', value FROM settings WHERE key = 'mediaManagement.ignoreDeletedBooks';--> statement-breakpoint
INSERT INTO settings (key, value) SELECT 'mediaManagement.ebook.changeFileDate', value FROM settings WHERE key = 'mediaManagement.changeFileDate';--> statement-breakpoint
INSERT INTO settings (key, value) SELECT 'mediaManagement.audiobook.changeFileDate', value FROM settings WHERE key = 'mediaManagement.changeFileDate';--> statement-breakpoint
INSERT INTO settings (key, value) SELECT 'mediaManagement.ebook.recyclingBin', value FROM settings WHERE key = 'mediaManagement.recyclingBin';--> statement-breakpoint
INSERT INTO settings (key, value) SELECT 'mediaManagement.audiobook.recyclingBin', value FROM settings WHERE key = 'mediaManagement.recyclingBin';--> statement-breakpoint
INSERT INTO settings (key, value) SELECT 'mediaManagement.ebook.recyclingBinCleanup', value FROM settings WHERE key = 'mediaManagement.recyclingBinCleanup';--> statement-breakpoint
INSERT INTO settings (key, value) SELECT 'mediaManagement.audiobook.recyclingBinCleanup', value FROM settings WHERE key = 'mediaManagement.recyclingBinCleanup';--> statement-breakpoint
INSERT INTO settings (key, value) SELECT 'mediaManagement.ebook.setPermissions', value FROM settings WHERE key = 'mediaManagement.setPermissions';--> statement-breakpoint
INSERT INTO settings (key, value) SELECT 'mediaManagement.audiobook.setPermissions', value FROM settings WHERE key = 'mediaManagement.setPermissions';--> statement-breakpoint
INSERT INTO settings (key, value) SELECT 'mediaManagement.ebook.fileChmod', value FROM settings WHERE key = 'mediaManagement.fileChmod';--> statement-breakpoint
INSERT INTO settings (key, value) SELECT 'mediaManagement.audiobook.fileChmod', value FROM settings WHERE key = 'mediaManagement.fileChmod';--> statement-breakpoint
INSERT INTO settings (key, value) SELECT 'mediaManagement.ebook.folderChmod', value FROM settings WHERE key = 'mediaManagement.folderChmod';--> statement-breakpoint
INSERT INTO settings (key, value) SELECT 'mediaManagement.audiobook.folderChmod', value FROM settings WHERE key = 'mediaManagement.folderChmod';--> statement-breakpoint
INSERT INTO settings (key, value) SELECT 'mediaManagement.ebook.chownGroup', value FROM settings WHERE key = 'mediaManagement.chownGroup';--> statement-breakpoint
INSERT INTO settings (key, value) SELECT 'mediaManagement.audiobook.chownGroup', value FROM settings WHERE key = 'mediaManagement.chownGroup';--> statement-breakpoint
-- Delete old global keys
DELETE FROM settings WHERE key IN ('mediaManagement.renameBooks', 'mediaManagement.replaceIllegalCharacters', 'mediaManagement.createEmptyAuthorFolders', 'mediaManagement.deleteEmptyAuthorFolders', 'mediaManagement.useHardLinks', 'mediaManagement.skipFreeSpaceCheck', 'mediaManagement.minimumFreeSpace', 'mediaManagement.importExtraFiles', 'mediaManagement.propersAndRepacks', 'mediaManagement.ignoreDeletedBooks', 'mediaManagement.changeFileDate', 'mediaManagement.recyclingBin', 'mediaManagement.recyclingBinCleanup', 'mediaManagement.setPermissions', 'mediaManagement.fileChmod', 'mediaManagement.folderChmod', 'mediaManagement.chownGroup');--> statement-breakpoint
-- Seed defaults for fresh installs (INSERT OR IGNORE skips if rows exist from copy above)
INSERT OR IGNORE INTO settings (key, value) VALUES ('mediaManagement.ebook.renameBooks', 'false');--> statement-breakpoint
INSERT OR IGNORE INTO settings (key, value) VALUES ('mediaManagement.audiobook.renameBooks', 'false');--> statement-breakpoint
INSERT OR IGNORE INTO settings (key, value) VALUES ('mediaManagement.ebook.replaceIllegalCharacters', 'true');--> statement-breakpoint
INSERT OR IGNORE INTO settings (key, value) VALUES ('mediaManagement.audiobook.replaceIllegalCharacters', 'true');--> statement-breakpoint
INSERT OR IGNORE INTO settings (key, value) VALUES ('mediaManagement.ebook.createEmptyAuthorFolders', 'false');--> statement-breakpoint
INSERT OR IGNORE INTO settings (key, value) VALUES ('mediaManagement.audiobook.createEmptyAuthorFolders', 'false');--> statement-breakpoint
INSERT OR IGNORE INTO settings (key, value) VALUES ('mediaManagement.ebook.deleteEmptyAuthorFolders', 'false');--> statement-breakpoint
INSERT OR IGNORE INTO settings (key, value) VALUES ('mediaManagement.audiobook.deleteEmptyAuthorFolders', 'false');--> statement-breakpoint
INSERT OR IGNORE INTO settings (key, value) VALUES ('mediaManagement.ebook.useHardLinks', 'true');--> statement-breakpoint
INSERT OR IGNORE INTO settings (key, value) VALUES ('mediaManagement.audiobook.useHardLinks', 'true');--> statement-breakpoint
INSERT OR IGNORE INTO settings (key, value) VALUES ('mediaManagement.ebook.skipFreeSpaceCheck', 'false');--> statement-breakpoint
INSERT OR IGNORE INTO settings (key, value) VALUES ('mediaManagement.audiobook.skipFreeSpaceCheck', 'false');--> statement-breakpoint
INSERT OR IGNORE INTO settings (key, value) VALUES ('mediaManagement.ebook.minimumFreeSpace', '100');--> statement-breakpoint
INSERT OR IGNORE INTO settings (key, value) VALUES ('mediaManagement.audiobook.minimumFreeSpace', '100');--> statement-breakpoint
INSERT OR IGNORE INTO settings (key, value) VALUES ('mediaManagement.ebook.importExtraFiles', 'false');--> statement-breakpoint
INSERT OR IGNORE INTO settings (key, value) VALUES ('mediaManagement.audiobook.importExtraFiles', 'false');--> statement-breakpoint
INSERT OR IGNORE INTO settings (key, value) VALUES ('mediaManagement.ebook.propersAndRepacks', '"preferAndUpgrade"');--> statement-breakpoint
INSERT OR IGNORE INTO settings (key, value) VALUES ('mediaManagement.audiobook.propersAndRepacks', '"preferAndUpgrade"');--> statement-breakpoint
INSERT OR IGNORE INTO settings (key, value) VALUES ('mediaManagement.ebook.ignoreDeletedBooks', 'false');--> statement-breakpoint
INSERT OR IGNORE INTO settings (key, value) VALUES ('mediaManagement.audiobook.ignoreDeletedBooks', 'false');--> statement-breakpoint
INSERT OR IGNORE INTO settings (key, value) VALUES ('mediaManagement.ebook.changeFileDate', '"none"');--> statement-breakpoint
INSERT OR IGNORE INTO settings (key, value) VALUES ('mediaManagement.audiobook.changeFileDate', '"none"');--> statement-breakpoint
INSERT OR IGNORE INTO settings (key, value) VALUES ('mediaManagement.ebook.recyclingBin', '""');--> statement-breakpoint
INSERT OR IGNORE INTO settings (key, value) VALUES ('mediaManagement.audiobook.recyclingBin', '""');--> statement-breakpoint
INSERT OR IGNORE INTO settings (key, value) VALUES ('mediaManagement.ebook.recyclingBinCleanup', '7');--> statement-breakpoint
INSERT OR IGNORE INTO settings (key, value) VALUES ('mediaManagement.audiobook.recyclingBinCleanup', '7');--> statement-breakpoint
INSERT OR IGNORE INTO settings (key, value) VALUES ('mediaManagement.ebook.setPermissions', 'false');--> statement-breakpoint
INSERT OR IGNORE INTO settings (key, value) VALUES ('mediaManagement.audiobook.setPermissions', 'false');--> statement-breakpoint
INSERT OR IGNORE INTO settings (key, value) VALUES ('mediaManagement.ebook.fileChmod', '"0644"');--> statement-breakpoint
INSERT OR IGNORE INTO settings (key, value) VALUES ('mediaManagement.audiobook.fileChmod', '"0644"');--> statement-breakpoint
INSERT OR IGNORE INTO settings (key, value) VALUES ('mediaManagement.ebook.folderChmod', '"0755"');--> statement-breakpoint
INSERT OR IGNORE INTO settings (key, value) VALUES ('mediaManagement.audiobook.folderChmod', '"0755"');--> statement-breakpoint
INSERT OR IGNORE INTO settings (key, value) VALUES ('mediaManagement.ebook.chownGroup', '""');--> statement-breakpoint
INSERT OR IGNORE INTO settings (key, value) VALUES ('mediaManagement.audiobook.chownGroup', '""');
