import { db } from "src/db";
import { downloadFormats, settings } from "src/db/schema";
import type { IndexerRelease, ReleaseQuality } from "./types";
import { computeEffectiveSizes } from "src/lib/format-size-calc";
import type { EditionMeta } from "src/lib/format-size-calc";
import { eq } from "drizzle-orm";

type CachedDef = {
  id: number;
  name: string;
  weight: number;
  color: string;
  type: string;
  source: string | null;
  resolution: number;
};

let cachedDefs: CachedDef[] | null = null;
let sizeLimitsCache: Map<
  number,
  { minSize: number; maxSize: number; type: string }
> | null = null;
// eslint-disable-next-line prefer-const
let cachedDefaults: {
  defaultPageCount: number;
  defaultAudioDuration: number;
} | null = null;

function getFormatDefs(): CachedDef[] {
  if (!cachedDefs) {
    const rows = db.select().from(downloadFormats).all();
    cachedDefs = rows
      .filter((r) => r.enabled)
      .map((row) => ({
        id: row.id,
        name: row.title,
        weight: row.weight,
        color: row.color,
        type: row.type,
        source: row.source,
        resolution: row.resolution,
      }))
      // Higher weight = checked first
      .toSorted((a, b) => b.weight - a.weight);
  }
  return cachedDefs;
}

export function invalidateFormatDefCache(): void {
  cachedDefs = null;
  sizeLimitsCache = null;
  cachedDefaults = null;
}

/** Get effective min/max size limits (in MB) for a format, computed from rates + edition metadata */
export function getDefSizeLimits(
  qualityId: number,
  editionMeta?: EditionMeta | null,
): { minSize: number; maxSize: number } | null {
  if (qualityId === 0) {
    return null;
  }
  if (!sizeLimitsCache) {
    const rows = db.select().from(downloadFormats).all();
    sizeLimitsCache = new Map();
    for (const r of rows) {
      sizeLimitsCache.set(r.id, {
        minSize: r.minSize ?? 0,
        maxSize: r.maxSize ?? 0,
        type: r.type,
      });
    }
  }
  const cached = sizeLimitsCache.get(qualityId);
  if (!cached) {
    return null;
  }

  // Cache default dimension settings (read once, cleared on invalidate)
  if (!cachedDefaults) {
    const defaultPageCountRow = db
      .select()
      .from(settings)
      .where(eq(settings.key, "format.defaultPageCount"))
      .get();
    const defaultAudioDurationRow = db
      .select()
      .from(settings)
      .where(eq(settings.key, "format.defaultAudioDuration"))
      .get();
    cachedDefaults = {
      defaultPageCount: defaultPageCountRow?.value
        ? Number(JSON.parse(String(defaultPageCountRow.value)))
        : 300,
      defaultAudioDuration: defaultAudioDurationRow?.value
        ? Number(JSON.parse(String(defaultAudioDurationRow.value)))
        : 600,
    };
  }

  const effective = computeEffectiveSizes(
    cached.type as "ebook" | "audio",
    cached.minSize,
    cached.maxSize,
    0, // preferredSize not needed for rejection logic
    editionMeta,
    cachedDefaults,
  );

  return { minSize: effective.minSize, maxSize: effective.maxSize };
}

export type { EditionMeta } from "src/lib/format-size-calc";

/** Get the format type for a quality ID (populates cache if needed) */
export function getFormatType(qualityId: number): string | null {
  if (!sizeLimitsCache) {
    getDefSizeLimits(qualityId);
  }
  return sizeLimitsCache?.get(qualityId)?.type ?? null;
}

/** Extract trailing release group from a title (e.g. "Book Title-GROUP" → "GROUP") */
export function parseReleaseGroup(title: string): string | null {
  const match = title.match(/-([A-Za-z0-9_]+)$/);
  return match ? match[1] : null;
}

type ReleaseInfo = {
  title: string;
  size: number;
  indexerFlags: number | null;
};

/**
 * Match a format definition against a release using quality tier identity.
 * - For ebook/audio: match format title as a word boundary regex in the release title
 * - For video: match by source + resolution parsed from the release title
 */
