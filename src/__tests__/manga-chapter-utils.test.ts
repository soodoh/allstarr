import { describe, it, expect } from "vitest";
import {
  normalizeChapterNumber,
  expandChapterRange,
  isNumericChapter,
  parseChapterNumber,
} from "src/server/manga-chapter-utils";

describe("normalizeChapterNumber", () => {
  it("strips trailing v2 suffix", () => {
    expect(normalizeChapterNumber("585v2")).toBe("585");
  });

  it("strips trailing v3 suffix", () => {
    expect(normalizeChapterNumber("590v3")).toBe("590");
  });

  it("strips trailing space-v2 suffix", () => {
    expect(normalizeChapterNumber("592 v2")).toBe("592");
  });

  it("strips parenthesized version suffix", () => {
    expect(normalizeChapterNumber("717-721 (v2)")).toBe("717-721");
  });

  it("strips parenthesized HQ suffix", () => {
    expect(normalizeChapterNumber("420-430 (HQ)")).toBe("420-430");
  });

  it("strips trailing space HQ suffix", () => {
    expect(normalizeChapterNumber("378-388 HQ")).toBe("378-388");
  });

  it("leaves plain numeric chapters alone", () => {
    expect(normalizeChapterNumber("695")).toBe("695");
  });

  it("leaves decimal chapters alone", () => {
    expect(normalizeChapterNumber("10.5")).toBe("10.5");
  });

  it("leaves non-numeric specials alone", () => {
    expect(normalizeChapterNumber("Chopper Man")).toBe("Chopper Man");
  });

  it("leaves plain ranges alone", () => {
    expect(normalizeChapterNumber("695-696")).toBe("695-696");
  });

  it("trims whitespace", () => {
    expect(normalizeChapterNumber("  585  ")).toBe("585");
  });
});

describe("isNumericChapter", () => {
  it("returns true for integer strings", () => {
    expect(isNumericChapter("695")).toBe(true);
  });

  it("returns true for decimal strings", () => {
    expect(isNumericChapter("10.5")).toBe(true);
  });

  it("returns false for non-numeric strings", () => {
    expect(isNumericChapter("Chopper Man")).toBe(false);
  });

  it("returns false for ranges", () => {
    expect(isNumericChapter("695-696")).toBe(false);
  });
});

describe("parseChapterNumber", () => {
  it("parses integer strings", () => {
    expect(parseChapterNumber("695")).toBe(695);
  });

  it("parses decimal strings", () => {
    expect(parseChapterNumber("10.5")).toBe(10.5);
  });

  it("returns null for non-numeric strings", () => {
    expect(parseChapterNumber("Chopper Man")).toBeNull();
  });
});

describe("expandChapterRange", () => {
  it("expands a simple two-chapter range", () => {
    expect(expandChapterRange("695-696")).toStrictEqual([695, 696]);
  });

  it("expands a multi-chapter range", () => {
    expect(expandChapterRange("1-6")).toStrictEqual([1, 2, 3, 4, 5, 6]);
  });

  it("returns null for non-range strings", () => {
    expect(expandChapterRange("695")).toBeNull();
  });

  it("returns null for non-numeric specials", () => {
    expect(expandChapterRange("Chopper Man")).toBeNull();
  });

  it("returns null for compound entries with plus signs", () => {
    expect(expandChapterRange("775v2 + 790-792")).toBeNull();
  });

  it("returns null for single-number input", () => {
    expect(expandChapterRange("42")).toBeNull();
  });

  it("handles ranges where start equals end", () => {
    expect(expandChapterRange("5-5")).toStrictEqual([5]);
  });
});
