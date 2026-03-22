/**
 * Convert rate-based format size limits to effective MB values.
 *
 * Ebook rates are in MB per 100 pages.
 * Audiobook rates are in kbps (kilobits/sec, binary convention: 1 kbit = 1024 bits).
 */

export type EditionMeta = {
  pageCount?: number | null;
  audioLength?: number | null; // in minutes
};

export type EffectiveSizeLimits = {
  minSize: number; // MB
  maxSize: number; // MB (0 = unlimited)
  preferredSize: number; // MB
};

const DEFAULT_PAGE_COUNT = 300;
const DEFAULT_AUDIO_DURATION = 600; // minutes

/**
 * Compute effective MB size limits from rate values.
 *
 * @param type - "ebook" or "audiobook"
 * @param minRate - rate value (MB/100pg for ebook, kbps for audiobook)
 * @param maxRate - rate value
 * @param preferredRate - rate value
 * @param editionMeta - optional edition metadata (pageCount, audioLength)
 * @param defaults - optional override for default dimensions
 */
export function computeEffectiveSizes(
  type: "ebook" | "audiobook",
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

  // audiobook: kbps → MB
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
export function formatEffectiveSize(mb: number): string {
  if (mb === 0) {
    return "No limit";
  }
  if (mb >= 1024) {
    return `${(mb / 1024).toFixed(1)} GB`;
  }
  return `${Math.round(mb)} MB`;
}
