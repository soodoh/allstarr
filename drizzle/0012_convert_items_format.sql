-- Convert download_profiles.items from flat array [1,2,3] to grouped array [[1],[2],[3]]
UPDATE download_profiles
SET items = (
  SELECT json_group_array(json_array(value))
  FROM json_each(download_profiles.items)
)
WHERE json_type(items) = 'array'
  AND json_array_length(items) > 0
  AND json_type(json_extract(items, '$[0]')) != 'array';
