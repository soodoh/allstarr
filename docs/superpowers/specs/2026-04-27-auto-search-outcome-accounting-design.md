# Auto-Search Outcome Accounting Design

## Purpose

Improve auto-search reliability diagnostics by adding structured outcome accounting to the server-side auto-search result. The change should make tolerated partial failures visible and testable without changing search, ranking, grab, fallback, or UI behavior.

## Context

Allstarr already has a broad reliability backlog and a recently completed first tranche covering job runs, tracked download transitions, external request policy, import side effects, and unmapped-file rollback. The next highest-priority reliability gap is auto-search partial-failure accounting.

`src/server/auto-search.ts` currently returns `searched`, `grabbed`, `errors`, and media-specific detail arrays. That result shape does not clearly distinguish:

- no matching releases after a successful search,
- indexers skipped by pacing, backoff, or limits,
- indexers that failed but were tolerated because another indexer could still run,
- all indexers becoming exhausted during a run,
- pack/author/season search failures followed by fallback,
- missing download clients,
- download dispatch failures.

Servarr-style behavior informs the design: provider failures are tracked separately from release rejection, exact technical causes are logged, download-client unavailability can become a pending/diagnostic condition, and primary UI/status surfaces categories rather than every low-level exception. This design applies the same principle locally by adding typed run outcomes first and leaving UI surfacing for a later decision.

## Scope

In scope:

- Add structured, typed outcome counts to `AutoSearchResult`.
- Preserve existing `searched`, `grabbed`, `errors`, and detail array behavior.
- Preserve existing tolerant handling for indexer failures, provider skips, pack fallback, and dispatch behavior.
- Add focused tests for outcome classification.
- Keep the new result shape safe for future system/task UI display.

Out of scope:

- Changing search query construction, scoring, ranking, or grab selection.
- Adding new provider health checks.
- Persisting new job-run metadata unless existing task flow already stores returned result data.
- Reworking all of `src/server/auto-search.ts`.
- Rendering outcome summaries in the UI in this first pass.

## Outcome Reasons

The initial reason codes should be small and stable:

- `indexer_failed`: an indexer threw during search and the run tolerated it.
- `indexer_skipped`: an indexer was skipped because a gate blocked it, such as backoff, pacing, or query/grab limits.
- `all_indexers_exhausted`: the run stopped early because no configured indexer could be queried.
- `download_client_unavailable`: no enabled client could accept an otherwise selected release.
- `download_dispatch_failed`: a selected release could not be added to the download client because dispatch threw or failed unexpectedly.
- `pack_search_failed`: an author-level or season-level pack search failed.
- `fallback_used`: the run fell back to individual item search after a pack search did not produce a grab or failed.
- `no_matching_releases`: search completed for an item, but no acceptable release was found or selected.

The implementation may include optional metadata such as media type, indexer source, indexer id, or skip reason when that data is already available. Metadata should not be required for the first version of each counter.

## Architecture

Introduce a small outcome accounting boundary rather than scattering counter manipulation through the auto-search coordinator.

Create `src/server/auto-search-outcomes.ts` with:

- `AutoSearchOutcomeReason`: the string union of supported reason codes.
- `AutoSearchOutcomeCounts`: a serializable count map keyed by reason.
- helper functions to initialize, increment, and merge outcome counts.
- optional helpers for media-specific increments if that keeps call sites simpler.

Extend `AutoSearchResult` with an `outcomes` field that is always present and serializable. Existing result fields remain unchanged.

Thread an outcome recorder through the main auto-search paths:

- `searchEnabledIndexers` will accept an optional outcome recorder callback. Existing callers can keep receiving `TEnriched[]`, while auto-search can count indexer failures and skips at the source.
- `dispatchAutoSearchDownload` will accept an optional outcome recorder callback so missing download clients and dispatch failures are distinguishable from a clean `false` without forcing every caller to adopt a new return shape.
- `searchAndGrabForBook`, `searchAndGrabForMovie`, and `searchAndGrabForEpisode` should mark `no_matching_releases` when a search completes but no release is selected.
- author-level and season-level pack paths should mark `pack_search_failed` when they throw and `fallback_used` when individual fallback search is attempted.
- process loops should mark `all_indexers_exhausted` when they stop early due to `anyIndexerAvailable(...)` returning false.

Prefer callbacks and small helper objects over large return-shape rewrites inside `src/server/auto-search.ts`. The module is already large, so the plan should minimize churn while making future extraction easier.

## Error Handling

This change classifies outcomes without turning tolerated partial failures into hard failures.

Existing caught indexer errors continue to be caught and logged, but also increment `indexer_failed`.

Gate skips increment `indexer_skipped`. When the gate reason is available, keep it as metadata or make it visible in tests through a typed detail object if the implementation chooses richer accounting.

When a processing loop exits because all indexers are unavailable, increment `all_indexers_exhausted` once per affected loop or section. The implementation plan should make the counting rule explicit so tests do not depend on incidental loop structure.

Pack-level failures increment `pack_search_failed`. If individual fallback search runs afterward, increment `fallback_used`. Fallback after a successful pack search that simply did not grab anything should also increment `fallback_used`, because it is a useful diagnostic distinction from a single-pass individual search.

No acceptable release after search/scoring increments `no_matching_releases`. This must stay separate from indexer failure so a clean no-match run is not confused with provider instability.

Missing download client increments `download_client_unavailable`. Unexpected dispatch exceptions increment `download_dispatch_failed` while preserving the existing caller-visible behavior.

No reason code should cause an item or run to fail by itself.

## Testing

Use the smallest useful test layer first.

Add `src/server/auto-search-outcomes.test.ts` for:

- initialization with zero counts,
- incrementing one reason,
- merging multiple count sets,
- serializing to plain JSON-compatible data.

Update `src/server/auto-search-indexer-search.test.ts` for:

- failed indexer increments `indexer_failed`,
- blocked indexer increments `indexer_skipped`,
- successful search behavior remains unchanged.

Update `src/server/auto-search-download-dispatch.test.ts` for:

- missing client records `download_client_unavailable`,
- provider/add failures are classified as `download_dispatch_failed` while preserving existing propagation or return behavior,
- successful dispatch behavior remains unchanged.

Update `src/server/auto-search.test.ts` for integration-style coverage:

- author pack failure followed by individual fallback records `pack_search_failed` and `fallback_used`,
- season pack failure followed by individual fallback records the same outcomes,
- all-indexers-exhausted paths record `all_indexers_exhausted`,
- clean no-match paths record `no_matching_releases`,
- existing `searched`, `grabbed`, `errors`, and detail behavior remains stable.

Verification commands:

```bash
bun run test -- src/server/auto-search-outcomes.test.ts src/server/auto-search-indexer-search.test.ts src/server/auto-search-download-dispatch.test.ts src/server/auto-search.test.ts
bun run typecheck
bun run lint
```

## Implementation Constraints

- Do not edit generated files such as `src/routeTree.gen.ts` or files under `.worktrees/`.
- Keep changes focused on server auto-search accounting.
- Do not add TypeScript or lint suppression comments.
- Keep all new data structures serializable.
- Preserve existing public behavior unless a test exposes a real reliability bug.

## Handoff

After this spec is approved, the next step is to use the writing-plans workflow to create a task-by-task implementation plan. That plan should include exact files, test-first steps, expected failures, minimal implementation steps, verification commands, and commit boundaries.
