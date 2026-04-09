import { describe, expect, it } from "vitest";
import {
	extractContributorNames,
	extractCountry,
	extractFormat,
	extractLanguage,
	extractPublisher,
	firstId,
	firstNumber,
	firstString,
	getCoverUrl,
	getStringList,
	normalizeLanguageCode,
	parseYear,
	toRecord,
	toRecordArray,
} from "./record-helpers";

// ---------------------------------------------------------------------------
// toRecord
// ---------------------------------------------------------------------------
describe("toRecord", () => {
	it("should return a plain object as-is", () => {
		const obj = { a: 1 };
		expect(toRecord(obj)).toBe(obj);
	});

	it("should return undefined for null", () => {
		expect(toRecord(null)).toBeUndefined();
	});

	it("should return undefined for undefined", () => {
		expect(toRecord(undefined)).toBeUndefined();
	});

	it("should return undefined for arrays", () => {
		expect(toRecord([1, 2])).toBeUndefined();
	});

	it("should return undefined for primitives", () => {
		expect(toRecord("hello")).toBeUndefined();
		expect(toRecord(42)).toBeUndefined();
		expect(toRecord(true)).toBeUndefined();
	});

	it("should accept an empty object", () => {
		const obj = {};
		expect(toRecord(obj)).toBe(obj);
	});
});

// ---------------------------------------------------------------------------
// toRecordArray
// ---------------------------------------------------------------------------
describe("toRecordArray", () => {
	it("should return an empty array for non-array input", () => {
		expect(toRecordArray("hello")).toEqual([]);
		expect(toRecordArray(42)).toEqual([]);
		expect(toRecordArray(null)).toEqual([]);
		expect(toRecordArray(undefined)).toEqual([]);
	});

	it("should filter out non-object entries", () => {
		const result = toRecordArray([{ a: 1 }, "string", 42, null, { b: 2 }]);
		expect(result).toEqual([{ a: 1 }, { b: 2 }]);
	});

	it("should return all entries when all are objects", () => {
		const result = toRecordArray([{ x: 1 }, { y: 2 }]);
		expect(result).toEqual([{ x: 1 }, { y: 2 }]);
	});

	it("should return empty array for an array of primitives", () => {
		expect(toRecordArray([1, "a", true])).toEqual([]);
	});

	it("should return empty array for an empty array", () => {
		expect(toRecordArray([])).toEqual([]);
	});
});

// ---------------------------------------------------------------------------
// firstString
// ---------------------------------------------------------------------------
describe("firstString", () => {
	it("should return the first matching string value", () => {
		const record = { title: "Hello", name: "World" };
		expect(firstString(record, [["title"]])).toBe("Hello");
	});

	it("should skip non-string values and return the first string", () => {
		const record = { count: 42, label: "Found" };
		expect(firstString(record, [["count"], ["label"]])).toBe("Found");
	});

	it("should skip empty and whitespace-only strings", () => {
		const record = { a: "", b: "   ", c: "valid" };
		expect(firstString(record, [["a"], ["b"], ["c"]])).toBe("valid");
	});

	it("should trim the result", () => {
		const record = { name: "  padded  " };
		expect(firstString(record, [["name"]])).toBe("padded");
	});

	it("should return undefined when no path matches", () => {
		const record = { x: 1 };
		expect(firstString(record, [["y"]])).toBeUndefined();
	});

	it("should traverse nested paths", () => {
		const record = { image: { url: "https://example.com/img.jpg" } };
		expect(firstString(record, [["image", "url"]])).toBe(
			"https://example.com/img.jpg",
		);
	});

	it("should return undefined for deeply nested missing path", () => {
		const record = { a: { b: { c: "deep" } } };
		expect(firstString(record, [["a", "b", "missing"]])).toBeUndefined();
	});

	it("should return undefined for empty paths list", () => {
		const record = { x: "hello" };
		expect(firstString(record, [])).toBeUndefined();
	});

	it("should handle nested path where intermediate is not an object", () => {
		const record = { a: "not-an-object" };
		expect(firstString(record, [["a", "b"]])).toBeUndefined();
	});
});

