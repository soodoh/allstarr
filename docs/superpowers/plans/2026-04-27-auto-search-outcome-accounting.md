# Auto-Search Outcome Accounting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add structured auto-search outcome counts so tolerated partial failures are visible and testable without changing search, grab, fallback, or UI behavior.

**Architecture:** Introduce a small `auto-search-outcomes` helper that owns the typed reason codes and serializable counters. Thread an optional recorder callback through indexer search and download dispatch, then wire `runAutoSearch` and related auto-search paths to increment outcomes while preserving existing return fields.

**Tech Stack:** TypeScript, Bun, Vitest, Drizzle-backed server modules, Biome.

---

## Target File Structure

**Create:**
- `src/server/auto-search-outcomes.ts` - typed outcome reason constants, count map creation, mutation, merge, and recorder helper.
- `src/server/auto-search-outcomes.test.ts` - focused unit tests for outcome helper behavior.

**Modify:**
- `src/server/auto-search-indexer-search.ts` - accept optional outcome recorder and record indexer failures/skips.
- `src/server/auto-search-indexer-search.test.ts` - cover `indexer_failed` and `indexer_skipped`.
- `src/server/auto-search-download-dispatch.ts` - accept optional outcome recorder and record missing client / dispatch failure.
- `src/server/auto-search-download-dispatch.test.ts` - cover `download_client_unavailable` and `download_dispatch_failed`.
- `src/server/auto-search.ts` - add `outcomes` to `AutoSearchResult`, initialize it, pass recorder callbacks, and record run-level outcomes.
- `src/server/auto-search.test.ts` - update zero-result expectations and add integration coverage for run-level, no-match, and fallback outcomes.

Do not edit `src/routeTree.gen.ts` or files under `.worktrees/`.

## Task 1: Outcome Helper

**Files:**
- Create: `src/server/auto-search-outcomes.ts`
- Create: `src/server/auto-search-outcomes.test.ts`

- [ ] **Step 1: Write the failing helper tests**

Create `src/server/auto-search-outcomes.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the helper tests and verify they fail**

Run:

```bash
bun run test -- src/server/auto-search-outcomes.test.ts
```

Expected: FAIL because `src/server/auto-search-outcomes.ts` does not exist.

- [ ] **Step 3: Implement the helper**

Create `src/server/auto-search-outcomes.ts`:

```ts
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
```

- [ ] **Step 4: Run the helper tests and verify they pass**

Run:

```bash
bun run test -- src/server/auto-search-outcomes.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit the helper**

Run:

```bash
git add src/server/auto-search-outcomes.ts src/server/auto-search-outcomes.test.ts
git commit -m "feat(reliability): add auto-search outcome counters"
```

## Task 2: Indexer Search Outcome Recording

**Files:**
- Modify: `src/server/auto-search-indexer-search.ts`
- Modify: `src/server/auto-search-indexer-search.test.ts`

- [ ] **Step 1: Add failing tests for indexer outcome callbacks**

In `src/server/auto-search-indexer-search.test.ts`, add `recordOutcome: vi.fn()` to the existing "isolates per-indexer failures and returns successful results" test options and add this assertion after the existing `logError` assertion:

```ts
expect(recordOutcome).toHaveBeenCalledWith("indexer_failed");
```

The local declarations at the start of that test should include:

```ts
const logError = vi.fn();
const recordOutcome = vi.fn();
```

The options passed to `searchEnabledIndexers` in that test should include both:

```ts
logError,
onOutcome: recordOutcome,
```

The assertions at the end of that test should include:

```ts
expect(recordOutcome).toHaveBeenCalledWith("indexer_failed");
```

In the "logs and skips non-pacing blocked indexers" test, add `const recordOutcome = vi.fn();`, pass `onOutcome: recordOutcome`, and assert:

```ts
expect(recordOutcome).toHaveBeenCalledWith("indexer_skipped");
```

- [ ] **Step 2: Run the indexer search tests and verify they fail**

Run:

