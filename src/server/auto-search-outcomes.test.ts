import {
	createAutoSearchOutcomeCounts,
	createAutoSearchOutcomeRecorder,
	mergeAutoSearchOutcomeCounts,
	recordAutoSearchOutcome,
} from "src/server/auto-search-outcomes";
import { describe, expect, it } from "vitest";

describe("auto-search outcomes", () => {
	it("creates a serializable zero-count map for every supported reason", () => {
		const outcomes = createAutoSearchOutcomeCounts();

		expect(outcomes).toEqual({
			indexer_failed: 0,
			indexer_skipped: 0,
			all_indexers_exhausted: 0,
			download_client_unavailable: 0,
			download_dispatch_failed: 0,
			pack_search_failed: 0,
			fallback_used: 0,
			no_matching_releases: 0,
		});
		expect(JSON.parse(JSON.stringify(outcomes))).toEqual(outcomes);
	});

	it("increments one reason and returns the same count object", () => {
		const outcomes = createAutoSearchOutcomeCounts();

		const returned = recordAutoSearchOutcome(outcomes, "indexer_failed");

		expect(returned).toBe(outcomes);
		expect(outcomes.indexer_failed).toBe(1);
		expect(outcomes.no_matching_releases).toBe(0);
	});

	it("increments by an explicit positive amount", () => {
		const outcomes = createAutoSearchOutcomeCounts();

		recordAutoSearchOutcome(outcomes, "no_matching_releases", 3);

		expect(outcomes.no_matching_releases).toBe(3);
	});

	it("merges multiple count maps into a new count map", () => {
		const left = createAutoSearchOutcomeCounts();
		const right = createAutoSearchOutcomeCounts();
		recordAutoSearchOutcome(left, "indexer_failed", 2);
		recordAutoSearchOutcome(right, "indexer_failed");
		recordAutoSearchOutcome(right, "fallback_used");

		const merged = mergeAutoSearchOutcomeCounts(left, right);

		expect(merged).toEqual({
			...createAutoSearchOutcomeCounts(),
			indexer_failed: 3,
			fallback_used: 1,
		});
		expect(merged).not.toBe(left);
		expect(merged).not.toBe(right);
	});

	it("creates a recorder bound to one count map", () => {
		const outcomes = createAutoSearchOutcomeCounts();
		const record = createAutoSearchOutcomeRecorder(outcomes);

		record("download_client_unavailable");
		record("download_client_unavailable");

		expect(outcomes.download_client_unavailable).toBe(2);
	});
});
