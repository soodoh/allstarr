import { describe, it, expect } from "vitest";
import {
  extractGraphicNovelListBlocks,
  extractVolumeNumber,
  extractFirstChapterNumber,
  extractSubpageLinks,
  extractVolumesFromWikitext,
  deriveVolumeRanges,
  applyWikipediaVolumeMappings,
  pickBestSearchResult,
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

const WITCH_HAT_BLOCK = `{{Graphic novel list
| VolumeNumber = 1
| OriginalRelDate = July 23, 2018
| ChapterList =
* Chapters 1\u20135
}}`;

const WITCH_HAT_BLOCK_V2 = `{{Graphic novel list
| VolumeNumber = 2
| OriginalRelDate = November 22, 2018
| ChapterList =
* Chapters 6\u201311
* Bonus Chapter (1)
}}`;

const HUB_PAGE_WIKITEXT = `{{Short description|none}}
Below is a list of chapters.

==Lists of main series chapters==
* [[List of One Piece chapters (1\u2013186)|Chapters 1 to 186]]
* [[List of One Piece chapters (187\u2013388)|Chapters 187 to 388]]
* [[List of One Piece chapters (389\u2013594)|Chapters 389 to 594]]

==See also==
Some other content.`;

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

  it("extracts from '* Chapters X\u2013Y' format (Witch Hat Atelier vol 1)", () => {
    expect(extractFirstChapterNumber(WITCH_HAT_BLOCK)).toBe(1);
  });

  it("extracts from '* Chapters 6\u201311' (Witch Hat Atelier vol 2)", () => {
    expect(extractFirstChapterNumber(WITCH_HAT_BLOCK_V2)).toBe(6);
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

  it("extracts plain wikilinks matching chapter list subpage pattern", () => {
    const links = extractSubpageLinks(HUB_PAGE_WIKITEXT);
    expect(links).toContain("List of One Piece chapters (1\u2013186)");
    expect(links).toContain("List of One Piece chapters (187\u2013388)");
    expect(links).toContain("List of One Piece chapters (389\u2013594)");
  });

  it("extracts both {{further}} templates and plain wikilinks", () => {
    const combined = `${SUBPAGE_WIKITEXT}\n${HUB_PAGE_WIKITEXT}`;
    const links = extractSubpageLinks(combined);
    expect(links).toContain("List of One Piece chapters (187-396)");
    expect(links).toContain("List of One Piece chapters (1\u2013186)");
  });

  it("does not extract non-chapter-list wikilinks", () => {
    const wikitext = `See [[One Piece]] and [[List of One Piece characters]].`;
    const links = extractSubpageLinks(wikitext);
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

  it("does NOT use latestChapter for the final volume", () => {
    const volumes = [
      { volumeNumber: 1, firstChapter: 1 },
      { volumeNumber: 2, firstChapter: 8 },
    ];
    const ranges = deriveVolumeRanges(volumes, 20);
    expect(ranges[1]).toStrictEqual({
      volumeNumber: 2,
      firstChapter: 8,
      lastChapter: 8,
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

  it("does NOT extend single-volume range to latestChapter", () => {
    const volumes = [{ volumeNumber: 1, firstChapter: 1 }];
    const ranges = deriveVolumeRanges(volumes, 100);
    expect(ranges[0]).toStrictEqual({
      volumeNumber: 1,
      firstChapter: 1,
      lastChapter: 1,
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
    // Vol 3 is the final volume, lastChapter = firstChapter
    expect(ranges[1]).toStrictEqual({
      volumeNumber: 3,
      firstChapter: 17,
      lastChapter: 17,
    });
  });

  it("final Chainsaw Man volume does not extend to latestChapter", () => {
    const volumes = extractVolumesFromWikitext(CHAINSAW_MAN_WIKITEXT);
    const ranges = deriveVolumeRanges(volumes, 97);
    expect(ranges).toHaveLength(3);
    expect(ranges[2]).toMatchObject({
      volumeNumber: 3,
      firstChapter: 17,
      lastChapter: 17,
    });
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
    const chapters = [{ chapterNumber: "1", volume: null }];
    const result = applyWikipediaVolumeMappings(chapters, mappings);
    expect(result[0].volume).toBe("1");
  });

  it("assigns volume 1 to chapter 7", () => {
    const chapters = [{ chapterNumber: "7", volume: null }];
    const result = applyWikipediaVolumeMappings(chapters, mappings);
    expect(result[0].volume).toBe("1");
  });

  it("assigns volume 2 to chapter 8", () => {
    const chapters = [{ chapterNumber: "8", volume: null }];
    const result = applyWikipediaVolumeMappings(chapters, mappings);
    expect(result[0].volume).toBe("2");
  });

  it("assigns volume 3 to chapter 17", () => {
    const chapters = [{ chapterNumber: "17", volume: null }];
    const result = applyWikipediaVolumeMappings(chapters, mappings);
    expect(result[0].volume).toBe("3");
  });

  it("overrides an existing non-null volume", () => {
    const chapters = [{ chapterNumber: "8", volume: "99" }];
    const result = applyWikipediaVolumeMappings(chapters, mappings);
    expect(result[0].volume).toBe("2");
  });

  it("leaves non-numeric chapter numbers ungrouped", () => {
    const chapters = [{ chapterNumber: "Bonus", volume: null }];
    const result = applyWikipediaVolumeMappings(chapters, mappings);
    expect(result[0].volume).toBeNull();
  });

  it("leaves chapters outside all ranges unchanged", () => {
    const chapters = [{ chapterNumber: "200", volume: null }];
    const result = applyWikipediaVolumeMappings(chapters, mappings);
    expect(result[0].volume).toBeNull();
  });

  it("handles decimal chapter numbers (e.g. 8.5 goes in vol 2)", () => {
    const chapters = [{ chapterNumber: "8.5", volume: null }];
    const result = applyWikipediaVolumeMappings(chapters, mappings);
    expect(result[0].volume).toBe("2");
  });

  it("does not mutate the input array", () => {
    const chapters = [{ chapterNumber: "1", volume: null }];
    const original = { ...chapters[0] };
    applyWikipediaVolumeMappings(chapters, mappings);
    expect(chapters[0]).toStrictEqual(original);
  });

  it("does not mutate individual chapter objects", () => {
    const chapter = { chapterNumber: "1", volume: null };
    const chapters = [chapter];
    applyWikipediaVolumeMappings(chapters, mappings);
    expect(chapter.volume).toBeNull();
  });

  it("returns a new array (not the same reference)", () => {
    const chapters = [{ chapterNumber: "1", volume: null }];
    const result = applyWikipediaVolumeMappings(chapters, mappings);
    expect(result).not.toBe(chapters);
  });

  it("returns copies of chapters when mappings is empty", () => {
    const chapters = [{ chapterNumber: "1", volume: "5" }];
    const result = applyWikipediaVolumeMappings(chapters, []);
    expect(result[0].volume).toBe("5");
    expect(result).not.toBe(chapters);
  });

  it("preserves extra fields on chapter objects", () => {
    const chapters = [
      { chapterNumber: "1", volume: null, title: "First Chapter" },
    ];
    const result = applyWikipediaVolumeMappings(chapters, mappings);
    expect(result[0]).toMatchObject({ title: "First Chapter" });
  });
});

// ─── pickBestSearchResult ────────────────────────────────────────────────

describe("pickBestSearchResult", () => {
  it("prefers 'chapters' page over 'volumes' page", () => {
    const hits = [
      { title: "List of One Piece manga volumes" },
      { title: "Lists of One Piece chapters" },
      { title: "List of One Piece chapters (1\u2013186)" },
    ];
    expect(pickBestSearchResult(hits)).toBe("Lists of One Piece chapters");
  });

  it("returns first matching chapter page when no volumes page", () => {
    const hits = [
      { title: "List of Berserk chapters" },
      { title: "Berserk (manga)" },
    ];
    expect(pickBestSearchResult(hits)).toBe("List of Berserk chapters");
  });

  it("returns null when no chapter pages found", () => {
    const hits = [{ title: "One Piece" }, { title: "One Piece (anime)" }];
    expect(pickBestSearchResult(hits)).toBeNull();
  });
});
