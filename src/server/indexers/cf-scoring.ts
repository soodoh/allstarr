import { db } from "src/db";
import { customFormats, profileCustomFormats } from "src/db/schema";
import { eq } from "drizzle-orm";
import type { CustomFormatSpecification } from "src/db/schema/custom-formats";

// ─── Types ──────────────────────────────────────────────────────────────────

export type ReleaseAttributes = {
  title: string;
  group?: string;
  sizeMB?: number;
  indexerFlags?: number;
  language?: string;
  videoSource?: string;
  resolution?: string;
  qualityModifier?: string;
  edition?: string;
  videoCodec?: string;
  audioCodec?: string;
  audioChannels?: string;
  hdrFormat?: string;
  streamingService?: string;
  releaseType?: string;
  year?: number;
  fileFormat?: string;
  audioBitrateKbps?: number;
  narrator?: string;
  publisher?: string;
  audioDurationMinutes?: number;
};

type ProfileCF = {
  cfId: number;
  name: string;
  score: number;
  specs: CustomFormatSpecification[];
  contentTypes: string[];
};

export type CFScoreResult = {
  totalScore: number;
  matchedFormats: Array<{ cfId: number; name: string; score: number }>;
};

// ─── Cache ──────────────────────────────────────────────────────────────────

const profileCFCache = new Map<number, ProfileCF[]>();

export function invalidateCFCache(): void {
  profileCFCache.clear();
}

// ─── Load profile CFs ───────────────────────────────────────────────────────

/**
 * Load custom format scoring config for a profile from DB (cached).
 * Returns array of CF entries with their specs, scores, and contentTypes.
 */
export function getProfileCFs(profileId: number): ProfileCF[] {
  const cached = profileCFCache.get(profileId);
  if (cached) {
    return cached;
  }

  const rows = db
    .select({
      cfId: profileCustomFormats.customFormatId,
      score: profileCustomFormats.score,
      name: customFormats.name,
      specifications: customFormats.specifications,
      contentTypes: customFormats.contentTypes,
      enabled: customFormats.enabled,
    })
    .from(profileCustomFormats)
    .innerJoin(
      customFormats,
      eq(profileCustomFormats.customFormatId, customFormats.id),
    )
    .where(eq(profileCustomFormats.profileId, profileId))
    .all();

  const result: ProfileCF[] = rows
    .filter((r) => r.enabled)
    .map((r) => ({
      cfId: r.cfId,
      name: r.name,
      score: r.score,
      specs: r.specifications as CustomFormatSpecification[],
      contentTypes: r.contentTypes as string[],
    }));

  profileCFCache.set(profileId, result);
  return result;
}

// ─── Spec evaluation ────────────────────────────────────────────────────────

// Spec types that use regex matching
const REGEX_TYPES = new Set([
  "releaseTitle",
  "releaseGroup",
  "edition",
  "videoCodec",
  "audioCodec",
  "narrator",
  "publisher",
]);

// Spec types that use simple enum (exact) comparison
const ENUM_TYPES = new Set([
  "videoSource",
  "resolution",
  "qualityModifier",
  "audioChannels",
  "hdrFormat",
  "streamingService",
  "releaseType",
  "fileFormat",
  "language",
]);

// Spec types that use min/max range checking
const RANGE_TYPES = new Set(["size", "audioBitrate", "audioDuration", "year"]);

/** Map a spec type to the corresponding ReleaseAttributes field for regex types */
function getRegexTarget(
  type: string,
  attrs: ReleaseAttributes,
): string | undefined {
  switch (type) {
    case "releaseTitle": {
      return attrs.title;
    }
    case "releaseGroup": {
      return attrs.group;
    }
    case "edition": {
      return attrs.edition;
    }
    case "videoCodec": {
      return attrs.videoCodec;
    }
    case "audioCodec": {
      return attrs.audioCodec;
    }
    case "narrator": {
      return attrs.narrator;
    }
    case "publisher": {
      return attrs.publisher;
    }
    default: {
      return undefined;
    }
  }
}

/** Map a spec type to the corresponding ReleaseAttributes field for enum types */
function getEnumTarget(
  type: string,
  attrs: ReleaseAttributes,
): string | undefined {
  switch (type) {
    case "videoSource": {
      return attrs.videoSource;
    }
    case "resolution": {
      return attrs.resolution;
    }
    case "qualityModifier": {
      return attrs.qualityModifier;
    }
    case "audioChannels": {
      return attrs.audioChannels;
    }
    case "hdrFormat": {
      return attrs.hdrFormat;
    }
    case "streamingService": {
      return attrs.streamingService;
    }
    case "releaseType": {
      return attrs.releaseType;
    }
    case "fileFormat": {
      return attrs.fileFormat;
    }
    case "language": {
      return attrs.language;
    }
    default: {
      return undefined;
    }
  }
}