```bash
bun run test -- src/server/auto-search-indexer-search.test.ts
```

Expected: FAIL because `onOutcome` is not part of `SearchEnabledIndexersOptions` and no callback is invoked.

- [ ] **Step 3: Add the optional recorder to the indexer search module**

In `src/server/auto-search-indexer-search.ts`, add this import:

```ts
import type { AutoSearchOutcomeRecorder } from "./auto-search-outcomes";
```

Add this property to `SearchEnabledIndexersOptions`:

```ts
	onOutcome?: AutoSearchOutcomeRecorder;
```

Update `waitOrSkipBlockedIndexer` to accept and use the recorder:

```ts
async function waitOrSkipBlockedIndexer(
	indexer: EnabledIndexer,
	gate: Exclude<GateResult, { allowed: true }>,
	logInfo: (prefix: string, message: string) => void,
	logPrefix: string,
	sleep: (ms: number) => Promise<void> | void,
	onOutcome?: AutoSearchOutcomeRecorder,
): Promise<boolean> {
	if (gate.reason === "pacing" && gate.waitMs) {
		await sleep(gate.waitMs);
		return true;
	}

	onOutcome?.("indexer_skipped");
	logInfo(logPrefix, `Indexer "${indexer.name}" skipped: ${gate.reason}`);
	return false;
}
```

Destructure `onOutcome` in `searchEnabledIndexers` and pass it to `waitOrSkipBlockedIndexer`:

```ts
	onOutcome,
```

```ts
const shouldQuery = await waitOrSkipBlockedIndexer(
	indexer,
	gate,
	logInfo,
	logPrefix,
	sleep,
	onOutcome,
);
```

Inside the existing `catch (error)` block, record the failure before logging:

```ts
onOutcome?.("indexer_failed");
logError(logPrefix, `Indexer "${indexer.name}" failed`, error);
```

- [ ] **Step 4: Run the indexer search tests and verify they pass**

Run:

```bash
bun run test -- src/server/auto-search-indexer-search.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit indexer outcome recording**

Run:

```bash
git add src/server/auto-search-indexer-search.ts src/server/auto-search-indexer-search.test.ts
git commit -m "feat(reliability): record auto-search indexer outcomes"
```

## Task 3: Download Dispatch Outcome Recording

**Files:**
- Modify: `src/server/auto-search-download-dispatch.ts`
- Modify: `src/server/auto-search-download-dispatch.test.ts`

- [ ] **Step 1: Add failing tests for dispatch outcomes**

In `src/server/auto-search-download-dispatch.test.ts`, update the "returns false and skips provider work when no download client resolves" test by adding:

```ts
const recordOutcome = vi.fn();
```

Pass it into `dispatchAutoSearchDownload`:

```ts
onOutcome: recordOutcome,
```

Add this assertion:

```ts
expect(recordOutcome).toHaveBeenCalledWith("download_client_unavailable");
```

Add this new test near the other dispatch tests:

```ts
it("records dispatch failure before preserving provider errors", async () => {
	const providerError = new Error("client rejected release");
	const provider = {
		addDownload: vi.fn().mockRejectedValue(providerError),
	};
	const recordOutcome = vi.fn();

	await expect(
		dispatchAutoSearchDownload({
			getProvider: vi.fn().mockResolvedValue(provider),
			insertHistory: vi.fn(),
			insertTrackedDownload: vi.fn(),
			logWarn: vi.fn(),
			onOutcome: recordOutcome,
			release: createRelease(),
			resolveDownloadClient: () => ({
				client: createClient(),
				combinedTag: "client-tag,indexer-tag",
			}),
			trackedDownload: ({ downloadId }) => ({ downloadId }),
			history: ({ release }) => ({ eventType: "bookGrabbed", release }),
		}),
	).rejects.toThrow("client rejected release");

	expect(recordOutcome).toHaveBeenCalledWith("download_dispatch_failed");
});
```

- [ ] **Step 2: Run the dispatch tests and verify they fail**

Run:

```bash
bun run test -- src/server/auto-search-download-dispatch.test.ts
```

Expected: FAIL because `onOutcome` is not part of `DispatchAutoSearchDownloadOptions` and no callback is invoked.

- [ ] **Step 3: Add the optional recorder to dispatch**

In `src/server/auto-search-download-dispatch.ts`, add this import:

```ts
import type { AutoSearchOutcomeRecorder } from "./auto-search-outcomes";
```

Add this property to `DispatchAutoSearchDownloadOptions`:

```ts
	onOutcome?: AutoSearchOutcomeRecorder;
