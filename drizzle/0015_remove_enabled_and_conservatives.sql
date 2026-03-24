-- ============================================================
-- 0015_remove_enabled_and_conservatives
-- Removes the enabled/disabled concept from all format tables
-- and deletes conservative (disabled) seed data.
-- ============================================================

-- Step 1: Delete conservative download_profiles (those seeded with enabled=0)
DELETE FROM download_profiles WHERE enabled = 0;--> statement-breakpoint

-- Step 2: Delete conservative download_formats (those seeded with enabled=0)
DELETE FROM download_formats WHERE enabled = 0;--> statement-breakpoint

-- Step 3: Delete any custom_formats migrated from conservative formats (enabled=0)
DELETE FROM custom_formats WHERE enabled = 0;--> statement-breakpoint

-- Step 4: Drop enabled column from all three tables
ALTER TABLE custom_formats DROP COLUMN enabled;--> statement-breakpoint
ALTER TABLE download_formats DROP COLUMN enabled;--> statement-breakpoint
ALTER TABLE download_profiles DROP COLUMN enabled;
