import { metadataProfileSchema } from "src/lib/validators";
import { getSettingValue } from "./settings-store";

export type MetadataProfile = {
	skipMissingReleaseDate: boolean;
	skipMissingIsbnAsin: boolean;
	skipCompilations: boolean;
	minimumPopularity: number;
	minimumPages: number;
};

const DEFAULT_METADATA_PROFILE: MetadataProfile = {
	skipMissingReleaseDate: true,
	skipMissingIsbnAsin: true,
	skipCompilations: false,
	minimumPopularity: 10,
	minimumPages: 0,
};

/**
 * Synchronous read of the metadata profile from the settings table.
 * Used by import logic (runs inside transactions).
 */
export function getMetadataProfile(): MetadataProfile {
	const raw = getSettingValue<unknown>(
		"metadata.hardcover.profile",
		DEFAULT_METADATA_PROFILE,
	);
	const parsed = metadataProfileSchema.safeParse(raw);
	return parsed.success ? parsed.data : DEFAULT_METADATA_PROFILE;
}