```

Destructure `onOutcome` in `dispatchAutoSearchDownload`.

In the missing-client branch, record before logging:

```ts
if (!resolved) {
	onOutcome?.("download_client_unavailable");
	logWarn(
		"auto-search",
		`No enabled ${release.protocol} download client for "${release.title}"`,
	);
	return false;
}
```

Wrap the provider call so dispatch failures are recorded and rethrown:

```ts
let downloadId: string | null;
try {
	downloadId = await provider.addDownload(buildConnectionConfig(client), {
		url: release.downloadUrl,
		torrentData: null,
		nzbData: null,
		category: null,
		tag: combinedTag,
		savePath: null,
	});
} catch (error) {
	onOutcome?.("download_dispatch_failed");
	throw error;
}
```

- [ ] **Step 4: Run the dispatch tests and verify they pass**

Run:

```bash
bun run test -- src/server/auto-search-download-dispatch.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit dispatch outcome recording**

Run:

```bash
git add src/server/auto-search-download-dispatch.ts src/server/auto-search-download-dispatch.test.ts
git commit -m "feat(reliability): record auto-search dispatch outcomes"
```

## Task 4: Wire Outcomes Into `runAutoSearch`

**Files:**
- Modify: `src/server/auto-search.ts`
- Modify: `src/server/auto-search.test.ts`

- [ ] **Step 1: Add failing run-level outcome assertions**

In `src/server/auto-search.test.ts`, update the zero-indexer expectation in `describe("runAutoSearch")` to include zeroed outcomes:

```ts
expect(result).toEqual({
	searched: 0,
	grabbed: 0,
	errors: 0,
	details: [],
	movieDetails: [],
	episodeDetails: [],
	outcomes: {
		indexer_failed: 0,
		indexer_skipped: 0,
		all_indexers_exhausted: 0,
		download_client_unavailable: 0,
		download_dispatch_failed: 0,
		pack_search_failed: 0,
		fallback_used: 0,
		no_matching_releases: 0,
	},
});
```

In "skips indexers that are not allowed by rate limiter", add:

```ts
expect(result.outcomes.indexer_skipped).toBe(1);
expect(result.outcomes.no_matching_releases).toBe(1);
```

In "stops early when all indexers are exhausted", capture the result and assert:

```ts
const result = await runAutoSearch({ bookIds: [10, 11] });

expect(result.outcomes.all_indexers_exhausted).toBe(1);
```

In "records error when searchNewznab throws", add:

```ts
expect(result.outcomes.indexer_failed).toBe(1);
expect(result.outcomes.no_matching_releases).toBe(1);
```

In "does not grab when no matching download client exists", add:

```ts
expect(result.outcomes.download_client_unavailable).toBe(1);
expect(result.outcomes.no_matching_releases).toBe(1);
```

In "searches but does not grab when no releases found for movie", add:

```ts
expect(result.outcomes.no_matching_releases).toBe(1);
```

- [ ] **Step 2: Run the auto-search tests and verify they fail**

Run:

```bash
bun run test -- src/server/auto-search.test.ts
```

Expected: FAIL because `AutoSearchResult` does not include `outcomes`.

- [ ] **Step 3: Import and initialize outcomes**

In `src/server/auto-search.ts`, add this import:

```ts
import {
	createAutoSearchOutcomeCounts,
	createAutoSearchOutcomeRecorder,
	type AutoSearchOutcomeCounts,
	type AutoSearchOutcomeRecorder,
} from "./auto-search-outcomes";
```