// ---------------------------------------------------------------------------
// firstNumber
// ---------------------------------------------------------------------------
describe("firstNumber", () => {
	it("should return the first matching number", () => {
		const record = { count: 42 };
		expect(firstNumber(record, [["count"]])).toBe(42);
	});

	it("should parse string numbers", () => {
		const record = { year: "2024" };
		expect(firstNumber(record, [["year"]])).toBe(2024);
	});

	it("should skip NaN and Infinity", () => {
		const record = { a: Number.NaN, b: Number.POSITIVE_INFINITY, c: 7 };
		expect(firstNumber(record, [["a"], ["b"], ["c"]])).toBe(7);
	});

	it("should skip non-numeric strings", () => {
		const record = { a: "hello", b: 5 };
		expect(firstNumber(record, [["a"], ["b"]])).toBe(5);
	});

	it("should return undefined when nothing matches", () => {
		const record = { a: "text", b: null };
		expect(firstNumber(record, [["a"], ["b"]])).toBeUndefined();
	});

	it("should return 0 as a valid number", () => {
		const record = { val: 0 };
		expect(firstNumber(record, [["val"]])).toBe(0);
	});

	it("should parse negative number strings", () => {
		const record = { val: "-3" };
		expect(firstNumber(record, [["val"]])).toBe(-3);
	});

	it("should parse float strings", () => {
		const record = { rating: "4.5" };
		expect(firstNumber(record, [["rating"]])).toBe(4.5);
	});

	it("should handle nested paths", () => {
		const record = { stats: { pages: 300 } };
		expect(firstNumber(record, [["stats", "pages"]])).toBe(300);
	});

	it("should parse empty string as 0", () => {
		const record = { a: "", b: 10 };
		expect(firstNumber(record, [["a"], ["b"]])).toBe(0);
	});
});

// ---------------------------------------------------------------------------
// firstId
// ---------------------------------------------------------------------------
describe("firstId", () => {
	it("should return a string id directly", () => {
		const record = { id: "abc-123" };
		expect(firstId(record, [["id"]])).toBe("abc-123");
	});

	it("should convert a numeric id to string", () => {
		const record = { id: 42 };
		expect(firstId(record, [["id"]])).toBe("42");
	});

	it("should prefer string over number when string path comes first", () => {
		const record = { slug: "my-book", id: 99 };
		expect(firstId(record, [["slug"], ["id"]])).toBe("my-book");
	});

	it("should fall back to number when string paths fail", () => {
		const record = { id: 7, name: "" };
		// firstString skips empty "", then firstNumber parses "" as 0
		expect(firstId(record, [["name"], ["id"]])).toBe("0");
	});

	it("should return undefined when nothing matches", () => {
		const record = { x: null };
		expect(firstId(record, [["id"]])).toBeUndefined();
	});

	it("should handle string-encoded numbers via firstNumber fallback", () => {
		// firstString would return "42" directly since it's a non-empty string
		const record = { id: "42" };
		expect(firstId(record, [["id"]])).toBe("42");
	});

	it("should return 0 id as string via number fallback", () => {
		const record = { id: 0 };
		// firstString won't match (0 is not a string), firstNumber returns 0
		expect(firstId(record, [["id"]])).toBe("0");
	});
});

