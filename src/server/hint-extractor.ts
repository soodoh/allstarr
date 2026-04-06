import path from "node:path";
import type { UnmappedFileHints } from "src/db/schema/unmapped-files";

// ─── Filename patterns ─────────────────────────────────────────────────────

// "Author - Title (Year).ext" or "Author - Title.ext"
const BOOK_AUTHOR_TITLE_YEAR = /^(.+?)\s*-\s*(.+?)(?:\s*\((\d{4})\))?\s*\.\w+$/;

// "Title (Year).ext"
const TITLE_YEAR = /^(.+?)\s*\((\d{4})\)\s*\.\w+$/;

// "Movie.Title.2024.1080p.BluRay.x264.mkv" — dots as separators, year followed by quality tags
const DOTTED_MOVIE =
	/^(.+?)\.(\d{4})\.(?:\d{3,4}p|WEB|BluRay|BDRip|HDRip|DVDRip|REMUX)/i;

// "Show.S01E03.720p.mkv" or "Show - S01E03.mkv"
const TV_EPISODE = /^(.+?)[\s._-]+S(\d{1,2})E(\d{1,3})/i;

// ─── Path patterns ──────────────────────────────────────────────────────────

// "Title (Year)" directory name
const DIR_TITLE_YEAR = /^(.+?)\s*\((\d{4})\)$/;

// "Season 01" or "Season 1"
const SEASON_DIR = /^Season\s*(\d{1,2})$/i;

// ─── Main function ──────────────────────────────────────────────────────────

export function extractHints(
	filePath: string,
	contentType: string,
): UnmappedFileHints | null {
	const filename = path.basename(filePath);

	// Try filename-based extraction first
	const filenameHints = extractFromFilename(filename, contentType);
	if (filenameHints) {
		return filenameHints;
	}

	// Fall back to path-based extraction
	const pathHints = extractFromPath(filePath, contentType);
	if (pathHints) {
		return pathHints;
	}

	return null;
}

function extractFromFilename(
	filename: string,
	contentType: string,
): UnmappedFileHints | null {
	if (contentType === "tv") {
		const tvMatch = filename.match(TV_EPISODE);
		if (tvMatch) {
			return {
				title: tvMatch[1].replaceAll(".", " ").trim(),
				season: Number.parseInt(tvMatch[2], 10),
				episode: Number.parseInt(tvMatch[3], 10),
				source: "filename",
			};
		}
	}

	if (contentType === "movie") {
		const dottedMatch = filename.match(DOTTED_MOVIE);
		if (dottedMatch) {
			return {
				title: dottedMatch[1].replaceAll(".", " ").trim(),
				year: Number.parseInt(dottedMatch[2], 10),
				source: "filename",
			};
		}
	}

	if (contentType === "ebook" || contentType === "audiobook") {
		const bookMatch = filename.match(BOOK_AUTHOR_TITLE_YEAR);
		if (bookMatch) {
			const hints: UnmappedFileHints = {
				title: bookMatch[2].trim(),
				author: bookMatch[1].trim(),
				source: "filename",
			};
			if (bookMatch[3]) {
				hints.year = Number.parseInt(bookMatch[3], 10);
			}
			return hints;
		}
	}

	// Generic "Title (Year).ext" — works for movies and books
	const titleYearMatch = filename.match(TITLE_YEAR);
	if (titleYearMatch) {
		return {
			title: titleYearMatch[1].trim(),
			year: Number.parseInt(titleYearMatch[2], 10),
			source: "filename",
		};
	}

	// Last resort: strip extension for title
	const nameNoExt = filename.replace(/\.\w+$/, "").trim();
	// Only return if it looks like a real title (has at least one letter, more than 3 chars)
	if (nameNoExt.length > 3 && /[a-zA-Z]/.test(nameNoExt)) {
		// Check if it has meaningful content (not just random chars)
		const words = nameNoExt.split(/[\s._-]+/).filter((w) => w.length > 1);
		if (words.length >= 2) {
			return {
				title: nameNoExt.replaceAll(/[._]/g, " ").trim(),
				source: "filename",
			};
		}
	}

	return null;
}

function extractFromPath(
	filePath: string,
	contentType: string,
): UnmappedFileHints | null {
	const parts = filePath.split(path.sep);
	// Need at least: root / ... / parent / file
	if (parts.length < 3) {
		return null;
	}

	const parentDir = parts[parts.length - 2];
	const grandparentDir = parts.length >= 4 ? parts[parts.length - 3] : null;

	if (contentType === "tv") {
		// Look for "Season XX" in parent and show name in grandparent
		const seasonMatch = parentDir.match(SEASON_DIR);
		if (seasonMatch && grandparentDir) {
			const hints: UnmappedFileHints = {
				title: grandparentDir.trim(),
				season: Number.parseInt(seasonMatch[1], 10),
				source: "path",
			};
			return hints;
		}
	}

	if (contentType === "ebook" || contentType === "audiobook") {
		// Look for "Title (Year)" in parent dir, author in grandparent
		const titleMatch = parentDir.match(DIR_TITLE_YEAR);
		if (titleMatch) {
			const hints: UnmappedFileHints = {
				title: titleMatch[1].trim(),
				year: Number.parseInt(titleMatch[2], 10),
				source: "path",
			};
			if (grandparentDir) {
				hints.author = grandparentDir.trim();
			}
			return hints;
		}
	}

	if (contentType === "movie") {
		// Look for "Title (Year)" in parent dir
		const titleMatch = parentDir.match(DIR_TITLE_YEAR);
		if (titleMatch) {
			return {
				title: titleMatch[1].trim(),
				year: Number.parseInt(titleMatch[2], 10),
				source: "path",
			};
		}
	}

	return null;
}