Extend `AutoSearchResult`:

```ts
type AutoSearchResult = {
	searched: number;
	grabbed: number;
	errors: number;
	details: SearchDetail[];
	movieDetails?: MovieSearchDetail[];
	episodeDetails?: EpisodeSearchDetail[];
	outcomes: AutoSearchOutcomeCounts;
};
```

Initialize outcomes in `runAutoSearch`:

```ts
const result: AutoSearchResult = {
	searched: 0,
	grabbed: 0,
	errors: 0,
	details: [],
	movieDetails: [],
	episodeDetails: [],
	outcomes: createAutoSearchOutcomeCounts(),
};
const recordOutcome = createAutoSearchOutcomeRecorder(result.outcomes);
```

- [ ] **Step 4: Pass the recorder through book, movie, and episode processing**

Update these function signatures:

```ts
async function searchIndexers(
	ixs: EnabledIndexers,
	query: string,
	categories: number[],
	bookParams?: { author: string; title: string },
	contentType?: "book" | "tv",
	logPrefix = "[auto-search]",
	onOutcome?: AutoSearchOutcomeRecorder,
): Promise<IndexerRelease[]> {
```

```ts
async function searchAndGrabForBook(
	book: WantedBook,
	ixs: EnabledIndexers,
	onOutcome?: AutoSearchOutcomeRecorder,
): Promise<SearchDetail> {
```

```ts
async function processIndividualBooks(
	booksToSearch: WantedBook[],
	ixs: EnabledIndexers,
	result: AutoSearchResult,
	delay: number,
	onOutcome: AutoSearchOutcomeRecorder,
): Promise<void> {
```

```ts
async function processWantedBooks(
	wantedBooks: WantedBook[],
	ixs: EnabledIndexers,
	result: AutoSearchResult,
	delay: number,
	onOutcome: AutoSearchOutcomeRecorder,
): Promise<void> {
```

```ts
async function searchAndGrabForMovie(
	movie: WantedMovie,
	ixs: EnabledIndexers,
	onOutcome?: AutoSearchOutcomeRecorder,
): Promise<MovieSearchDetail> {
```

```ts
async function processWantedMovies(
	wantedMovies: WantedMovie[],
	ixs: EnabledIndexers,
	result: AutoSearchResult,
	delay: number,
	onOutcome: AutoSearchOutcomeRecorder,
): Promise<void> {
```

```ts
async function searchAndGrabForEpisode(
	episode: WantedEpisode,
	ixs: EnabledIndexers,
	onOutcome?: AutoSearchOutcomeRecorder,
): Promise<EpisodeSearchDetail> {
```

```ts
async function processSeasonEpisodes(
	show: { id: number; title: string },
	seasonNumber: number,
	seasonEpisodes: WantedEpisode[],
	seasonMap: Map<number, WantedEpisode[]>,
	ixs: EnabledIndexers,
	result: AutoSearchResult,
	delay: number,
	onOutcome: AutoSearchOutcomeRecorder,
): Promise<void> {
```

```ts
async function processWantedEpisodes(
	wantedEpisodes: WantedEpisode[],
	ixs: EnabledIndexers,
	result: AutoSearchResult,
	delay: number,
	onOutcome: AutoSearchOutcomeRecorder,
): Promise<void> {
```

Update each caller to pass `recordOutcome` or `onOutcome` through the chain. The run-level calls should become:

```ts
await processWantedBooks(wantedBooks, ixs, result, delayBetweenBooks, recordOutcome);
```

```ts
await processWantedMovies(
	wantedMovies,
	ixs,
	result,
	delayBetweenBooks,
	recordOutcome,
);
```

```ts
await processWantedEpisodes(
	wantedEpisodes,
	ixs,
	result,
	delayBetweenBooks,
	recordOutcome,
);
```

- [ ] **Step 5: Record indexer and no-match outcomes in search paths**

