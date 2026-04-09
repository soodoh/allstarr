import { describe, expect, it } from "vitest";
import {
	getDefaultColumnOrder,
	getDefaultHiddenColumns,
	TABLE_IDS,
} from "./table-column-defaults";

const EXPECTED_COLUMN_ORDERS = {
	authors: ["cover", "name", "bookCount", "totalReaders"],
	"author-books": [
		"monitored",
		"cover",
		"title",
		"series",
		"readers",
		"rating",
		"releaseDate",
		"format",
		"pages",
		"isbn10",
		"isbn13",
		"asin",
		"score",
		"author",
	],
	"author-series": [
		"monitored",
		"cover",
		"position",
		"title",
		"author",
		"readers",
		"rating",
		"releaseDate",
		"format",
		"pages",
		"isbn10",
		"isbn13",
		"asin",
		"score",
	],
	books: [
		"monitored",
		"cover",
		"title",
		"author",
		"series",
		"readers",
		"rating",
		"releaseDate",
	],
	"book-editions": [
		"cover",
		"title",
		"publisher",
		"format",
		"pages",
		"releaseDate",
		"language",
		"readers",
		"score",
		"information",
		"isbn13",
		"isbn10",
		"asin",
		"country",
	],
	tv: [
		"monitored",
		"cover",
		"title",
		"year",
		"network",
		"seasons",
		"episodes",
		"status",
	],
	movies: ["monitored", "cover", "title", "year", "studio", "status"],
} as const;

const EXPECTED_HIDDEN_COLUMNS = {
	authors: [],
	"author-books": [
		"format",
		"pages",
		"isbn10",
		"isbn13",
		"asin",
		"score",
		"author",
	],
	"author-series": ["format", "pages", "isbn10", "isbn13", "asin", "score"],
	books: [],
	"book-editions": ["information", "isbn13", "isbn10", "asin", "country"],
	tv: [],
	movies: [],
} as const;

describe("table column defaults", () => {
	it("returns a stable key order for every table id", () => {
		for (const tableId of TABLE_IDS) {
			expect(getDefaultColumnOrder(tableId)).toEqual(
				EXPECTED_COLUMN_ORDERS[tableId],
			);
		}
	});

	it("returns only non-locked hidden columns", () => {
		for (const tableId of TABLE_IDS) {
			expect(getDefaultHiddenColumns(tableId)).toEqual(
				EXPECTED_HIDDEN_COLUMNS[tableId],
			);
		}
	});
});
