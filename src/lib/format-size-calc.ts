/**
 * Convert rate-based format size limits to effective MB values.
 *
 * Ebook rates are in MB per 100 pages.
 * Audio rates are in kbps (kilobits/sec, binary convention: 1 kbit = 1024 bits).
 * Video rates are in MB/min (stored directly, pass through multiplied by duration).
 */

export type EditionMeta = {
  pageCount?: number | null;
  audioLength?: number | null; // in minutes
  videoLength?: number | null; // in minutes
};

export type EffectiveSizeLimits = {
  minSize: number; // MB
  maxSize: number; // MB (0 = unlimited)
  preferredSize: number; // MB
};

const DEFAULT_PAGE_COUNT = 300;
const DEFAULT_AUDIO_DURATION = 600; // minutes
const DEFAULT_VIDEO_DURATION = 120; // minutes

/** Derive size calculation mode from content type(s) */
export function sizeMode(
  contentType: string | string[],
): "ebook" | "audio" | "video" {
  const ct = Array.isArray(contentType) ? contentType[0] : contentType;
  if (ct === "audiobook") {
    return "audio";
  }
  if (ct === "movie" || ct === "tv") {
    return "video";
  }
  return "ebook";
}

/**
 * Compute effective MB size limits from rate values.
 *
 * @param type - "ebook", "audio", or "video"
 * @param minRate - rate value (MB/100pg for ebook, kbps for audio, MB/min for video)
 * @param maxRate - rate value
 * @param preferredRate - rate value
 * @param editionMeta - optional edition metadata (pageCount, audioLength, videoLength)
 * @param defaults - optional override for default dimensions
 */
export function computeEffectiveSizes(
  type: "ebook" | "audio" | "video",
  minRate: number,
  maxRate: number,
  preferredRate: number,
  editionMeta?: EditionMeta | null,
  defaults?: { defaultPageCount?: number; defaultAudioDuration?: number },
): EffectiveSizeLimits {
  if (type === "ebook") {
    const pages =
      editionMeta?.pageCount ??
      defaults?.defaultPageCount ??
      DEFAULT_PAGE_COUNT;
    return {
      minSize: minRate * (pages / 100),
      maxSize: maxRate === 0 ? 0 : maxRate * (pages / 100),
      preferredSize: preferredRate * (pages / 100),
    };
  }

  if (type === "video") {
    // video: MB/min × duration
    const durationMin = editionMeta?.videoLength ?? DEFAULT_VIDEO_DURATION;
    return {
      minSize: minRate * durationMin,
      maxSize: maxRate === 0 ? 0 : maxRate * durationMin,
      preferredSize: preferredRate * durationMin,
    };
  }

  // audio: kbps → MB
  const durationMin =
    editionMeta?.audioLength ??
    defaults?.defaultAudioDuration ??
    DEFAULT_AUDIO_DURATION;
  const durationSec = durationMin * 60;

  return {
    minSize: (minRate * 128 * durationSec) / (1024 * 1024),
    maxSize: maxRate === 0 ? 0 : (maxRate * 128 * durationSec) / (1024 * 1024),
    preferredSize: (preferredRate * 128 * durationSec) / (1024 * 1024),
  };
}

/** Format a size in MB as a human-readable string (e.g., "45 MB", "1.5 GB", "No limit") */
export function formatEffectiveSize(
  mb: number,
  context: "min" | "max" = "max",
): string {
  if (mb === 0) {
    return context === "min" ? "0" : "No limit";
  }
  if (mb >= 1024) {
    return `${(mb / 1024).toFixed(1)} GB`;
  }
  return `${Math.round(mb)} MB`;
}
