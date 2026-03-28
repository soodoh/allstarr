/**
 * Strip version and quality suffixes from a chapter number string.
 * "585v2" -> "585", "420-430 (HQ)" -> "420-430", "592 v2" -> "592"
 */
export function normalizeChapterNumber(raw: string): string {
  let s = raw.trim();
  // Remove parenthesized suffixes: (v2), (HQ), etc.
  s = s.replace(/\s*\([^)]+\)\s*$/, "");
  // Remove trailing vN (with or without leading space): "585v2", "592 v2"
  s = s.replace(/\s*v\d+$/i, "");
  // Remove trailing HQ (with leading space): "378-388 HQ"
  s = s.replace(/\s+HQ$/i, "");
  return s.trim();
}

/**
 * Check if a chapter number string represents a single numeric chapter.
 * Returns true for "695", "10.5" but false for "695-696", "Chopper Man".
 */
export function isNumericChapter(chapterNumber: string): boolean {
  return /^\d+(\.\d+)?$/.test(chapterNumber);
}

/**
 * Parse a single numeric chapter string to a number, or null if non-numeric.
 */
export function parseChapterNumber(chapterNumber: string): number | null {
  if (!isNumericChapter(chapterNumber)) {
    return null;
  }
  return Number.parseFloat(chapterNumber);
}

/**
 * If the string is a simple integer range like "695-696", expand it
 * into an array of individual chapter numbers [695, 696].
 * Returns null if the string is not a parseable range.
 * Compound entries like "775v2 + 790-792" return null.
 */
export function expandChapterRange(chapterNumber: string): number[] | null {
  // Reject compound entries (contain "+")
  if (chapterNumber.includes("+")) {
    return null;
  }

  const match = chapterNumber.match(/^(\d+)-(\d+)$/);
  if (!match) {
    return null;
  }

  const start = Number.parseInt(match[1], 10);
  const end = Number.parseInt(match[2], 10);
  if (start > end) {
    return null;
  }

  const result: number[] = [];
  for (let i = start; i <= end; i += 1) {
    result.push(i);
  }
  return result;
}
