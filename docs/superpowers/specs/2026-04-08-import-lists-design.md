# Import Lists Design

Date: 2026-04-08
Status: Approved for planning

## Summary

Phase 1 will replace the current exclusions-only import-lists screen with a real import-list platform for Allstarr. The platform will support provider-backed list sync, normalized candidate storage, library matching, and controlled import behavior.

This phase is intentionally scoped to a shared import-list architecture plus three mainstream watchlist providers:

- IMDb
- Trakt
- Plex

Phase 1 is allowed to be movie/TV-heavy. The architecture must still support later book providers without redesigning the core pipeline.

## Goals

- Introduce a real import-list system for books, movies, and TV.
- Ship a shared ingestion and sync platform that later providers can reuse.
- Support IMDb, Trakt, and Plex in phase 1.
- Allow each list to run in either auto-import or review-only mode.
- Record sync history, candidate state, and actionable failure reasons.
- Preserve the current import-list exclusions workflow inside the broader feature.

## Non-Goals

- Full provider parity with every import-list source supported across Radarr, Sonarr, and legacy Readarr in phase 1.
- Phase 1 book-provider coverage.
- Reproducing every Arr-specific toggle or provider-specific edge-case option in the first release.
- Building a separate import pipeline per provider.

## Current State

Today, `Settings > Import Lists` only manages exclusions. It does not persist provider configurations, fetch external list items, normalize them, match them against the library, or create new monitored media from remote lists.

The existing codebase already has several pieces this feature can build on:

- add flows for books, movies, and TV
- system tasks and task status UI
- history/events infrastructure
- settings pages and admin-only configuration routes

## Phase Plan

### Phase 1

- Shared import-list platform
- Provider adapters for IMDb, Trakt, and Plex
- Movie and TV import behavior
- Review-only and auto-import modes
- Sync observability in UI and task history

### Later Phases

- Book-oriented providers
- Generic RSS/JSON list ingestion
- Additional Radarr/Sonarr/Readarr-compatible providers
- More advanced provider-specific configuration
- Richer manual review and bulk actions

## Architecture

Phase 1 should be built around four provider-agnostic layers:

1. Provider configuration and validation
2. Sync runner
3. Normalized candidate storage
4. Import decision engine

Provider adapters are responsible only for:

- authenticating
- fetching list items
- mapping provider payloads into a shared candidate shape

Everything after normalization must be shared. That keeps the design scalable and avoids hard-coding IMDb, Trakt, or Plex behavior deep into matching and import logic.

## Data Model

Phase 1 should add three core tables.

### `import_lists`

Stores one row per configured list.

Required fields:

- `id`
- `name`
- `provider`
- `enabled`
- `media_types`
- `config_json`
- `mode`
- `monitor_behavior`
- `apply_search_on_add`
- `root_folder_defaults`
- `profile_defaults`
- `created_at`
- `updated_at`

Purpose:

- persist provider config
- store default import behavior
- define whether a list auto-imports or only produces review candidates

### `import_list_sync_runs`

Stores one row per sync attempt.

Required fields:

- `id`
- `import_list_id`
- `started_at`
- `finished_at`
- `status`
- `summary_json`
- `error_message`

Purpose:

- expose last-sync status in UI
- retain operator-visible observability
- support debugging without reading raw logs

### `import_list_candidates`

Stores normalized items fetched from a list.

Required fields:

- `id`
- `import_list_id`
- `provider_item_id`
- `provider_item_hash`
- `media_type`
- `title`
- `year`
- `external_ids_json`
- `raw_payload_json`
- `first_seen_at`
- `last_seen_at`
- `sync_run_id`
- `match_status`
- `match_target_type`
- `match_target_id`
- `import_status`
- `review_reason`

Purpose:

- maintain a durable candidate history across syncs
- support dedupe across repeated runs
- track whether an item is already present, imported, skipped, failed, or needs review

## Candidate Shape

Each normalized candidate should include enough information for matching without depending on provider-specific code:

- provider name
- list identity
- provider item identity
- media type
- canonical title
- release year when available
- external IDs when available
- raw provider snapshot
- sync timestamps
- match status
- import status

Identifier priority should be explicit:

- movies: prefer IMDb or TMDb IDs
- TV: prefer TVDB, TMDb, IMDb, or Trakt-derived stable IDs when available
- books later: phase 1 architecture must leave room for ISBN, ASIN, Hardcover, or provider-native identifiers

## Provider Adapters

Phase 1 includes:

- IMDb
- Trakt
- Plex

Phase 1 provider capability is limited to movie and TV ingestion. The shared platform must support all media types structurally, but phase 1 provider configuration must only expose media types each provider actually supports. Books remain a later provider batch.

Each adapter should expose the same internal contract:

- validate configuration
- fetch remote list items
- normalize items into shared candidates
- return provider-specific warnings without stopping the whole sync unless the entire fetch is invalid

Phase 1 intentionally avoids provider-specific logic outside these adapters unless the logic belongs to generic matching or import rules.

## UI Design

`Settings > Import Lists` should become a real management area with tabs.

### Lists Tab

Shows configured import lists with:

- provider
- enabled state
- supported media types
- mode
- last sync status
- last sync time
- candidate counts
- manual sync action
- create and edit actions

### Exclusions Tab

