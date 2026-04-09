import { describe, expect, test } from "vitest";
import { extractHints } from "./hint-extractor";

describe("extractHints", () => {
	describe("book filenames", () => {
		test("parses 'Author - Title.epub' pattern", () => {
			const result = extractHints(
				"/library/books/Stephen King - The Shining.epub",
				"ebook",
			);
			expect(result).toEqual({
				title: "The Shining",
				author: "Stephen King",
				source: "filename",
			});
		});

		test("parses 'Author - Title (Year).epub' pattern", () => {
			const result = extractHints(
				"/library/books/Stephen King - The Shining (1977).epub",
				"ebook",
			);
			expect(result).toEqual({
				title: "The Shining",
				author: "Stephen King",
				year: 1977,
				source: "filename",
			});
		});

		test("parses title-only filename", () => {
			const result = extractHints("/library/books/The Shining.epub", "ebook");
			expect(result).toEqual({
				title: "The Shining",
				source: "filename",
			});
		});
	});

	describe("movie filenames", () => {
		test("parses 'Movie.Title.2024.1080p.BluRay.mkv' pattern", () => {
			const result = extractHints(
				"/media/movies/Dune.Part.Two.2024.1080p.BluRay.x264.mkv",
				"movie",
			);
			expect(result).toEqual({
				title: "Dune Part Two",
				year: 2024,
				source: "filename",
			});
		});

		test("parses 'Movie Title (2024).mkv' pattern", () => {
			const result = extractHints(
				"/media/movies/Dune Part Two (2024).mkv",
				"movie",
			);
			expect(result).toEqual({
				title: "Dune Part Two",
				year: 2024,
				source: "filename",
			});
		});
	});

	describe("TV filenames", () => {
		test("parses 'Show.S01E03.720p.mkv' pattern", () => {
			const result = extractHints(
				"/media/tv/Breaking.Bad.S01E03.720p.mkv",
				"tv",
			);
			expect(result).toEqual({
				title: "Breaking Bad",
				season: 1,
				episode: 3,
				source: "filename",
			});
		});

		test("parses 'Show - S02E10.mkv' pattern", () => {
			const result = extractHints("/media/tv/Breaking Bad - S02E10.mkv", "tv");
			expect(result).toEqual({
				title: "Breaking Bad",
				season: 2,
				episode: 10,
				source: "filename",
			});
		});
	});

	describe("path-based hints", () => {
		test("falls back to parent directory for book hints", () => {
			const result = extractHints(
				"/library/books/Stephen King/The Shining (1977)/book.epub",
				"ebook",
			);
			expect(result).toEqual({
				title: "The Shining",
				author: "Stephen King",
				year: 1977,
				source: "path",
			});
		});

		test("falls back to parent directory for movie hints", () => {
			const result = extractHints(
				"/media/movies/Dune Part Two (2024)/movie.mkv",
				"movie",
			);
			expect(result).toEqual({
				title: "Dune Part Two",
				year: 2024,
				source: "path",
			});
		});

		test("falls back to parent directories for TV hints", () => {
			const result = extractHints(
				"/media/tv/Breaking Bad/Season 01/episode.mkv",
				"tv",
			);
			expect(result).toEqual({
				title: "Breaking Bad",
				season: 1,
				source: "path",
			});
		});
	});

	describe("unparseable files", () => {
		test("returns null for completely unparseable filenames", () => {
			const result = extractHints("/library/books/abc123.epub", "ebook");
			expect(result).toBeNull();
		});

		test("returns null for short paths with no usable filename hint", () => {
			const result = extractHints("/a.epub", "ebook");
			expect(result).toBeNull();
		});
	});

	describe("path edge cases", () => {
		test("does not invent an author when the ebook path has only a title directory", () => {
			const result = extractHints("/The Shining (1977)/book.epub", "ebook");
			expect(result).toEqual({
				title: "The Shining",
				year: 1977,
				source: "path",
			});
		});

		test("returns null for tv season directories without a show name", () => {
			const result = extractHints("/Season 01/episode.mkv", "tv");
			expect(result).toBeNull();
		});

		test("returns null for movie paths that do not match a title-year directory", () => {
			const result = extractHints(
				"/media/movies/Dune Part Two/movie.mkv",
				"movie",
			);
			expect(result).toBeNull();
		});
	});
});