In every `searchEnabledIndexers` call inside `src/server/auto-search.ts`, add:

```ts
onOutcome,
```

In `searchIndexers`, pass `onOutcome` to `searchEnabledIndexers`.

In `searchAndGrabForBook`, after `detail.searched = true`, record no-match before returning when no releases exist:

```ts
if (allReleases.length === 0) {
	onOutcome?.("no_matching_releases");
	return detail;
}
```

After `grabPerProfile(scored, book)`, record no-match when no grab happened:

```ts
if (grabbedTitles.length > 0) {
	detail.grabbed = true;
	detail.releaseTitle = grabbedTitles.join(", ");
} else {
	onOutcome?.("no_matching_releases");
}
```

In `searchAndGrabForMovie`, after `detail.searched = true`, record no-match before returning when no releases exist:

```ts
if (allReleases.length === 0) {
	onOutcome?.("no_matching_releases");
	return detail;
}
```

After `grabPerProfileForMovie(scored, movie, onOutcome)`, record no-match when no grab happened:

```ts
if (grabbedTitles.length > 0) {
	detail.grabbed = true;
	detail.releaseTitle = grabbedTitles.join(", ");
} else {
	onOutcome?.("no_matching_releases");
}
```

In `searchAndGrabForEpisode`, after `detail.searched = true`, record no-match before returning when no releases exist:

```ts
if (allReleases.length === 0) {
	onOutcome?.("no_matching_releases");
	return detail;
}
```

After `grabPerProfileForEpisode(scored, episode, onOutcome)`, record no-match when no grab happened:

```ts
if (grabbedTitles.length > 0) {
	detail.grabbed = true;
	detail.releaseTitle = grabbedTitles.join(", ");
} else {
	onOutcome?.("no_matching_releases");
}
```

- [ ] **Step 6: Record all-indexers-exhausted outcomes**

In `processIndividualBooks`, before `break` in the `!anyIndexerAvailable(...)` branch, add:

```ts
onOutcome("all_indexers_exhausted");
```

In `processWantedBooks`, before `break` in the `!anyIndexerAvailable(...)` branch, add:

```ts
onOutcome("all_indexers_exhausted");
```

In `processWantedMovies`, before `break` in the `!anyIndexerAvailable(...)` branch, add:

```ts
onOutcome("all_indexers_exhausted");
```

In `processSeasonEpisodes`, before `break` in the individual episode fallback `!anyIndexerAvailable(...)` branch, add:

```ts
onOutcome("all_indexers_exhausted");
```

In `processWantedEpisodes`, add the same line before both existing `break` statements in `!anyIndexerAvailable(...)` branches:

```ts
if (
	!anyIndexerAvailable(
		ixs.manual.map((m) => m.id),
		ixs.synced.map((s) => s.id),
	)
) {
	onOutcome("all_indexers_exhausted");
	logInfo("auto-search", "All indexers exhausted, stopping cycle early");
	break;
}
```

```ts
if (
	!anyIndexerAvailable(
		ixs.manual.map((m) => m.id),
		ixs.synced.map((s) => s.id),
	)
) {
	onOutcome("all_indexers_exhausted");
	break;
}
```

- [ ] **Step 7: Record missing book download clients**

In `grabRelease`, add an optional recorder parameter:

```ts
async function grabRelease(
	release: IndexerRelease,
	book: WantedBook,
	profileId: number,
	onOutcome?: AutoSearchOutcomeRecorder,
): Promise<boolean> {
```

In the no matching clients branch, record before logging:

```ts
if (matchingClients.length === 0) {
	onOutcome?.("download_client_unavailable");
	logWarn(
		"rss-sync",
		`No enabled ${release.protocol} download client for "${release.title}"`,
	);
	return false;
}
```

Update the call in `grabPerProfile` by adding an optional recorder parameter to that function and passing it through:

```ts
async function grabPerProfile(
	scored: IndexerRelease[],
	book: WantedBook,
	onOutcome?: AutoSearchOutcomeRecorder,
): Promise<string[]> {
```