function matchDefAgainstRelease(def: CachedDef, release: ReleaseInfo): boolean {
  const titleLower = release.title.toLowerCase();

  if (def.type === "video") {
    // Video: match by source + resolution identity
    if (def.source && def.resolution > 0) {
      const sourcePattern = getVideoSourcePattern(def.source);
      const resPattern = new RegExp(`\\b${def.resolution}p\\b`, "i");
      return (
        sourcePattern.test(release.title) && resPattern.test(release.title)
      );
    }
    if (def.source) {
      return getVideoSourcePattern(def.source).test(release.title);
    }
    if (def.resolution > 0) {
      return new RegExp(`\\b${def.resolution}p\\b`, "i").test(release.title);
    }
    return false;
  }

  // Ebook/audio: match by format title as a word boundary in the release title
  // Strip parenthetical suffixes like "(Conservative)" for matching
  const baseName = def.name.replace(/\s*\(.*?\)\s*$/, "").trim();
  if (!baseName || baseName.toLowerCase().startsWith("unknown")) {
    return false;
  }
  try {
    const escaped = baseName.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
    const regex = new RegExp(`\\b${escaped}\\b`, "i");
    return regex.test(titleLower);
  } catch {
    return false;
  }
}

/** Get a regex pattern for matching video source strings in release titles */
function getVideoSourcePattern(source: string): RegExp {
  switch (source) {
    case "Television": {
      return /\b(?:hdtv|pdtv|sdtv)\b/i;
    }
    case "Web": {
      return /\bweb[-. ]?dl\b/i;
    }
    case "WebRip": {
      return /\bwebrip\b/i;
    }
    case "Bluray": {
      return /\bblu[-. ]?ray\b/i;
    }
    case "BlurayRaw": {
      return /\b(?:remux|blu[-. ]?ray[-. ]?raw)\b/i;
    }
    case "DVD": {
      return /\bdvd(?:rip)?\b/i;
    }
    default: {
      return /(?!)/; // Never matches
    }
  }
}

/** Match a release against DB-defined format definitions — returns first (highest-weight) match */
export function matchFormat(release: ReleaseInfo): ReleaseQuality {
  const matches = matchAllFormats(release);
  return matches[0] ?? { id: 0, name: "Unknown", weight: 0, color: "gray" };
}

/** Return ALL matching format definitions for a release, ordered by global weight desc.
 *  Used when a release title mentions multiple formats (e.g. "mobi, epub, pdf or azw3")
 *  so the caller can pick the best match based on profile priority. */
export function matchAllFormats(release: ReleaseInfo): ReleaseQuality[] {
  const defs = getFormatDefs();
  const matches: ReleaseQuality[] = [];

  for (const def of defs) {
    if (matchDefAgainstRelease(def, release)) {
      matches.push({
        id: def.id,
        name: def.name,
        weight: def.weight,
        color: def.color,
      });
    }
  }

  return matches;
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

/** Enrich a partial IndexerRelease object with format + formatted fields */
export function enrichRelease(
  release: Omit<
    IndexerRelease,
    | "quality"
    | "sizeFormatted"
    | "ageFormatted"
    | "rejections"
    | "formatScore"
    | "formatScoreDetails"
    | "cfScore"
    | "cfDetails"
  >,
): IndexerRelease {
  return {
    ...release,
    quality: matchFormat({
      title: release.title,
      size: release.size,
      indexerFlags: release.indexerFlags ?? null,
    }),
    sizeFormatted: formatBytes(release.size),
    ageFormatted: formatAge(release.publishDate),
    rejections: [],
    formatScore: 0,
    formatScoreDetails: [],
    cfScore: 0,
    cfDetails: [],
  };
}

/**
 * Derive a format weight from a profile's ordered items array.
 * Each inner array is a group of equivalent-quality formats.
 * Formats in the same group get the same weight.
 * Groups at the top of the list (lower index) are more preferred and get a
 * higher weight.  Returns 0 for formats not found in the profile.
 */
export function getProfileWeight(qualityId: number, items: number[][]): number {
  for (let i = 0; i < items.length; i += 1) {
    if (items[i].includes(qualityId)) {
      return items.length - i; // First group = highest weight
    }
  }
  return 0; // Not in profile
}

export function isFormatInProfile(
  qualityId: number,
  items: number[][],
): boolean {
  return items.some((group) => group.includes(qualityId));
}

export function flattenProfileItems(items: number[][]): number[] {
  return items.flat();
}
