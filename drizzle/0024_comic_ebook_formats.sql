-- Repurpose manga download formats as comic ebook formats
UPDATE download_formats
SET title = 'Unknown Comic',
    content_types = '["ebook"]',
    max_size = 300,
    preferred_size = 100
WHERE title = 'Unknown Manga' AND content_types LIKE '%"manga"%';--> statement-breakpoint

UPDATE download_formats
SET content_types = '["ebook"]',
    max_size = 300,
    preferred_size = 100
WHERE title = 'CBR' AND content_types LIKE '%"manga"%';--> statement-breakpoint

UPDATE download_formats
SET content_types = '["ebook"]',
    max_size = 300,
    preferred_size = 100
WHERE title = 'CBZ' AND content_types LIKE '%"manga"%';--> statement-breakpoint

UPDATE download_formats
SET content_types = '["ebook"]',
    max_size = 300,
    preferred_size = 100
WHERE title = 'PDF' AND content_types LIKE '%"manga"%';--> statement-breakpoint

UPDATE download_formats
SET content_types = '["ebook"]',
    max_size = 300,
    preferred_size = 100
WHERE title = 'EPUB' AND content_types LIKE '%"manga"%';--> statement-breakpoint

-- Repurpose Manga profile as Comics/Manga ebook profile
UPDATE download_profiles
SET name = 'Comics/Manga',
    root_folder_path = './data/comics',
    content_type = 'ebook'
WHERE name = 'Manga' AND content_type = 'manga';
