import { describe, it, expect } from "vitest";
import {
  extractGraphicNovelListBlocks,
  extractVolumeNumber,
  extractFirstChapterNumber,
  extractSubpageLinks,
  extractVolumesFromWikitext,
  deriveVolumeRanges,
  applyWikipediaVolumeMappings,
} from "src/server/wikipedia";

// ─── Fixtures ─────────────────────────────────────────────────────────────

const CHAINSAW_MAN_WIKITEXT = `{{Graphic novel list/header
| Language = Japanese
| Width = 50%
}}
{{Graphic novel list
| VolumeNumber = 1
| OriginalRelDate = March 4, 2019
| OriginalISBN = 978-4-08-881773-5
| ChapterList = {{Numbered list|start=1|"Dog & Chainsaw"|"The Place Where Pochita Is"|"Arrival in Tokyo"|"Power"}}
| ChapterListCol2 = {{Numbered list|start=5|"A Way to Touch Some Boobs"|"Service"|"Meowy's Whereabouts"}}
}}
{{Graphic novel list
| VolumeNumber = 2
| OriginalRelDate = May 2, 2019
| OriginalISBN = 978-4-08-881813-8
| ChapterList = {{Numbered list|start=8|"Gunfire"|"Rescue"|"Kon"|"Compromise"}}
| ChapterListCol2 = {{Numbered list|start=12|"Squeeze"|"Gun Devil"|"Emergency Exit"|"The First Devil Hunter"}}
}}
{{Graphic novel list
| VolumeNumber = 3
| OriginalRelDate = August 2, 2019
| ChapterList = {{Numbered list|start=17|"Kill Denji"|"Chainsaw vs. Bat"}}
}}
{{Graphic novel list/footer}}`;

const NARUTO_WIKITEXT = `{{Graphic novel list/header
| Language = Japanese
}}
{{Graphic novel list
| VolumeNumber = 1
| OriginalRelDate = March 3, 2000
| ChapterList =
# <li value="1"> "Uzumaki Naruto!!"
# "Konohamaru!!"
# "Sasuke Uchiha!!"
# "Hatake Kakashi!!"
# "Unpreparedness is One's Greatest Enemy!!"
# "Not Sasuke!!"
# "Kakashi's Conclusion"
}}
{{Graphic novel list
| VolumeNumber = 2
| OriginalRelDate = June 2, 2000
| ChapterList =
# <li value="8"> "And That's Why You're Disqualified!!"
# "The Worst Client"
# "The Second Critter"
# "Vows...!!"
# "Haku's Disposal!!"
# "Precious Person...!!"
# "He Who Couldn't Be"
# "In the Midst of Despair...!!"
# "Starting to Bloom...!!"
}}
{{Graphic novel list/footer}}`;

const BLEACH_WIKITEXT = `{{Graphic novel list/header
| Language = Japanese
}}
{{Graphic novel list
| VolumeNumber = 1
| OriginalRelDate = January 5, 2002
| ChapterList =
* 1. "Death & Strawberry"
* 2. "Starter"
* 3. "Headhittin'"
* 4. "Why do you eat it?"
* 5. "Binda Blinda"
* 6. "Microcrack."
* 7. "The Pink Cheeked Parakeet"
}}
{{Graphic novel list
| VolumeNumber = 2
| OriginalRelDate = April 4, 2002
| ChapterList =
* 8. "Chasing Chad"
* 9. "Monster and a Transfer (and Allergy to Perverts)"
* 10. "Monster and a Transfer, pt. 2 (The Deathberry)"
}}
{{Graphic novel list/footer}}`;

const SUBPAGE_WIKITEXT = `This article covers chapters 1 to 200.
{{further|List of One Piece chapters (187-396)}}
{{main|List of One Piece chapters (397-594)}}

{{Graphic novel list
| VolumeNumber = 1
| ChapterList = {{Numbered list|start=1|"Romance Dawn"}}
}}`;

// ─── extractGraphicNovelListBlocks ────────────────────────────────────────