```ts
const grabbed = await grabRelease(bestRelease, book, profile.id, onOutcome);
```

Then update `searchAndGrabForBook`:

```ts
const grabbedTitles = await grabPerProfile(scored, book, onOutcome);
```

- [ ] **Step 8: Pass recorder into movie and episode dispatch**

In `grabPerProfileForMovie`, add an optional recorder parameter:

```ts
async function grabPerProfileForMovie(
	scored: IndexerRelease[],
	movie: WantedMovie,
	onOutcome?: AutoSearchOutcomeRecorder,
): Promise<string[]> {
```

Update the movie grab call inside that function:

```ts
const grabbed = await grabReleaseForMovie(
	bestRelease,
	movie,
	profile.id,
	onOutcome,
);
```

In `grabReleaseForMovie`, add `onOutcome?: AutoSearchOutcomeRecorder` to the function signature:

```ts
async function grabReleaseForMovie(
	release: IndexerRelease,
	movie: WantedMovie,
	profileId: number,
	onOutcome?: AutoSearchOutcomeRecorder,
): Promise<boolean> {
```

Include this option in the `dispatchAutoSearchDownload` call:

```ts
onOutcome,
```

In `searchAndGrabForMovie`, pass the recorder when grabbing:

```ts
const grabbedTitles = await grabPerProfileForMovie(scored, movie, onOutcome);
```

In `grabPerProfileForEpisode`, add an optional recorder parameter:

```ts
async function grabPerProfileForEpisode(
	scored: IndexerRelease[],
	episode: WantedEpisode,
	onOutcome?: AutoSearchOutcomeRecorder,
): Promise<string[]> {
```

Update the episode grab call inside that function:

```ts
const grabbed = await grabReleaseForEpisode(
	bestRelease,
	episode,
	profile.id,
	onOutcome,
);
```

In `grabReleaseForEpisode`, add `onOutcome?: AutoSearchOutcomeRecorder` to the function signature:

```ts
async function grabReleaseForEpisode(
	release: IndexerRelease,
	episode: WantedEpisode,
	profileId: number,
	onOutcome?: AutoSearchOutcomeRecorder,
): Promise<boolean> {
```

Include this option in the `dispatchAutoSearchDownload` call:

```ts
onOutcome,
```

In `searchAndGrabForEpisode`, pass the recorder when grabbing:

```ts
const grabbedTitles = await grabPerProfileForEpisode(scored, episode, onOutcome);
```

- [ ] **Step 9: Run the auto-search tests and verify they pass**

Run:

```bash
bun run test -- src/server/auto-search.test.ts
```

Expected: PASS.

- [ ] **Step 10: Commit run-level outcome wiring**

Run:

```bash
git add src/server/auto-search.ts src/server/auto-search.test.ts
git commit -m "feat(reliability): account for auto-search run outcomes"
```

## Task 5: Pack Fallback Outcomes

**Files:**
- Modify: `src/server/auto-search.ts`
- Modify: `src/server/auto-search.test.ts`

- [ ] **Step 1: Add failing pack fallback assertions**

In `src/server/auto-search.test.ts`, in "falls back to individual book search when author search finds nothing", add:

```ts
expect(result.outcomes.fallback_used).toBe(1);
```

In "does individual episode fallback when season search fails", add:

```ts
expect(result.outcomes.fallback_used).toBe(1);
```

Add this new author pack failure test under `describe("pack handling — author-level search")`:

