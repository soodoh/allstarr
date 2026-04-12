import { describe, expect, it, vi } from "vitest";

vi.mock("./settings-reader", () => ({
	default: vi.fn(),
}));

import {
	buildBookAuthorFolderName,
	buildBookFolderName,
	buildBookFolderNames,
} from "./book-paths";
import getMediaSetting from "./settings-reader";

describe("buildBookFolderNames", () => {
	it("interpolates direct-import author folders with book-aware vars", () => {
		vi.mocked(getMediaSetting).mockImplementation(
			(key: string, defaultValue) => {
				if (key === "naming.book.ebook.authorFolder") {
					return "{Author Name} - {Book Title} ({Release Year})";
				}
				return defaultValue;
			},
		);

		expect(
			buildBookAuthorFolderName({
				mediaType: "ebook",
				authorName: "Mary Shelley",
				bookTitle: "Frankenstein",
				releaseYear: 1818,
			}),
		).toBe("Mary Shelley - Frankenstein (1818)");
	});

	it("resolves unused direct-import author-folder placeholders to empty strings", () => {
		vi.mocked(getMediaSetting).mockImplementation(
			(key: string, defaultValue) => {
				if (key === "naming.book.ebook.authorFolder") {
					return "{Author Name} - {Book Series} - {PartNumber}";
				}
				return defaultValue;
			},
		);

		expect(
			buildBookAuthorFolderName({
				mediaType: "ebook",
				authorName: "Mary Shelley",
				bookTitle: "Frankenstein",
				releaseYear: 1818,
			}),
		).toBe("Mary Shelley -  -");
	});

	it("keeps the default book folder stable when release year is missing", () => {
		vi.mocked(getMediaSetting).mockImplementation(
			(_key: string, defaultValue: unknown) => defaultValue,
		);

		expect(
			buildBookFolderName({
				mediaType: "ebook",
				authorName: "Octavia E. Butler",
				bookTitle: "Kindred",
				releaseYear: undefined,
			}),
		).toBe("Kindred ()");
	});

	it("uses custom audio naming templates", () => {
		vi.mocked(getMediaSetting).mockImplementation(
			(key: string, defaultValue) => {
				if (key === "naming.book.audio.authorFolder") {
					return "Audio - {Author Name}";
				}
				if (key === "naming.book.audio.bookFolder") {
					return "{Book Title} / {Release Year}";
				}
				return defaultValue;
			},
		);

		expect(
			buildBookFolderNames({
				mediaType: "audio",
				authorName: "Ann Leckie",
				bookTitle: "Ancillary Justice",
				releaseYear: 2013,
			}),
		).toEqual({
			authorFolderName: "Audio - Ann Leckie",
			bookFolderName: "Ancillary Justice _ 2013",
		});
	});

	it("uses author-only vars only when explicitly requested", () => {
		vi.mocked(getMediaSetting).mockImplementation(
			(key: string, defaultValue) => {
				if (key === "naming.book.audio.authorFolder") {
					return "Pack - {Author Name} - {Book Title}";
				}
				return defaultValue;
			},
		);

		expect(
			buildBookAuthorFolderName({
				mediaType: "audio",
				authorName: "Ann Leckie",
				bookTitle: "Ancillary Justice",
				releaseYear: 2013,
				authorFolderVarsMode: "author-only",
			}),
		).toBe("Pack - Ann Leckie -");
	});
});