// ---------------------------------------------------------------------------
// getCoverUrl
// ---------------------------------------------------------------------------
describe("getCoverUrl", () => {
	it("should extract url from image.url", () => {
		const record = { image: { url: "https://img.com/cover.jpg" } };
		expect(getCoverUrl(record)).toBe("https://img.com/cover.jpg");
	});

	it("should fall back to image.large", () => {
		const record = { image: { large: "https://img.com/large.jpg" } };
		expect(getCoverUrl(record)).toBe("https://img.com/large.jpg");
	});

	it("should fall back to image.medium", () => {
		const record = { image: { medium: "https://img.com/medium.jpg" } };
		expect(getCoverUrl(record)).toBe("https://img.com/medium.jpg");
	});

	it("should extract from images array", () => {
		const record = {
			images: [{ url: "https://img.com/first.jpg" }],
		};
		expect(getCoverUrl(record)).toBe("https://img.com/first.jpg");
	});

	it("should skip non-object entries in images array", () => {
		const record = {
			images: [null, "bad", { url: "https://img.com/good.jpg" }],
		};
		expect(getCoverUrl(record)).toBe("https://img.com/good.jpg");
	});

	it("should fall back to coverUrl field", () => {
		const record = { coverUrl: "https://img.com/fallback.jpg" };
		expect(getCoverUrl(record)).toBe("https://img.com/fallback.jpg");
	});

	it("should fall back to nested cover.url", () => {
		const record = { cover: { url: "https://img.com/nested.jpg" } };
		expect(getCoverUrl(record)).toBe("https://img.com/nested.jpg");
	});

	it("should return undefined when no cover is found", () => {
		const record = { title: "No Cover Book" };
		expect(getCoverUrl(record)).toBeUndefined();
	});

	it("should prefer image object over images array", () => {
		const record = {
			image: { url: "https://img.com/primary.jpg" },
			images: [{ url: "https://img.com/secondary.jpg" }],
		};
		expect(getCoverUrl(record)).toBe("https://img.com/primary.jpg");
	});

	it("should skip images entries without a url field", () => {
		const record = {
			images: [{ alt: "no url" }, { url: "https://img.com/found.jpg" }],
		};
		expect(getCoverUrl(record)).toBe("https://img.com/found.jpg");
	});
});

// ---------------------------------------------------------------------------
// getStringList
// ---------------------------------------------------------------------------
describe("getStringList", () => {
	it("should filter non-string entries from an array", () => {
		expect(getStringList(["a", 1, "b", null, "c"])).toEqual(["a", "b", "c"]);
	});

	it("should trim strings and remove empty ones", () => {
		expect(getStringList(["  hello  ", "", "  ", "world"])).toEqual([
			"hello",
			"world",
		]);
	});

	it("should return empty array for non-array input", () => {
		expect(getStringList("hello")).toEqual([]);
		expect(getStringList(null)).toEqual([]);
		expect(getStringList(undefined)).toEqual([]);
		expect(getStringList(42)).toEqual([]);
	});

	it("should return empty array for empty array", () => {
		expect(getStringList([])).toEqual([]);
	});
});

// ---------------------------------------------------------------------------
// parseYear
// ---------------------------------------------------------------------------
describe("parseYear", () => {
	it("should extract a 4-digit year from a date string", () => {
		expect(parseYear("2024-01-15")).toBe(2024);
	});

	it("should extract year from a longer string", () => {
		expect(parseYear("Published in 1984 by...")).toBe(1984);
	});

	it("should return first 4-digit number in the string", () => {
		expect(parseYear("From 2001 to 2020")).toBe(2001);
	});

	it("should return undefined for no 4-digit number", () => {
		expect(parseYear("abc")).toBeUndefined();
		expect(parseYear("12")).toBeUndefined();
		expect(parseYear("")).toBeUndefined();
	});

	it("should return undefined for undefined input", () => {
		expect(parseYear(undefined)).toBeUndefined();
	});

	it("should handle a plain year string", () => {
		expect(parseYear("1999")).toBe(1999);
	});
});

// ---------------------------------------------------------------------------
// normalizeLanguageCode
// ---------------------------------------------------------------------------
describe("normalizeLanguageCode", () => {
	it("should lowercase and trim the value", () => {
		expect(normalizeLanguageCode("  EN  ")).toBe("en");
	});

	it("should return undefined for empty string", () => {
		expect(normalizeLanguageCode("")).toBeUndefined();
	});

	it("should return undefined for whitespace-only string", () => {
		expect(normalizeLanguageCode("   ")).toBeUndefined();
	});

	it("should return undefined for undefined", () => {
		expect(normalizeLanguageCode(undefined)).toBeUndefined();
	});

	it("should handle already normalized codes", () => {
		expect(normalizeLanguageCode("en")).toBe("en");
		expect(normalizeLanguageCode("fra")).toBe("fra");
	});
});

