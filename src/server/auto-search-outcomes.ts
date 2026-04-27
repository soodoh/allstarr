export const AUTO_SEARCH_OUTCOME_REASONS = [
	"indexer_failed",
	"indexer_skipped",
	"all_indexers_exhausted",
	"download_client_unavailable",
	"download_dispatch_failed",
	"pack_search_failed",
	"fallback_used",
	"no_matching_releases",
] as const;

export type AutoSearchOutcomeReason =
	(typeof AUTO_SEARCH_OUTCOME_REASONS)[number];

export type AutoSearchOutcomeCounts = Record<AutoSearchOutcomeReason, number>;

export type AutoSearchOutcomeRecorder = (
	reason: AutoSearchOutcomeReason,
	amount?: number,
) => void;

export function createAutoSearchOutcomeCounts(): AutoSearchOutcomeCounts {
	return Object.fromEntries(
		AUTO_SEARCH_OUTCOME_REASONS.map((reason) => [reason, 0]),
	) as AutoSearchOutcomeCounts;
}

export function recordAutoSearchOutcome(
	outcomes: AutoSearchOutcomeCounts,
	reason: AutoSearchOutcomeReason,
	amount = 1,
): AutoSearchOutcomeCounts {
	outcomes[reason] += amount;
	return outcomes;
}

export function createAutoSearchOutcomeRecorder(
	outcomes: AutoSearchOutcomeCounts,
): AutoSearchOutcomeRecorder {
	return (reason, amount) => {
		recordAutoSearchOutcome(outcomes, reason, amount);
	};
}

export function mergeAutoSearchOutcomeCounts(
	...counts: AutoSearchOutcomeCounts[]
): AutoSearchOutcomeCounts {
	const merged = createAutoSearchOutcomeCounts();
	for (const count of counts) {
		for (const reason of AUTO_SEARCH_OUTCOME_REASONS) {
			merged[reason] += count[reason];
		}
	}
	return merged;
}
