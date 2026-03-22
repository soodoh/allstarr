import { db } from "src/db";
import { downloadProfiles } from "src/db/schema";

/**
 * Returns deduplicated language codes from all download profiles.
 * Replaces the global allowedLanguages setting.
 */
export default function getProfileLanguages(): string[] {
  const profiles = db
    .select({ language: downloadProfiles.language })
    .from(downloadProfiles)
    .all();
  return [...new Set(profiles.map((p) => p.language))];
}