// ---------------------------------------------------------------------------
// extractLanguage
// ---------------------------------------------------------------------------
describe("extractLanguage", () => {
	it("should extract code2 and language name", () => {
		const record = { language: { code2: "EN", language: "English" } };
		expect(extractLanguage(record)).toEqual({
			code: "en",
			name: "English",
		});
	});

	it("should fall back to code3 if code2 is missing", () => {
		const record = { language: { code3: "FRA", language: "French" } };
		expect(extractLanguage(record)).toEqual({
			code: "fra",
			name: "French",
		});
	});

	it("should return nulls when no language sub-object exists", () => {
		expect(extractLanguage({})).toEqual({ code: null, name: null });
	});

	it("should return null code when no code fields exist", () => {
		const record = { language: { language: "German" } };
		expect(extractLanguage(record)).toEqual({ code: null, name: "German" });
	});

	it("should return null name when language name is missing", () => {
		const record = { language: { code2: "es" } };
		expect(extractLanguage(record)).toEqual({ code: "es", name: null });
	});

	it("should handle language being a non-object", () => {
		const record = { language: "en" };
		expect(extractLanguage(record)).toEqual({ code: null, name: null });
	});
});

// ---------------------------------------------------------------------------
// extractPublisher
// ---------------------------------------------------------------------------
describe("extractPublisher", () => {
	it("should extract publisher name", () => {
		const record = { publisher: { name: "Penguin Books" } };
		expect(extractPublisher(record)).toBe("Penguin Books");
	});

	it("should return null when publisher is missing", () => {
		expect(extractPublisher({})).toBeNull();
	});

	it("should return null when publisher has no name", () => {
		const record = { publisher: { id: 42 } };
		expect(extractPublisher(record)).toBeNull();
	});

	it("should return null when publisher is not an object", () => {
		const record = { publisher: "string-publisher" };
		expect(extractPublisher(record)).toBeNull();
	});
});

// ---------------------------------------------------------------------------
// extractFormat
// ---------------------------------------------------------------------------
describe("extractFormat", () => {
	it("should extract format string", () => {
		const record = { reading_format: { format: "Hardcover" } };
		expect(extractFormat(record)).toBe("Hardcover");
	});

	it("should return null when reading_format is missing", () => {
		expect(extractFormat({})).toBeNull();
	});

	it("should return null when reading_format has no format field", () => {
		const record = { reading_format: { id: 1 } };
		expect(extractFormat(record)).toBeNull();
	});

	it("should return null when reading_format is not an object", () => {
		const record = { reading_format: "ebook" };
		expect(extractFormat(record)).toBeNull();
	});
});

// ---------------------------------------------------------------------------
// extractCountry
// ---------------------------------------------------------------------------
describe("extractCountry", () => {
	it("should extract country name", () => {
		const record = { country: { name: "United States" } };
		expect(extractCountry(record)).toBe("United States");
	});

	it("should return null when country is missing", () => {
		expect(extractCountry({})).toBeNull();
	});

	it("should return null when country has no name", () => {
		const record = { country: { code: "US" } };
		expect(extractCountry(record)).toBeNull();
	});

	it("should return null when country is not an object", () => {
		const record = { country: "USA" };
		expect(extractCountry(record)).toBeNull();
	});
});

// ---------------------------------------------------------------------------
// extractContributorNames
// ---------------------------------------------------------------------------
describe("extractContributorNames", () => {
	it("should extract author names from contributions array", () => {
		const items = [
			{ author: { name: "Author One" } },
			{ author: { name: "Author Two" } },
		];
		expect(extractContributorNames(items)).toEqual([
			"Author One",
			"Author Two",
		]);
	});

	it("should skip entries without author sub-object", () => {
		const items = [
			{ author: { name: "Valid" } },
			{ role: "Illustrator" },
			{ author: null },
		];
		expect(extractContributorNames(items)).toEqual(["Valid"]);
	});

	it("should skip entries where author has no name", () => {
		const items = [{ author: { name: "Good" } }, { author: { id: 42 } }];
		expect(extractContributorNames(items)).toEqual(["Good"]);
	});

	it("should return empty array for non-array input", () => {
		expect(extractContributorNames(null)).toEqual([]);
		expect(extractContributorNames(undefined)).toEqual([]);
		expect(extractContributorNames("not-array")).toEqual([]);
	});

	it("should return empty array for empty array", () => {
		expect(extractContributorNames([])).toEqual([]);
	});

	it("should filter out non-object entries in the array", () => {
		const items = ["string", 42, { author: { name: "Real Author" } }];
		expect(extractContributorNames(items)).toEqual(["Real Author"]);
	});
});
