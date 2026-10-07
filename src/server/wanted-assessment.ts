import { getProfileWeight } from "src/lib/download-profile-quality";
import type { ProfileInfo } from "./indexers";

type WantedAssessment = {
	wanted: boolean;
	profiles: ProfileInfo[];
	bestWeightByProfile: Map<number, number>;
};

function storedQualityId(quality: unknown): number | undefined {
	if (
		typeof quality !== "object" ||
		quality === null ||
		!("quality" in quality) ||
		!quality.quality
	)
		return 0;
	const value = quality.quality;
	return typeof value === "object" &&
		"id" in value &&
		typeof value.id === "number"
		? value.id
		: undefined;
}

/** Assesses loaded media; association, monitoring, and search modes remain with each loader. */
export function assessWantedItem({
	profiles: candidates,
	activeProfileIds,
	existingFiles,
}: {
	profiles: readonly ProfileInfo[];
	activeProfileIds: readonly (number | null)[];
	existingFiles: readonly { quality: unknown }[];
}): WantedAssessment {
	const active = new Set(activeProfileIds);
	const profiles = candidates.filter((profile) => !active.has(profile.id));
	const bestWeightByProfile = new Map<number, number>();
	const qualityIds = existingFiles
		.filter((file) => Boolean(file.quality))
		.map((file) => storedQualityId(file.quality));
	for (const profile of profiles) {
		let best = 0;
		for (const id of qualityIds) {
			if (id !== undefined)
				best = Math.max(best, getProfileWeight(id, profile.items));
		}
		bestWeightByProfile.set(profile.id, best);
	}
	// Custom-format thresholds keep items eligible; release selection decides the actual upgrade.
	const wanted =
		profiles.length > 0 &&
		(existingFiles.length === 0 ||
			profiles.some(
				(profile) =>
					profile.upgradeAllowed &&
					((bestWeightByProfile.get(profile.id) ?? 0) <
						getProfileWeight(profile.cutoff, profile.items) ||
						profile.upgradeUntilCustomFormatScore > 0),
			));
	return { wanted, profiles, bestWeightByProfile };
}
