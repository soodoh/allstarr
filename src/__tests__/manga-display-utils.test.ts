import { describe, it, expect } from "vitest";
import { splitUngroupedVolumes } from "src/lib/manga-display-utils";
import type { DisplayVolume } from "src/lib/manga-display-utils";

// Helper to make test data concise
function vol(
  id: number,
  volumeNumber: number | null,
  chapters: Array<{ id: number; chapterNumber: string }>,
): DisplayVolume {
  return {
    id,
    volumeNumber,
    title: volumeNumber === null ? null : `Volume ${volumeNumber}`,
    chapters: chapters.map((c) => ({
      ...c,
      title: null,
      releaseDate: null,
      scanlationGroup: null,
      hasFile: false,
      monitored: true,
    })),
  };
}

function ch(id: number, num: string) {
  return { id, chapterNumber: num };
}

describe("splitUngroupedVolumes", () => {
  it("interleaves ungrouped chapters between known volumes", () => {
    const volumes: DisplayVolume[] = [
      vol(1, 68, [ch(1, "668"), ch(2, "669"), ch(3, "670")]),
      vol(2, 72, [ch(4, "712"), ch(5, "713")]),
      vol(3, null, [
        ch(6, "671"),
        ch(7, "700"),
        ch(8, "711"),
        ch(9, "1100"),
        ch(10, "1101"),
      ]),
    ];

    const result = splitUngroupedVolumes(volumes);

    // Should be: Chapters 1100-1101, Volume 72, Chapters 671-711, Volume 68
    expect(result).toHaveLength(4);
    expect(result[0].displayTitle).toBe("Chapters 1100-1101");
    expect(result[0].chapters).toHaveLength(2);
    expect(result[1].displayTitle).toBe("Volume 72");
    expect(result[2].displayTitle).toBe("Chapters 671-711");
    expect(result[2].chapters).toHaveLength(3);
    expect(result[3].displayTitle).toBe("Volume 68");
  });

  it("handles ungrouped chapters below the lowest volume", () => {
    const volumes: DisplayVolume[] = [
      vol(1, 5, [ch(1, "40"), ch(2, "41")]),
      vol(2, null, [ch(3, "1"), ch(4, "10"), ch(5, "39")]),
    ];

    const result = splitUngroupedVolumes(volumes);

    expect(result).toHaveLength(2);
    expect(result[0].displayTitle).toBe("Volume 5");
    expect(result[1].displayTitle).toBe("Chapters 1-39");
    expect(result[1].chapters).toHaveLength(3);
  });

  it("puts specials at the bottom", () => {
    const volumes: DisplayVolume[] = [
      vol(1, 1, [ch(1, "1"), ch(2, "2")]),
      vol(2, null, [ch(3, "Chopper Man"), ch(4, "Special"), ch(5, "50")]),
    ];

    const result = splitUngroupedVolumes(volumes);

    expect(result).toHaveLength(3);
    expect(result[0].displayTitle).toBe("Chapter 50");
    expect(result[1].displayTitle).toBe("Volume 1");
    expect(result[2].displayTitle).toBe("Specials");
    expect(result[2].chapters).toHaveLength(2);
  });

  it("uses singular label for single-chapter group", () => {
    const volumes: DisplayVolume[] = [
      vol(1, 1, [ch(1, "1")]),
      vol(2, null, [ch(3, "50")]),
    ];

    const result = splitUngroupedVolumes(volumes);

    expect(result[0].displayTitle).toBe("Chapter 50");
  });

  it("returns known volumes in descending order with no ungrouped", () => {
    const volumes: DisplayVolume[] = [
      vol(1, 1, [ch(1, "1")]),
      vol(2, 3, [ch(2, "20")]),
      vol(3, 2, [ch(3, "10")]),
    ];

    const result = splitUngroupedVolumes(volumes);

    expect(result.map((v) => v.displayTitle)).toStrictEqual([
      "Volume 3",
      "Volume 2",
      "Volume 1",
    ]);
  });

  it("handles all chapters being ungrouped", () => {
    const volumes: DisplayVolume[] = [
      vol(1, null, [ch(1, "1"), ch(2, "2"), ch(3, "100")]),
    ];

    const result = splitUngroupedVolumes(volumes);

    expect(result).toHaveLength(1);
    expect(result[0].displayTitle).toBe("Chapters 1-100");
  });

  it("handles empty volumes array", () => {
    expect(splitUngroupedVolumes([])).toStrictEqual([]);
  });
});
