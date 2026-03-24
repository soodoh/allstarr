-- ============================================================
-- 0013_migrate_specifications
-- Migrates existing download_formats.specifications data into
-- custom_formats entries. Each download_format with non-empty
-- specs produces one custom_format row. Profile linkages are
-- created via profile_custom_formats so that every profile
-- containing the source format gets the new custom format
-- with a score derived from the format weight.
-- ============================================================

-- Step 1: Insert custom_formats from download_formats that have non-empty specs.
-- Maps:
--   name         = format title + ": Release Title Match" (most specs are releaseTitle)
--   category     = inferred from type (ebook→"File Format", audio→"Audiobook Quality", video→"Release Group")
--   specifications = converted from old spec shape to new CF spec shape (adds "name" field)
--   defaultScore = format weight
--   contentTypes = mapped from type (ebook→["ebook"], audio→["audiobook"], video→["movie","tv"])
--   origin       = NULL (user-created data, not builtin)

INSERT INTO custom_formats (name, category, specifications, default_score, content_types, include_in_renaming, description, origin, user_modified, enabled)
SELECT
  df.title || ': Release Title Match' AS name,
  CASE df.type
    WHEN 'ebook' THEN 'File Format'
    WHEN 'audio' THEN 'Audiobook Quality'
    WHEN 'video' THEN 'Release Group'
    ELSE 'File Format'
  END AS category,
  -- Convert old specs to new CF specs format by adding a "name" field to each spec
  (
    SELECT json_group_array(
      json_object(
        'name', json_extract(spec.value, '$.type') || ': ' || COALESCE(json_extract(spec.value, '$.value'), ''),
        'type', json_extract(spec.value, '$.type'),
        'value', json_extract(spec.value, '$.value'),
        'min', json_extract(spec.value, '$.min'),
        'max', json_extract(spec.value, '$.max'),
        'negate', CASE WHEN json_extract(spec.value, '$.negate') THEN 1 ELSE 0 END,
        'required', CASE WHEN json_extract(spec.value, '$.required') THEN 1 ELSE 0 END
      )
    )
    FROM json_each(df.specifications) AS spec
  ) AS specifications,
  df.weight AS default_score,
  CASE df.type
    WHEN 'ebook' THEN '["ebook"]'
    WHEN 'audio' THEN '["audiobook"]'
    WHEN 'video' THEN '["movie","tv"]'
    ELSE '["ebook"]'
  END AS content_types,
  0 AS include_in_renaming,
  'Auto-migrated from download format "' || df.title || '" specifications' AS description,
  NULL AS origin,
  0 AS user_modified,
  df.enabled AS enabled
FROM download_formats df
WHERE df.specifications IS NOT NULL
  AND df.specifications != '[]'
  AND json_array_length(df.specifications) > 0;
--> statement-breakpoint

-- Step 2: Create profile_custom_formats linkages.
-- For each download_profile, find all format IDs in its items array,
-- then link the corresponding migrated custom_formats with score = weight.
-- We match by finding custom_formats whose description references the format title.
INSERT INTO profile_custom_formats (profile_id, custom_format_id, score)
SELECT DISTINCT
  dp.id AS profile_id,
  cf.id AS custom_format_id,
  cf.default_score AS score
FROM download_profiles dp
CROSS JOIN custom_formats cf
WHERE cf.description LIKE 'Auto-migrated from download format "%' || '" specifications'
  AND cf.origin IS NULL
  -- Match: the format title embedded in cf.description must correspond to a format
  -- that appears in the profile's items array
  AND EXISTS (
    SELECT 1
    FROM download_formats df
    WHERE cf.description = 'Auto-migrated from download format "' || df.title || '" specifications'
      AND EXISTS (
        -- Check if this format ID appears anywhere in the profile's items (nested array of arrays)
        SELECT 1
        FROM json_each(dp.items) AS grp
        CROSS JOIN json_each(grp.value) AS item
        WHERE item.value = df.id
      )
  );
