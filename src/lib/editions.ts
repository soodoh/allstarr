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

/** Edition with enough data for profile-aware selection. */
export type ProfilePickableEdition = {
  id: number;
  languageCode: string | null;
  isDefaultCover: boolean;
  format: string | null;
  usersCount: number | null;
  score: number | null;
};

/** Format sets per profile type. */
const EBOOK_FORMATS = new Set<string | null>(["Physical Book", "E-Book", null]);
const AUDIOBOOK_FORMATS = new Set<string | null>(["Audiobook"]);

export function matchesProfileFormat(
  format: string | null,
  profileType: "ebook" | "audio",
): boolean {
  return profileType === "audio"
    ? AUDIOBOOK_FORMATS.has(format)
    : EBOOK_FORMATS.has(format);
}

function byPopularity(
  a: ProfilePickableEdition,
  b: ProfilePickableEdition,
): number {
  const aScore = (a.usersCount ?? 0) * 1000 + (a.score ?? 0);
  const bScore = (b.usersCount ?? 0) * 1000 + (b.score ?? 0);
  return bScore - aScore;
}

/**
 * Select the best edition for a download profile.
 *
 * 1. Filter to matching format type
 * 2. Prefer isDefaultCover if language matches
 * 3. Next best by popularity with language match
 * 4. If no format match: fallback to all editions with same priority
 * 5. Final fallback: best by popularity regardless of language
 */
export function pickBestEditionForProfile<T extends ProfilePickableEdition>(
  editions: T[],
  profile: { language: string; mediaType: "ebook" | "audio" },
): T | undefined {
  if (editions.length === 0) {
    return undefined;
  }

  const formatMatched = editions.filter((e) =>
    matchesProfileFormat(e.format, profile.mediaType),
  );

  const pick = (candidates: T[]): T | undefined => {
    const defaultCover = candidates.find(
      (e) => e.isDefaultCover && e.languageCode === profile.language,
    );
    if (defaultCover) {
      return defaultCover;
    }

    const langMatched = candidates
      .filter((e) => e.languageCode === profile.language)
      .toSorted(byPopularity);
    if (langMatched.length > 0) {
      return langMatched[0];
    }

    return candidates.toSorted(byPopularity)[0];
  };

  if (formatMatched.length > 0) {
    return pick(formatMatched);
  }

  // No format match — fall back to all editions
  return pick([...editions]);
}
