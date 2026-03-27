-- Download Formats: Manga
INSERT INTO download_formats (title, weight, min_size, max_size, preferred_size, color, content_types, no_max_limit, no_preferred_limit) VALUES
  ('Unknown Manga', 1, 0,   500, 500, 'gray',   '["manga"]', 1, 1),
  ('CBR',           2, 0,   200, 50,  'orange', '["manga"]', 0, 0),
  ('CBZ',           3, 0,   200, 50,  'green',  '["manga"]', 0, 0),
  ('PDF',           4, 0,   200, 50,  'yellow', '["manga"]', 0, 0),
  ('EPUB',          5, 0,   200, 50,  'blue',   '["manga"]', 0, 0);--> statement-breakpoint

-- Download Profile: Manga
INSERT INTO download_profiles (name, root_folder_path, cutoff, items, upgrade_allowed, icon, categories, content_type, language, min_custom_format_score, upgrade_until_custom_format_score) VALUES
  ('Manga', './data/manga', 0, '[]', 0, 'book-open-text', '[]', 'manga', 'en', 0, 0);--> statement-breakpoint

-- Populate manga profile items with manga format IDs
UPDATE download_profiles SET
  items = (
    SELECT json_array(
      json_array((SELECT id FROM download_formats WHERE title = 'CBZ'  AND content_types LIKE '%"manga"%' LIMIT 1)),
      json_array((SELECT id FROM download_formats WHERE title = 'CBR'  AND content_types LIKE '%"manga"%' LIMIT 1)),
      json_array((SELECT id FROM download_formats WHERE title = 'EPUB' AND content_types LIKE '%"manga"%' LIMIT 1)),
      json_array((SELECT id FROM download_formats WHERE title = 'PDF'  AND content_types LIKE '%"manga"%' LIMIT 1))
    )
  )
WHERE name = 'Manga' AND content_type = 'manga';
