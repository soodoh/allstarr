-- ============================================================
-- 0014_drop_format_specifications
-- Removes the specifications column from download_formats.
-- Specification-based matching has been replaced by:
--   - Quality tier identity matching (title/source/resolution)
--   - Custom formats system (custom_formats table)
-- ============================================================

ALTER TABLE download_formats DROP COLUMN specifications;
