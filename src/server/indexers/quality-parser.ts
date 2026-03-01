import type { IndexerRelease, ReleaseQuality } from "./types";

type QualityDefinition = {
  id: number;
  name: string;
  weight: number;
  color: ReleaseQuality["color"];
  pattern: RegExp;
};

// Book format quality definitions (matching seed data IDs).
// Patterns use \b word boundaries to match format names anywhere in the title
// (e.g. "Book Title EPUB", "Book.Title.epub", "[EPUB]"), matching Readarr's
// CodecRegex approach.
const QUALITY_DEFS: QualityDefinition[] = [
  {
    id: 4,
    name: "EPUB",
    weight: 80,
    color: "green",
    pattern: /\bepub\b/i,
  },
  {
    id: 5,
    name: "AZW3",
    weight: 60,
    color: "blue",
    pattern: /\bazw3?\b/i,
  },
  {
    id: 3,
    name: "MOBI",
    weight: 40,
    color: "amber",
    pattern: /\bmobi\b/i,
  },
  {
    id: 2,
    name: "PDF",
    weight: 20,
    color: "yellow",
    pattern: /\bpdf\b/i,
  },
  {
    id: 8,
    name: "FLAC",
    weight: 70,
    color: "purple",
    pattern: /\bflac\b/i,
  },
  {
    id: 7,
    name: "M4B",
    weight: 50,
    color: "cyan",
    pattern: /\bm4b\b/i,
  },
  {
    id: 6,
    name: "MP3",
    weight: 30,
    color: "orange",
    pattern: /\bmp3\b/i,
  },
];

const UNKNOWN_QUALITY: ReleaseQuality = {
  id: 0,
  name: "Unknown",
  weight: 0,
  color: "gray",
};

/** Parse quality from a release title string */
export function parseQualityFromTitle(title: string): ReleaseQuality {
  for (const def of QUALITY_DEFS) {
    if (def.pattern.test(title)) {
      return {
        id: def.id,
        name: def.name,
        weight: def.weight,
        color: def.color,
      };
    }
  }

  return UNKNOWN_QUALITY;
}

/** Format bytes as human-readable string */
function formatBytes(bytes: number): string {
  if (bytes === 0) {
    return "0 B";
  }
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${Number.parseFloat((bytes / k ** i).toFixed(1))} ${sizes[i]}`;
}

/** Format publish date as days ago */
function formatAge(publishDate: string | null): string {
  if (!publishDate) {
    return "Unknown";
  }
  const pubMs = new Date(publishDate).getTime();
  const nowMs = Date.now();
  const diffMs = nowMs - pubMs;
  if (diffMs < 0) {
    return "Unknown";
  }
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (days === 0) {
    return "Today";
  }
  if (days === 1) {
    return "1 day ago";
  }
  if (days < 30) {
    return `${days} days ago`;
  }
  const months = Math.floor(days / 30);
  if (months === 1) {
    return "1 month ago";
  }
  if (months < 12) {
    return `${months} months ago`;
  }
  const years = Math.floor(months / 12);
  if (years === 1) {
    return "1 year ago";
  }
  return `${years} years ago`;
}

/** Enrich a partial IndexerRelease object with quality + formatted fields */
export function enrichRelease(
  release: Omit<IndexerRelease, "quality" | "sizeFormatted" | "ageFormatted">,
): IndexerRelease {
  return {
    ...release,
    quality: parseQualityFromTitle(release.title),
    sizeFormatted: formatBytes(release.size),
    ageFormatted: formatAge(release.publishDate),
  };
}

type ProfileItem = { quality: { id: number }; allowed: boolean };

/**
 * Derive a quality weight from a profile's ordered items array.
 * Items at the top of the list (lower index) are more preferred and get a
 * higher weight.  Returns 0 for qualities not found in the profile.
 */
export function getProfileWeight(
  qualityId: number,
  items: ProfileItem[],
): number {
  const idx = items.findIndex((i) => i.quality.id === qualityId);
  if (idx === -1) {
    return 0;
  }
  return items.length - idx;
}