Retains the current exclusions workflow for books and movies. It moves under the broader import-list feature instead of remaining the whole page.

### Candidate Review Surface

Phase 1 should expose candidate state per list, either inline from the list detail view or through a dedicated review panel. Operators must be able to see:

- already present items
- imported items
- skipped items
- failed items
- needs-review items

The review surface does not need advanced mass-edit workflows in phase 1, but it must make ambiguous candidates visible.

### Create/Edit Dialog

Each list configuration UI should support:

- provider selection
- provider credentials or identifiers
- enabled toggle
- allowed media types
- mode: `auto-import` or `review-only`
- monitoring defaults
- profile defaults
- root-folder defaults where relevant
- search-on-add behavior

Provider-specific fields should be rendered dynamically after provider selection, but saved through the shared `config_json` model.

The UI must constrain selectable media types based on provider capability. In phase 1, IMDb, Trakt, and Plex configurations must not offer books as a selectable target media type.

## Sync Flow

Manual sync and scheduled sync must call the same service codepath.

The pipeline is:

1. Load list config.
2. Validate provider configuration.
3. Fetch remote items from provider.
4. Normalize remote items into shared candidates.
5. Dedupe using list identity, provider item identity, and stable external IDs.
6. Match each candidate to existing library items.
7. Classify each candidate as already present, importable, skipped, failed, or needs review.
8. If mode is `auto-import`, create new media only for confident candidates.
9. Persist candidate and sync-run results.
10. Emit history/task messages for operator visibility.

## Matching Rules

Matching must be conservative. Wrong imports are worse than deferred imports.

Phase 1 rules:

- exact stable-ID match wins
- if the item already exists in the library, record `already_present`
- title-plus-year matching may be used only when confidence is high and there is no competing result
- ambiguous results must become `needs_review`
- missing essential metadata must not silently import

This design deliberately favors safety over aggressive auto-add behavior.

## Import Rules

Phase 1 supports two list modes.

### `auto-import`

Used for trusted lists. Confident candidates create new library items automatically.

Rules:

- create only when matching confidence is high
- apply list defaults for monitoring and profiles
- optionally trigger search-on-add using existing content-type flows
- never create duplicates if the library already contains the item

### `review-only`

Used when operators want syncing without automatic creation.

Rules:

- fetch and normalize candidates
- run matching
- persist results
- do not create new library items

## Media-Specific Behavior

### Movies

For confident movie candidates:

- create a movie using existing add flow primitives
- apply the list defaults for root folder, profile, monitored state, and search-on-add

### TV

For confident show candidates:

- create a show using existing add flow primitives
- apply list defaults for monitoring and search behavior

### Books

Books are in scope for the platform but not for provider coverage in phase 1. No phase 1 requirement should force the core system to assume only movie/TV identifiers or workflows.

## Scheduler And Operations

The system should add a scheduled task for import-list syncing, grouped with other automation tasks. Operators should also be able to trigger sync per list from the import-list UI.

Operational expectations:

- per-list last sync status
- per-list last sync summary
- task-level success/failure visibility
- clear rate-limit or auth error messaging

## Error Handling

Error handling should be split by scope.

### List-Level Errors

Examples:

- invalid credentials
- network failures
- provider rate limits
- invalid provider configuration

Behavior:

- mark sync run failed
- preserve prior candidate state
- surface a clear operator-visible error

### Candidate-Level Errors

Examples:

- malformed remote item
- unsupported media type from provider
- ambiguous match
- missing identifier data

Behavior:

- continue the rest of the sync
- mark the candidate with failure or review state
- store a human-readable reason

## Testing Strategy

Phase 1 should include:

- provider adapter tests for IMDb, Trakt, and Plex normalization
- sync service tests for dedupe across repeated runs
- matching tests for exact ID matches, already-present items, confident matches, and ambiguous candidates
- import tests for movie and TV create flows using list defaults
- UI tests for create, edit, sync, status, and review workflows
- scheduler tests to ensure manual and automatic sync share the same pipeline

Fixture-based tests should be preferred for provider payloads so behavior remains stable even if live provider APIs drift.

## Open Product Decisions Resolved In This Spec

- The long-term goal is support for the combined import-list providers across Radarr, Sonarr, and Readarr.
- Delivery will be phased.
- Phase 1 will use a shared import-list platform plus IMDb, Trakt, and Plex adapters.
- Phase 1 may be movie/TV-heavy.
- Phase 1 will preserve exclusions but move them under a broader import-list feature.
- Phase 1 supports `auto-import` and `review-only` modes.

## Risks

- Provider APIs differ widely in authentication, metadata quality, and rate limits.
- TV matching can become ambiguous when provider data is weak.
- Repeated syncs can create noisy state unless candidate dedupe is strict.
- Overly aggressive fuzzy matching would create incorrect imports.

The design addresses these risks by centralizing normalization, making matching conservative, and persisting explicit candidate state.

## Recommended Implementation Boundary

This spec is intentionally scoped to one implementation plan:

- build the shared import-list platform
- implement IMDb, Trakt, and Plex adapters
- ship movie and TV flows
- preserve exclusions
- defer book providers and long-tail provider parity

That is large but still coherent as a single planned milestone because every work item contributes directly to the same user-facing feature and uses the same architecture.
