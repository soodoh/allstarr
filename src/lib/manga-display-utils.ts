import { parseChapterNumber } from "src/server/manga-chapter-utils";

type Chapter = {
  id: number;
  chapterNumber: string;
  title: string | null;
  releaseDate: string | null;
  scanlationGroup: string | null;
  hasFile: boolean | null;
  monitored: boolean | null;
};

export type DisplayVolume = {
  id: number;
  volumeNumber: number | null;
  title: string | null;
  chapters: Chapter[];
};

export type DisplayGroup = {
  /** Unique key for React rendering and accordion value */
  key: string;
  /** Label shown in the accordion trigger */
  displayTitle: string;
  /** The original volume (null for synthetic ungrouped groups) */
  volume: DisplayVolume | null;
  /** Chapters in this group */
  chapters: Chapter[];
};

/**
 * Split ungrouped chapters (volumeNumber === null) into positional groups
 * interleaved with known volumes, all in descending order.
 * Non-numeric specials go into a "Specials" group at the bottom.
 */
export function splitUngroupedVolumes(
  volumes: DisplayVolume[],
): DisplayGroup[] {
  const knownVolumes = volumes.filter((v) => v.volumeNumber !== null);
  const ungroupedVolumes = volumes.filter((v) => v.volumeNumber === null);
  const allUngroupedChapters = ungroupedVolumes.flatMap((v) => v.chapters);

  // Split ungrouped into numeric and non-numeric (specials)
  const numericChapters: Array<{ chapter: Chapter; parsed: number }> = [];
  const specialChapters: Chapter[] = [];

  for (const ch of allUngroupedChapters) {
    const parsed = parseChapterNumber(ch.chapterNumber);
    if (parsed === null) {
      specialChapters.push(ch);
    } else {
      numericChapters.push({ chapter: ch, parsed });
    }
  }

  // Sort known volumes descending by volumeNumber
  const sortedKnown = [...knownVolumes].toSorted(
    (a, b) => b.volumeNumber! - a.volumeNumber!,
  );

  // Compute the max chapter number for each known volume
  const volumesWithMax = sortedKnown.map((vol) => {
    const chapterNums = vol.chapters
      .map((c) => parseChapterNumber(c.chapterNumber))
      .filter((n): n is number => n !== null);
    return {
      volume: vol,
      maxChapter:
        chapterNums.length > 0
          ? Math.max(...chapterNums)
          : Number.NEGATIVE_INFINITY,
    };
  });

  // Walk through volumes top-down, collecting ungrouped chapters in each gap
  const groups: DisplayGroup[] = [];
  let unassigned = [...numericChapters];

  for (const { volume, maxChapter } of volumesWithMax) {
    // Chapters above this volume's max chapter
    const inGap = unassigned.filter((c) => c.parsed > maxChapter);
    unassigned = unassigned.filter((c) => c.parsed <= maxChapter);

    if (inGap.length > 0) {
      groups.push(makeUngroupedGroup(inGap));
    }

    groups.push({
      key: `volume-${volume.id}`,
      displayTitle: `Volume ${volume.volumeNumber}`,
      volume,
      chapters: volume.chapters,
    });
  }

  // Remaining ungrouped chapters below the lowest volume
  if (unassigned.length > 0) {
    groups.push(makeUngroupedGroup(unassigned));
  }

  // Specials at the bottom
  if (specialChapters.length > 0) {
    groups.push({
      key: "specials",
      displayTitle: "Specials",
      volume: null,
      chapters: specialChapters,
    });
  }

  return groups;
}

function makeUngroupedGroup(
  items: Array<{ chapter: Chapter; parsed: number }>,
): DisplayGroup {
  const sorted = [...items].toSorted((a, b) => b.parsed - a.parsed);
  const min = sorted.at(-1).parsed;
  const max = sorted[0].parsed;
  let label: string;
  if (sorted.length === 1 || min === max) {
    label = `Chapter ${min}`;
  } else {
    label = `Chapters ${min}-${max}`;
  }

  return {
    key: `ungrouped-${min}-${max}`,
    displayTitle: label,
    volume: null,
    chapters: sorted.map((s) => s.chapter),
  };
}
