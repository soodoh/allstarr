import { db } from "src/db";
import { downloadFormats } from "src/db/schema";
import type { IndexerRelease, ReleaseQuality } from "./types";

type Specification = {
  type: "releaseTitle" | "releaseGroup" | "size" | "indexerFlag";
  value: string;
  min?: number;
  max?: number;
  negate: boolean;
  required: boolean;
};

type CachedDef = {
  id: number;
  name: string;
  weight: number;
  color: string;
  specs: Specification[];
};

let cachedDefs: CachedDef[] | null = null;
let sizeLimitsCache: Map<number, { minSize: number; maxSize: number }> | null =
  null;

function parseSpecs(raw: unknown): Specification[] {
  if (Array.isArray(raw)) {
    return raw as Specification[];
  }
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as Specification[];
    } catch {
      return [];
    }
  }
  return [];
}

function getFormatDefs(): CachedDef[] {
  if (!cachedDefs) {
    const rows = db.select().from(downloadFormats).all();
    cachedDefs = rows
      .filter((r) => parseSpecs(r.specifications).length > 0)
      .map((row) => ({
        id: row.id,
        name: row.title,
        weight: row.weight,
        color: row.color,
        specs: parseSpecs(row.specifications),
      }))
      // Higher weight = checked first
      .toSorted((a, b) => b.weight - a.weight);
  }
  return cachedDefs;
}

export function invalidateFormatDefCache(): void {
  cachedDefs = null;
  sizeLimitsCache = null;
}

/** Get min/max size limits (in MB) for a format definition */
export function getDefSizeLimits(
  qualityId: number,
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
      });
    }
  }
  return sizeLimitsCache.get(qualityId) ?? null;
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

function evaluateSpec(spec: Specification, release: ReleaseInfo): boolean {
  let result = false;

  switch (spec.type) {
    case "releaseTitle": {
      if (!spec.value) {
        break;
      }
      try {
        const regex = new RegExp(spec.value, "i");
        result = regex.test(release.title);
      } catch {
        // Invalid regex — treat as no match
      }
      break;
    }
    case "releaseGroup": {
      if (!spec.value) {
        break;
      }
      const group = parseReleaseGroup(release.title);
      if (!group) {
        break;
      }
      try {
        const regex = new RegExp(spec.value, "i");
        result = regex.test(group);
      } catch {
        // Invalid regex
      }
      break;
    }
    case "size": {
      const sizeMB = release.size / (1024 * 1024);
      const min = spec.min ?? 0;
      const max = spec.max ?? Number.POSITIVE_INFINITY;
      result = sizeMB >= min && sizeMB <= max;
      break;
    }
    case "indexerFlag": {
      if (
        release.indexerFlags === null ||
        release.indexerFlags === undefined ||
        !spec.value
      ) {
        break;
      }
      const flagBit = Number(spec.value);
      if (!Number.isNaN(flagBit)) {
        // eslint-disable-next-line no-bitwise -- intentional bitwise flag check
        result = (release.indexerFlags & flagBit) !== 0;
      }
      break;
    }
    default: {
      break;
    }
  }

  return spec.negate ? !result : result;
}

/** Match a release against DB-defined format specs — returns first (highest-weight) match */
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
    const requiredSpecs = def.specs.filter((s) => s.required);
    const optionalSpecs = def.specs.filter((s) => !s.required);

    const requiredPass = requiredSpecs.every((s) => evaluateSpec(s, release));
    const optionalPass =
      optionalSpecs.length === 0 ||
      optionalSpecs.some((s) => evaluateSpec(s, release));

    if (requiredPass && optionalPass) {
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
  };
}

/**
 * Derive a format weight from a profile's ordered items array.
 * Items at the top of the list (lower index) are more preferred and get a
 * higher weight.  Returns 0 for formats not found in the profile.
 */
export function getProfileWeight(qualityId: number, items: number[]): number {
  const idx = items.indexOf(qualityId);
  if (idx === -1) {
    return 0;
  }
  return items.length - idx;
}
