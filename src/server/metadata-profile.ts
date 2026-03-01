import { db } from "src/db";
import { settings } from "src/db/schema";
import { eq } from "drizzle-orm";
import { metadataProfileSchema } from "src/lib/validators";

export type MetadataProfile = {
  allowedLanguages: string[];
  skipMissingReleaseDate: boolean;
  skipMissingIsbnAsin: boolean;
  skipCompilations: boolean;
};

const DEFAULT_METADATA_PROFILE: MetadataProfile = {
  allowedLanguages: ["en"],
  skipMissingReleaseDate: false,
  skipMissingIsbnAsin: false,
  skipCompilations: false,
};

/**
 * Synchronous read of the metadata profile from the settings table.
 * Used by import logic (runs inside transactions).
 */
export function getMetadataProfile(): MetadataProfile {
  const row = db
    .select()
    .from(settings)
    .where(eq(settings.key, "metadata.profile"))
    .get();
  if (!row?.value) {
    return DEFAULT_METADATA_PROFILE;
  }
  try {
    const raw =
      typeof row.value === "string" ? JSON.parse(row.value) : row.value;
    const parsed = metadataProfileSchema.safeParse(raw);
    return parsed.success ? parsed.data : DEFAULT_METADATA_PROFILE;
  } catch {
    return DEFAULT_METADATA_PROFILE;
  }
}