/** Map a spec type to the corresponding numeric ReleaseAttributes field for range types */
function getRangeTarget(
  type: string,
  attrs: ReleaseAttributes,
): number | undefined {
  switch (type) {
    case "size": {
      return attrs.sizeMB;
    }
    case "audioBitrate": {
      return attrs.audioBitrateKbps;
    }
    case "audioDuration": {
      return attrs.audioDurationMinutes;
    }
    case "year": {
      return attrs.year;
    }
    default: {
      return undefined;
    }
  }
}

/**
 * Evaluate ONE specification against release attributes.
 * Returns true if the spec matches (after applying negate).
 */
export function evaluateCFSpec(
  spec: CustomFormatSpecification,
  attrs: ReleaseAttributes,
): boolean {
  let result = false;

  if (REGEX_TYPES.has(spec.type)) {
    const target = getRegexTarget(spec.type, attrs);
    if (target && spec.value) {
      try {
        const regex = new RegExp(spec.value, "i");
        result = regex.test(target);
      } catch {
        // Invalid user-entered regex — treat as no match
      }
    }
  } else if (ENUM_TYPES.has(spec.type)) {
    const target = getEnumTarget(spec.type, attrs);
    if (target !== undefined && spec.value !== undefined) {
      result = target === spec.value;
    }
  } else if (RANGE_TYPES.has(spec.type)) {
    const target = getRangeTarget(spec.type, attrs);
    if (target !== undefined) {
      const min = spec.min ?? 0;
      const max = spec.max ?? Number.POSITIVE_INFINITY;
      result = target >= min && target <= max;
    }
  } else if (
    spec.type === "indexerFlag" &&
    attrs.indexerFlags !== undefined &&
    spec.value
  ) {
    const flagBit = Number(spec.value);
    if (!Number.isNaN(flagBit)) {
      // eslint-disable-next-line no-bitwise -- intentional bitwise flag check
      result = (attrs.indexerFlags & flagBit) !== 0;
    }
  }

  return spec.negate ? !result : result;
}

// ─── CF-level evaluation ────────────────────────────────────────────────────

/**
 * Evaluate a single custom format's specs against release attributes.
 * AND/OR logic: all required specs must match AND at least one non-required
 * must match (if any non-required specs exist).
 */
export function evaluateCF(
  specs: CustomFormatSpecification[],
  attrs: ReleaseAttributes,
): boolean {
  if (specs.length === 0) {
    return false;
  }

  const requiredSpecs = specs.filter((s) => s.required);
  const optionalSpecs = specs.filter((s) => !s.required);

  // All required specs must match
  const requiredPass = requiredSpecs.every((s) => evaluateCFSpec(s, attrs));
  if (!requiredPass) {
    return false;
  }

  // At least one optional spec must match (if any exist)
  const optionalPass =
    optionalSpecs.length === 0 ||
    optionalSpecs.some((s) => evaluateCFSpec(s, attrs));

  return optionalPass;
}

// ─── Content type mapping ───────────────────────────────────────────────────

/**
 * Map profile type axes to CF contentTypes vocabulary.
 * Profile has `contentType` (book, movie, show) and `mediaType` (ebook, audiobook).
 * CF contentTypes use: "ebook", "audiobook", "movie", "show", "any".
 */
export function profileToCFContentType(
  contentType: string,
  mediaType: string,
): string {
  if (contentType === "book") {
    // For books, use the mediaType to distinguish ebook vs audiobook
    return mediaType === "audiobook" ? "audiobook" : "ebook";
  }
  // For movies and shows, the contentType maps directly
  return contentType;
}

// ─── Main entry point ───────────────────────────────────────────────────────

/**
 * Calculate custom format score for a release against a profile.
 * Gets profile CFs, filters by contentType if provided, evaluates each CF,
 * and sums scores of matching formats.
 */
export function calculateCFScore(
  profileId: number,
  attrs: ReleaseAttributes,
  cfContentType?: string,
): CFScoreResult {
  const profileCFs = getProfileCFs(profileId);

  // Filter by content type if provided
  const applicable = cfContentType
    ? profileCFs.filter(
        (cf) =>
          cf.contentTypes.length === 0 ||
          cf.contentTypes.includes("any") ||
          cf.contentTypes.includes(cfContentType),
      )
    : profileCFs;

  let totalScore = 0;
  const matchedFormats: Array<{ cfId: number; name: string; score: number }> =
    [];

  for (const cf of applicable) {
    if (evaluateCF(cf.specs, attrs)) {
      totalScore += cf.score;
      matchedFormats.push({
        cfId: cf.cfId,
        name: cf.name,
        score: cf.score,
      });
    }
  }

  return { totalScore, matchedFormats };
}