describe("extractGraphicNovelListBlocks", () => {
  it("extracts all volume blocks from Chainsaw Man wikitext", () => {
    const blocks = extractGraphicNovelListBlocks(CHAINSAW_MAN_WIKITEXT);
    expect(blocks).toHaveLength(3);
  });

  it("skips the header block", () => {
    const blocks = extractGraphicNovelListBlocks(CHAINSAW_MAN_WIKITEXT);
    for (const block of blocks) {
      expect(block).not.toContain("Graphic novel list/header");
    }
  });

  it("skips the footer block", () => {
    const blocks = extractGraphicNovelListBlocks(CHAINSAW_MAN_WIKITEXT);
    for (const block of blocks) {
      expect(block).not.toContain("Graphic novel list/footer");
    }
  });

  it("each block starts with {{Graphic novel list", () => {
    const blocks = extractGraphicNovelListBlocks(CHAINSAW_MAN_WIKITEXT);
    for (const block of blocks) {
      expect(block).toMatch(/^\{\{Graphic novel list/i);
    }
  });

  it("handles Naruto-style wikitext (li value format)", () => {
    const blocks = extractGraphicNovelListBlocks(NARUTO_WIKITEXT);
    expect(blocks).toHaveLength(2);
  });

  it("handles Bleach-style wikitext (bullet list format)", () => {
    const blocks = extractGraphicNovelListBlocks(BLEACH_WIKITEXT);
    expect(blocks).toHaveLength(2);
  });

  it("returns empty array for empty string", () => {
    const blocks = extractGraphicNovelListBlocks("");
    expect(blocks).toStrictEqual([]);
  });

  it("returns empty array when no Graphic novel list blocks present", () => {
    const blocks = extractGraphicNovelListBlocks(
      "{{some other template | foo = bar}}",
    );
    expect(blocks).toStrictEqual([]);
  });

  it("correctly captures nested templates inside a block", () => {
    const blocks = extractGraphicNovelListBlocks(CHAINSAW_MAN_WIKITEXT);
    expect(blocks[0]).toContain("{{Numbered list");
  });
});

// ─── extractVolumeNumber ──────────────────────────────────────────────────

describe("extractVolumeNumber", () => {
  it("extracts volume number 1", () => {
    const blocks = extractGraphicNovelListBlocks(CHAINSAW_MAN_WIKITEXT);
    expect(extractVolumeNumber(blocks[0])).toBe(1);
  });

  it("extracts volume number 2", () => {
    const blocks = extractGraphicNovelListBlocks(CHAINSAW_MAN_WIKITEXT);
    expect(extractVolumeNumber(blocks[1])).toBe(2);
  });

  it("extracts volume number 3", () => {
    const blocks = extractGraphicNovelListBlocks(CHAINSAW_MAN_WIKITEXT);
    expect(extractVolumeNumber(blocks[2])).toBe(3);
  });

  it("returns null when VolumeNumber field is absent", () => {
    const block = `{{Graphic novel list
| OriginalRelDate = March 4, 2019
| ChapterList = {{Numbered list|start=1|"Chapter One"}}
}}`;
    expect(extractVolumeNumber(block)).toBeNull();
  });

  it("handles whitespace around the equals sign", () => {
    const block = `{{Graphic novel list
| VolumeNumber  =  5
| ChapterList = stuff
}}`;
    expect(extractVolumeNumber(block)).toBe(5);
  });
});

// ─── extractFirstChapterNumber ────────────────────────────────────────────

describe("extractFirstChapterNumber", () => {
  it("extracts from {{Numbered list|start=1}} (Chainsaw Man vol 1)", () => {
    const blocks = extractGraphicNovelListBlocks(CHAINSAW_MAN_WIKITEXT);
    expect(extractFirstChapterNumber(blocks[0])).toBe(1);
  });

  it("extracts from {{Numbered list|start=8}} (Chainsaw Man vol 2)", () => {
    const blocks = extractGraphicNovelListBlocks(CHAINSAW_MAN_WIKITEXT);
    expect(extractFirstChapterNumber(blocks[1])).toBe(8);
  });

  it("extracts from {{Numbered list|start=17}} (Chainsaw Man vol 3)", () => {
    const blocks = extractGraphicNovelListBlocks(CHAINSAW_MAN_WIKITEXT);
    expect(extractFirstChapterNumber(blocks[2])).toBe(17);
  });

  it("extracts from <li value=1> (Naruto vol 1)", () => {
    const blocks = extractGraphicNovelListBlocks(NARUTO_WIKITEXT);
    expect(extractFirstChapterNumber(blocks[0])).toBe(1);
  });

  it("extracts from <li value=8> (Naruto vol 2)", () => {
    const blocks = extractGraphicNovelListBlocks(NARUTO_WIKITEXT);
    expect(extractFirstChapterNumber(blocks[1])).toBe(8);
  });

  it("extracts from bullet list '* 1.' (Bleach vol 1)", () => {
    const blocks = extractGraphicNovelListBlocks(BLEACH_WIKITEXT);
    expect(extractFirstChapterNumber(blocks[0])).toBe(1);
  });

  it("extracts from bullet list '* 8.' (Bleach vol 2)", () => {
    const blocks = extractGraphicNovelListBlocks(BLEACH_WIKITEXT);
    expect(extractFirstChapterNumber(blocks[1])).toBe(8);
  });

  it("returns null when no chapter number pattern is found", () => {
    const block = `{{Graphic novel list
| VolumeNumber = 1
| OriginalRelDate = January 1, 2000
| ChapterList = Just some prose with no chapter numbers.
}}`;
    expect(extractFirstChapterNumber(block)).toBeNull();
  });

  it("extracts from Mission: X pattern", () => {
    const block = `{{Graphic novel list
| VolumeNumber = 1
| ChapterList =
Mission: 5 "Title"
}}`;
    expect(extractFirstChapterNumber(block)).toBe(5);
  });

  it("extracts from Chapter: X pattern", () => {
    const block = `{{Graphic novel list
| VolumeNumber = 1
| ChapterList =
Chapter: 12 "Title"
}}`;
    expect(extractFirstChapterNumber(block)).toBe(12);
  });
});

// ─── extractSubpageLinks ──────────────────────────────────────────────────

describe("extractSubpageLinks", () => {
  it("extracts {{further|...}} links", () => {
    const links = extractSubpageLinks(SUBPAGE_WIKITEXT);
    expect(links).toContain("List of One Piece chapters (187-396)");
  });

  it("extracts {{main|...}} links", () => {
    const links = extractSubpageLinks(SUBPAGE_WIKITEXT);
    expect(links).toContain("List of One Piece chapters (397-594)");
  });

  it("returns both links from the subpage fixture", () => {
    const links = extractSubpageLinks(SUBPAGE_WIKITEXT);
    expect(links).toHaveLength(2);
  });

  it("returns empty array when no subpage templates are present", () => {
    const links = extractSubpageLinks(CHAINSAW_MAN_WIKITEXT);
    expect(links).toStrictEqual([]);
  });

  it("returns empty array for empty string", () => {
    const links = extractSubpageLinks("");
    expect(links).toStrictEqual([]);
  });
});

// ─── extractVolumesFromWikitext ───────────────────────────────────────────

describe("extractVolumesFromWikitext", () => {
  it("returns 3 volumes for Chainsaw Man", () => {
    const volumes = extractVolumesFromWikitext(CHAINSAW_MAN_WIKITEXT);
    expect(volumes).toHaveLength(3);
  });

  it("Chainsaw Man vol 1: volumeNumber=1, firstChapter=1", () => {
    const volumes = extractVolumesFromWikitext(CHAINSAW_MAN_WIKITEXT);
    expect(volumes[0]).toStrictEqual({ volumeNumber: 1, firstChapter: 1 });
  });

  it("Chainsaw Man vol 2: volumeNumber=2, firstChapter=8", () => {
    const volumes = extractVolumesFromWikitext(CHAINSAW_MAN_WIKITEXT);
    expect(volumes[1]).toStrictEqual({ volumeNumber: 2, firstChapter: 8 });
  });

  it("Chainsaw Man vol 3: volumeNumber=3, firstChapter=17", () => {
    const volumes = extractVolumesFromWikitext(CHAINSAW_MAN_WIKITEXT);
    expect(volumes[2]).toStrictEqual({ volumeNumber: 3, firstChapter: 17 });
  });

  it("returns 2 volumes for Naruto", () => {
    const volumes = extractVolumesFromWikitext(NARUTO_WIKITEXT);
    expect(volumes).toHaveLength(2);
  });

  it("Naruto vol 1: volumeNumber=1, firstChapter=1", () => {
    const volumes = extractVolumesFromWikitext(NARUTO_WIKITEXT);
    expect(volumes[0]).toStrictEqual({ volumeNumber: 1, firstChapter: 1 });
  });

  it("Naruto vol 2: volumeNumber=2, firstChapter=8", () => {
    const volumes = extractVolumesFromWikitext(NARUTO_WIKITEXT);
    expect(volumes[1]).toStrictEqual({ volumeNumber: 2, firstChapter: 8 });
  });

  it("returns 2 volumes for Bleach", () => {
    const volumes = extractVolumesFromWikitext(BLEACH_WIKITEXT);
    expect(volumes).toHaveLength(2);
  });

  it("Bleach vol 1: volumeNumber=1, firstChapter=1", () => {
    const volumes = extractVolumesFromWikitext(BLEACH_WIKITEXT);
    expect(volumes[0]).toStrictEqual({ volumeNumber: 1, firstChapter: 1 });
  });

  it("Bleach vol 2: volumeNumber=2, firstChapter=8", () => {
    const volumes = extractVolumesFromWikitext(BLEACH_WIKITEXT);
    expect(volumes[1]).toStrictEqual({ volumeNumber: 2, firstChapter: 8 });
  });

  it("returns empty array for empty string", () => {
    const volumes = extractVolumesFromWikitext("");
    expect(volumes).toStrictEqual([]);
  });
});

// ─── deriveVolumeRanges ───────────────────────────────────────────────────

describe("deriveVolumeRanges", () => {
  it("returns empty array for empty input", () => {
    const ranges = deriveVolumeRanges([]);
    expect(ranges).toStrictEqual([]);
  });

  it("returns empty array when all volumes have null firstChapter", () => {
    const ranges = deriveVolumeRanges([
      { volumeNumber: 1, firstChapter: null },
      { volumeNumber: 2, firstChapter: null },
    ]);
    expect(ranges).toStrictEqual([]);
  });

  it("derives correct ranges for consecutive volumes", () => {
    const volumes = [
      { volumeNumber: 1, firstChapter: 1 },
      { volumeNumber: 2, firstChapter: 8 },
      { volumeNumber: 3, firstChapter: 17 },
    ];
    const ranges = deriveVolumeRanges(volumes);
    expect(ranges[0]).toStrictEqual({
      volumeNumber: 1,
      firstChapter: 1,
      lastChapter: 7,
    });
    expect(ranges[1]).toStrictEqual({
      volumeNumber: 2,
      firstChapter: 8,
      lastChapter: 16,
    });
  });

  it("uses latestChapter for the final volume's lastChapter", () => {
    const volumes = [
      { volumeNumber: 1, firstChapter: 1 },
      { volumeNumber: 2, firstChapter: 8 },
    ];
    const ranges = deriveVolumeRanges(volumes, 20);
    expect(ranges[1]).toStrictEqual({
      volumeNumber: 2,
      firstChapter: 8,
      lastChapter: 20,
    });
  });

  it("uses firstChapter as lastChapter for a single-volume list without latestChapter", () => {
    const volumes = [{ volumeNumber: 1, firstChapter: 1 }];
    const ranges = deriveVolumeRanges(volumes);
    expect(ranges[0]).toStrictEqual({
      volumeNumber: 1,
      firstChapter: 1,
      lastChapter: 1,
    });
  });

  it("uses latestChapter for single-volume list", () => {
    const volumes = [{ volumeNumber: 1, firstChapter: 1 }];
    const ranges = deriveVolumeRanges(volumes, 100);
    expect(ranges[0]).toStrictEqual({
      volumeNumber: 1,
      firstChapter: 1,
      lastChapter: 100,
    });
  });

  it("skips volumes with null firstChapter and uses adjacent known chapters for ranges", () => {
    const volumes = [
      { volumeNumber: 1, firstChapter: 1 },
      { volumeNumber: 2, firstChapter: null },
      { volumeNumber: 3, firstChapter: 17 },
    ];
    const ranges = deriveVolumeRanges(volumes, 30);
    // Vol 2 is skipped; vol 1 last = vol 3 first - 1 = 16
    expect(ranges).toHaveLength(2);
    expect(ranges[0]).toStrictEqual({
      volumeNumber: 1,
      firstChapter: 1,
      lastChapter: 16,
    });
    expect(ranges[1]).toStrictEqual({
      volumeNumber: 3,
      firstChapter: 17,
      lastChapter: 30,
    });
  });

  it("produces 3 ranges from Chainsaw Man volumes with latestChapter=97", () => {
    const volumes = extractVolumesFromWikitext(CHAINSAW_MAN_WIKITEXT);
    const ranges = deriveVolumeRanges(volumes, 97);
    expect(ranges).toHaveLength(3);
    expect(ranges[2]).toMatchObject({ volumeNumber: 3, lastChapter: 97 });
  });
});

// ─── applyWikipediaVolumeMappings ─────────────────────────────────────────

describe("applyWikipediaVolumeMappings", () => {
  const mappings = [
    { volumeNumber: 1, firstChapter: 1, lastChapter: 7 },
    { volumeNumber: 2, firstChapter: 8, lastChapter: 16 },
    { volumeNumber: 3, firstChapter: 17, lastChapter: 97 },
  ];

  it("assigns volume 1 to chapter 1", () => {
    const chapters = [{ chapterNumber: "1", volumeNumber: null }];
    const result = applyWikipediaVolumeMappings(chapters, mappings);
    expect(result[0].volumeNumber).toBe("1");
  });

  it("assigns volume 1 to chapter 7", () => {
    const chapters = [{ chapterNumber: "7", volumeNumber: null }];
    const result = applyWikipediaVolumeMappings(chapters, mappings);
    expect(result[0].volumeNumber).toBe("1");
  });

  it("assigns volume 2 to chapter 8", () => {
    const chapters = [{ chapterNumber: "8", volumeNumber: null }];
    const result = applyWikipediaVolumeMappings(chapters, mappings);
    expect(result[0].volumeNumber).toBe("2");
  });

  it("assigns volume 3 to chapter 17", () => {
    const chapters = [{ chapterNumber: "17", volumeNumber: null }];
    const result = applyWikipediaVolumeMappings(chapters, mappings);
    expect(result[0].volumeNumber).toBe("3");
  });

  it("overrides an existing non-null volumeNumber", () => {
    const chapters = [{ chapterNumber: "8", volumeNumber: "99" }];
    const result = applyWikipediaVolumeMappings(chapters, mappings);
    expect(result[0].volumeNumber).toBe("2");
  });

  it("leaves non-numeric chapter numbers ungrouped", () => {
    const chapters = [{ chapterNumber: "Bonus", volumeNumber: null }];
    const result = applyWikipediaVolumeMappings(chapters, mappings);
    expect(result[0].volumeNumber).toBeNull();
  });

  it("leaves chapters outside all ranges unchanged", () => {
    const chapters = [{ chapterNumber: "200", volumeNumber: null }];
    const result = applyWikipediaVolumeMappings(chapters, mappings);
    expect(result[0].volumeNumber).toBeNull();
  });

  it("handles decimal chapter numbers (e.g. 8.5 goes in vol 2)", () => {
    const chapters = [{ chapterNumber: "8.5", volumeNumber: null }];
    const result = applyWikipediaVolumeMappings(chapters, mappings);
    expect(result[0].volumeNumber).toBe("2");
  });

  it("does not mutate the input array", () => {
    const chapters = [{ chapterNumber: "1", volumeNumber: null }];
    const original = { ...chapters[0] };
    applyWikipediaVolumeMappings(chapters, mappings);
    expect(chapters[0]).toStrictEqual(original);
  });

  it("does not mutate individual chapter objects", () => {
    const chapter = { chapterNumber: "1", volumeNumber: null };
    const chapters = [chapter];
    applyWikipediaVolumeMappings(chapters, mappings);
    expect(chapter.volumeNumber).toBeNull();
  });

  it("returns a new array (not the same reference)", () => {
    const chapters = [{ chapterNumber: "1", volumeNumber: null }];
    const result = applyWikipediaVolumeMappings(chapters, mappings);
    expect(result).not.toBe(chapters);
  });

  it("returns copies of chapters when mappings is empty", () => {
    const chapters = [{ chapterNumber: "1", volumeNumber: "5" }];
    const result = applyWikipediaVolumeMappings(chapters, []);
    expect(result[0].volumeNumber).toBe("5");
    expect(result).not.toBe(chapters);
  });

  it("preserves extra fields on chapter objects", () => {
    const chapters = [
      { chapterNumber: "1", volumeNumber: null, title: "First Chapter" },
    ];
    const result = applyWikipediaVolumeMappings(chapters, mappings);
    expect(result[0]).toMatchObject({ title: "First Chapter" });
  });
});
