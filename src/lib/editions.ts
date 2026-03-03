/** Minimal interface for edition selection logic. */
export type PickableEdition = {
  languageCode: string | null;
  isDefaultCover: boolean;
};

/**
 * Select the best edition for display given a language preference.
 *
 * Rules:
 * 1. When language is "all" or matches the canonical language (derived from the
 *    default cover edition), return the default cover edition so metadata like
 *    pages, ISBN, etc. is available. Callers should use the book-level title
 *    when `isDefaultCover` is true.
 * 2. When a different language is selected, return the first edition matching
 *    that language code.
 * 3. Falls back to the first edition in the array (pre-sorted by popularity).
 */
export function pickBestEdition<T extends PickableEdition>(
  editions: T[],
  language: string,
): T | undefined {
  const defaultCoverEdition = editions.find((e) => e.isDefaultCover);
  const canonicalLanguage = defaultCoverEdition?.languageCode;

  if (language === "all" || language === canonicalLanguage) {
    return defaultCoverEdition ?? editions[0];
  }

  if (!defaultCoverEdition) {
    return editions[0];
  }

  return editions.find((e) => e.languageCode === language) ?? editions[0];
}
