import type { AutoSearchGrabResult } from "./auto-search-download-dispatch";
import type { PackContext, ProfileInfo } from "./indexers";
import { isPackQualified } from "./indexers";
import { getProfileWeight, isFormatInProfile } from "./indexers/format-parser";
import type { IndexerRelease } from "./indexers/types";

function isUpgradeCeiling(
	profile: ProfileInfo,
	weight: number,
	cfScore: number,
): boolean {
	return (
		weight >= getProfileWeight(profile.cutoff, profile.items) &&
		(profile.upgradeUntilCustomFormatScore === 0 ||
			cfScore >= profile.upgradeUntilCustomFormatScore)
	);
}

function isUpgradeCandidate(
	release: IndexerRelease,
	profile: ProfileInfo,
	weight: number,
	cfScore: number,
): boolean {
	const releaseWeight = getProfileWeight(release.quality.id, profile.items);
	return (
		releaseWeight > weight ||
		(releaseWeight === weight && release.cfScore > cfScore)
	);
}

export type ProfileGrabResult =
	| { status: "grabbed"; release: IndexerRelease }
	| { status: "not_grabbed" | "deferred" };

/** Own ranking and cap fallback together so callers cannot grab a future upgrade. */
export async function grabBestReleaseForProfile({
	releases,
	profile,
	bestExistingWeight,
	bestExistingCFScore = 0,
	blocklistedTitles,
	grabbedGuids,
	packContext = null,
	grab,
}: {
	releases: IndexerRelease[];
	profile: ProfileInfo;
	bestExistingWeight: number;
	bestExistingCFScore?: number;
	blocklistedTitles: Set<string>;
	grabbedGuids: Set<string>;
	packContext?: PackContext | null;
	grab: (release: IndexerRelease) => Promise<AutoSearchGrabResult>;
}): Promise<ProfileGrabResult> {
	if (
		bestExistingWeight > 0 &&
		(!profile.upgradeAllowed ||
			isUpgradeCeiling(profile, bestExistingWeight, bestExistingCFScore))
	) {
		return { status: "not_grabbed" };
	}

	const candidates = releases.filter(
		(release) =>
			isFormatInProfile(release.quality.id, profile.items) &&
			release.rejections.length === 0 &&
			!blocklistedTitles.has(release.title) &&
			!grabbedGuids.has(release.guid) &&
			release.cfScore >= profile.minCustomFormatScore &&
			isPackQualified(release, packContext) &&
			(bestExistingWeight === 0 ||
				isUpgradeCandidate(
					release,
					profile,
					bestExistingWeight,
					bestExistingCFScore,
				)),
	);
	const capped = new Set<IndexerRelease>();

	while (true) {
		let best: IndexerRelease | undefined;
		for (const release of candidates) {
			if (capped.has(release)) continue;
			if (
				!best ||
				isUpgradeCandidate(
					release,
					profile,
					getProfileWeight(best.quality.id, profile.items),
					best.cfScore,
				)
			) {
				best = release;
			}
		}

		if (!best) {
			return { status: capped.size > 0 ? "deferred" : "not_grabbed" };
		}
		const weight = getProfileWeight(best.quality.id, profile.items);
		if (
			profile.upgradeAllowed &&
			!isUpgradeCeiling(profile, weight, best.cfScore) &&
			[...capped].some((release) =>
				isUpgradeCandidate(release, profile, weight, best.cfScore),
			)
		) {
			return { status: "deferred" };
		}

		const result = await grab(best);
		if (result.status === "grab_limit_reached") {
			capped.add(best);
			continue;
		}
		return result.status === "grabbed"
			? { status: "grabbed", release: best }
			: { status: "not_grabbed" };
	}
}