```ts
it("records author pack failure before individual fallback", async () => {
	const profile = makeProfile();
	const callIdx = { n: 0 };
	mocks.selectAll.mockImplementation(() => {
		callIdx.n += 1;
		switch (callIdx.n) {
			case 1:
				return [
					{
						id: 1,
						name: "ix",
						baseUrl: "http://ix",
						apiPath: "/api",
						apiKey: "key1",
						enableRss: true,
						priority: 1,
					},
				];
			case 2:
				return [];
			case 3:
				return [
					{
						id: 10,
						title: "Book A",
						lastSearchedAt: null,
						authorId: 1,
						authorName: "AuthorX",
						authorMonitored: true,
					},
					{
						id: 11,
						title: "Book B",
						lastSearchedAt: null,
						authorId: 1,
						authorName: "AuthorX",
						authorMonitored: true,
					},
				];
			case 4:
				return [{ editionId: 100, profileId: profile.id }];
			case 5:
				return [profile];
			case 6:
				return [];
			case 7:
				return [];
			case 8:
				return [{ editionId: 101, profileId: profile.id }];
			case 9:
				return [profile];
			case 10:
				return [];
			case 11:
				return [];
			default:
				return [];
		}
	});

	mocks.searchNewznab
		.mockRejectedValueOnce(new Error("author search failed"))
		.mockResolvedValue([]);

	const result = await runAutoSearch({
		bookIds: [10, 11],
		delayBetweenBooks: 0,
	});

	expect(result.outcomes.pack_search_failed).toBe(1);
	expect(result.outcomes.fallback_used).toBe(1);
});
```

- [ ] **Step 2: Run the auto-search tests and verify pack assertions fail**

Run:

```bash
bun run test -- src/server/auto-search.test.ts
```

Expected: FAIL because pack fallback outcomes are not recorded yet.

- [ ] **Step 3: Record author-level fallback outcomes**

In `processWantedBooks`, inside the `if (authorBooks.length >= 2 && authorName !== "__no_author__")` block, update the `catch`:

```ts
} catch (error) {
	onOutcome("pack_search_failed");
	logError(
		"auto-search",
		`Error in author-level search for "${authorName}"`,
		error,
	);
}
onOutcome("fallback_used");
await sleep(delay);
```

Keep the existing `continue` when `packResult.grabbed` is true so fallback is not recorded for successful pack grabs.

- [ ] **Step 4: Record season-level fallback outcomes**

In `processSeasonEpisodes`, inside the `if (seasonEpisodes.length >= 2)` block, update the `catch`:

```ts
} catch (error) {
	onOutcome("pack_search_failed");
	logError(
		"auto-search",
		`Error in season-level search for "${show.title}" S${padNumber(seasonNumber)}`,
		error,
	);
}
onOutcome("fallback_used");
await sleep(delay);
```

Keep the existing `return` when `seasonResult.grabbed` is true so fallback is not recorded for successful season pack grabs.

- [ ] **Step 5: Run the auto-search tests and verify they pass**

Run:

```bash
bun run test -- src/server/auto-search.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit pack fallback outcomes**

Run:

```bash
git add src/server/auto-search.ts src/server/auto-search.test.ts
git commit -m "feat(reliability): record auto-search fallback outcomes"
```

## Task 6: Final Verification

**Files:**
- Verify all files changed in Tasks 1-5.

- [ ] **Step 1: Run the focused test set**

Run:

```bash
bun run test -- src/server/auto-search-outcomes.test.ts src/server/auto-search-indexer-search.test.ts src/server/auto-search-download-dispatch.test.ts src/server/auto-search.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run typecheck**

Run:

```bash
bun run typecheck
```

Expected: PASS.

- [ ] **Step 3: Run lint**

Run:

```bash
bun run lint
```

Expected: PASS.

- [ ] **Step 4: Review the diff for behavior scope**

Run:

```bash
git diff --stat HEAD~5..HEAD
git diff HEAD~5..HEAD -- src/server/auto-search.ts src/server/auto-search-indexer-search.ts src/server/auto-search-download-dispatch.ts src/server/auto-search-outcomes.ts
```

Expected: Diff is limited to outcome accounting, optional callback plumbing, and tests. No search scoring, ranking, route, schema, or generated files changed.

- [ ] **Step 5: Confirm working tree status**

Run:

```bash
git status --short
```

Expected: no unexpected uncommitted files. If verification generated coverage or temp files, remove only those generated artifacts.
