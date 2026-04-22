# API-Only Servarr Import Design

Date: 2026-04-21

## Goal

Add a new settings-driven import workflow that lets an admin connect multiple Sonarr, Radarr, Readarr, and Bookshelf instances and selectively import:

- library membership
- profiles and root-folder mappings
- user-facing Servarr settings that map cleanly to Allstarr settings
- activity data exposed by the source APIs, such as history, queue, and blocklist records

The first version must work with API credentials only. It must not require direct access to Servarr SQLite databases and must not move or rename files during import.

## Problem Summary

This feature is not a simple "connect and sync" page. It has four complications:

1. users may have multiple instances of the same app type, such as Radarr 4K and 1080p or separate ebook and audiobook libraries
2. Servarr and Allstarr use different metadata authorities for some media types, especially Sonarr TV and Readarr-derived books
3. importing settings directly into live Allstarr state is risky when conflicts exist
4. API-only import can cover most user-facing data, but not hidden internal tables or guaranteed credential recovery

The right product model is a staged migration workspace that discovers source data, normalizes it, produces a diff-like plan, and lets the user selectively apply safe rows while skipping unresolved identity matches.

## Recommended Approach

Build `Settings > Imports` as an API-only staged migration workspace.

Each source instance is connected independently, fetched into a normalized snapshot, and converted into an import plan grouped by resource type. The plan supports selective apply at the group and row level. When an imported item cannot be matched confidently to Allstarr metadata, the default action is `skip and review`.

The first version should optimize for safe migration coverage rather than clone-grade Servarr parity:

- import what the API exposes and what Allstarr can represent
- surface conflicts before apply
- keep unresolved identity work in review queues
- generate rename and move recommendations instead of touching the filesystem

## Scope

In scope:

- a new `Settings > Imports` area
- connecting multiple Sonarr, Radarr, Readarr, and Bookshelf instances
- API-key-based discovery and import planning
- selective import of settings groups, profiles, root-folder mappings, library items, and importable activity rows
- TVDB-to-TMDB reconciliation for Sonarr imports
- Readarr or Bookshelf to Hardcover reconciliation for book imports
- unresolved review queues for items that cannot be matched confidently
- post-import reporting for skipped rows, warnings, and rename recommendations

Out of scope:

- direct SQLite or filesystem database access
- importing hidden or internal Servarr tables that are not exposed by stable APIs
- recovering secrets that the source APIs do not return in reusable form
- importing Prowlarr itself in this feature
- moving or renaming files and folders during import
- clone-grade preservation of Servarr internal ids or relationships

## Product Shape

The import experience should be framed as a migration center instead of a single one-shot wizard.

Users can register multiple source instances, refresh them independently, and build a plan from one or more snapshots. A source record should store:

- app type
- user-facing label
- base URL
- API key
- last fetch status
- last snapshot timestamp

The workflow is:

1. connect one or more source instances
2. fetch source API data into a snapshot
3. normalize source data into Allstarr-facing import records
4. compare normalized records with current Allstarr state and build an import plan
5. let the user select which rows to apply
6. apply selected rows in dependency order
7. show a review screen with successes, skips, unresolved items, and rename recommendations

This gives users a safe way to import from several Servarr apps without overwriting existing Allstarr configuration blindly.

## Architecture

Split the system into four bounded units.

### Source Connectors

Each connector speaks one source API only:

- Sonarr connector
- Radarr connector
- Readarr connector
- Bookshelf connector

Connectors return raw source payloads and pagination helpers. They do not write to the database and do not contain Allstarr reconciliation logic.

### Normalization Layer

The normalization layer converts source-specific payloads into common import shapes:

- source instance records
- settings groups
- profile and root-folder records
- library entities
- activity rows
- unresolved identity candidates

This is where source-specific translation rules live:

- Sonarr series become TV import candidates that must resolve against Allstarr TMDB-backed shows
- Readarr records become Hardcover match candidates unless a confident identifier path already exists
- Bookshelf is treated as a separate source type and should prefer Hardcover-native identifiers when available
- Prowlarr-synced indexers are imported as indexer settings from the downstream app, not as a true Prowlarr application relationship

### Planning Engine

The planner compares normalized import records with current Allstarr state and emits rows with one of these actions:

- create
- update
- skip
- conflict
- unresolved
- unsupported

Planning must be pure and repeatable. The same snapshot plus the same current Allstarr state should generate the same plan.

### Apply Engine

The apply engine executes only user-selected plan rows and writes records in dependency order:

1. import source-instance bookkeeping
2. import download clients, indexers, profiles, root-folder mappings, and mapped settings
3. import library entities and profile assignments
4. import activity rows that Allstarr can represent
5. store review artifacts for unresolved items and rename recommendations

Apply should be explicit and incremental so users can safely re-run a source after fixing unresolved matches or adding another instance.

## API-Only Coverage

The product should clearly separate `supported directly`, `supported with translation`, and `unsupported in v1`.

### Supported Directly

- source instance connection metadata
- download clients
- indexers
- root folders
- profiles and similar quality or download preference structures that map to Allstarr profiles
- library membership and monitored state
- tags and other user-facing organization data
- history and blocklist rows that are exposed by the source APIs and can be represented in Allstarr's activity model
- current queue state, imported as a point-in-time activity snapshot rather than a durable live queue relationship

### Supported With Translation

- Sonarr TV imports, which require a TVDB-to-TMDB crosswalk before apply
- Readarr imports, which require matching authors, books, and editions into Hardcover-backed Allstarr records
- Bookshelf imports, which should prefer Hardcover-native identifiers and still fall back to confidence-based matching when required
- naming and media-management settings, which should map into Allstarr settings and emit rename recommendations instead of filesystem actions
- download directory to profile behavior, which should be inferred from source root folders, categories, and profile usage and then presented as user-selectable mappings

### Unsupported In V1

- hidden Servarr internals not exposed through the APIs
- reliable recovery of secret values not returned by those APIs
- direct Prowlarr import
- file moves, folder moves, or rename execution during import
- clone-grade table-level migration fidelity

## Data Model And Plan Shape

The plan should be grouped by source instance and then by resource type.

Core plan groups:

- settings
- profiles and root-folder mappings
- library items
- activity import
- unresolved matches
- unsupported or skipped items

Each plan row should include:

- source instance id
- source app type
- resource type
- source identity
- source provenance key that remains stable across refreshes for deduplication
- proposed Allstarr target, if any
- action
- reason or warning text
- selectable flag

This structure supports importing only the safe parts of a source, such as settings and already-matched library rows, while leaving hard identity cases for later review.

Applied records should keep source provenance so later refreshes can detect whether the same Radarr, Sonarr, Readarr, or Bookshelf item was already imported and avoid duplicate creation across overlapping instances.

## Identity Matching Rules

Identity matching is the highest-risk part of this feature. The first version should favor precision over coverage.

### Sonarr

Sonarr uses TVDB-oriented identities while Allstarr uses TMDB-backed TV data. The import should:

1. collect source identifiers and series metadata from Sonarr
2. run a TVDB-to-TMDB crosswalk
3. verify the result against title and year signals
4. mark low-confidence results as unresolved

If a show cannot be matched confidently, skip it and place it in the unresolved review queue. Episode-level import should only proceed for shows that resolve successfully.

### Readarr

Readarr data should be treated as a legacy source with mixed identifier quality. The import should prefer:

1. direct edition identifiers such as ISBN or ASIN when available
2. source ids that can be reconciled confidently to Hardcover records
3. title plus primary-author matching as a fallback ranking signal

Low-confidence book or author matches must be skipped into review.

### Bookshelf

Bookshelf should be treated as a first-class source type rather than a hidden Readarr mode. Where its API exposes Hardcover-native identifiers, those should be the preferred join keys. Remaining unresolved records should follow the same skip-and-review policy.

### Matching Policy

The default policy is `skip and review`.

The first version must not:

- create local placeholder content records for unresolved matches
- accept aggressive fuzzy matches without review
- allow unresolved identity rows to silently import into the main library

## Settings Translation Rules

Settings import should be grouped and reviewable. Likely setting groups include:

- download clients
- indexers
- profiles
- metadata preferences
- media-management preferences
- naming preferences
- root folders and root-folder to profile suggestions

When a source setting maps imperfectly to Allstarr, the plan should show:

- the source value
- the proposed Allstarr value
- whether the mapping is exact, approximate, or partial
- any warning text about lossy translation

If a source record contains secrets that the API does not expose in reusable form, the imported row should either:

- be created in a disabled or incomplete state that clearly requires user input, or
- stay in conflict state until the user supplies the missing value

The first version should never pretend that an unavailable secret was imported successfully.

## Rename Recommendation Model

The first release should not touch media paths during import. Instead, it should compute recommendations when imported naming or media-management settings differ from Allstarr's current expectations.

Each recommendation should capture:

- content item
- current source path
- expected Allstarr path or filename pattern
- reason for the mismatch
- whether the difference is path-only, filename-only, or both

These recommendations belong in the post-import review area and can later power a separate rename workflow.

## User Experience

Add a new `Settings > Imports` area with three top-level views.

### Sources

Shows connected source instances with:

- app type
- label
- base URL
- last sync status
- snapshot age

Users can add multiple instances of the same source type and refresh them independently.

### Plan

Build a diff-like plan after fetching one or more source snapshots. Group results into:

- settings
- profiles and root-folder mappings
- library items
- activity import
- unresolved matches
- unsupported or skipped items

Each row shows the source value, the proposed Allstarr target, and the planned action. The user can select entire groups or individual rows before applying.

### Review

After apply, show:

- imported successfully
- skipped intentionally
- unresolved items still needing review
- warnings for partially mapped settings
- rename and move recommendations

The review screen should make it easy to return to unresolved rows later without having to re-discover every source from scratch.

## Apply Behavior

The default behavior for conflicts is `preview and selective apply`.

The first version should not:

- apply live changes immediately on connection
- overwrite conflicting Allstarr settings automatically
- rename or move files during import

Users should be able to import safe settings and safe library rows even when unresolved matches remain elsewhere in the same source.

## Testing

Add layered test coverage for:

- connector behavior against fake Sonarr, Radarr, Readarr, and Bookshelf API fixtures
- normalization of source payloads into common import shapes
- planner behavior for create, update, skip, conflict, unresolved, and unsupported rows
- TVDB-to-TMDB crosswalk confidence handling
- Readarr or Bookshelf to Hardcover matching confidence handling
- browser tests for the import plan table, selection flow, and unresolved review queue
- end-to-end tests for multiple instances of the same app type, such as Radarr 4K plus 1080p and separate ebook and audiobook imports

## Risks

- TVDB-to-TMDB matching quality may leave a meaningful unresolved tail for Sonarr imports
- older Readarr data may be noisy enough that API-only import yields lower-confidence Hardcover matches
- settings mappings may be lossy when Allstarr and Servarr represent the same concept differently
- users with multiple overlapping source instances may create duplicates unless source provenance is tracked clearly
- API-only import cannot guarantee full secret recovery for download clients and indexers

## Acceptance Criteria

- An admin can connect multiple Sonarr, Radarr, Readarr, and Bookshelf instances with base URL and API key only.
- The system fetches source data, builds a grouped import plan, and lets the user selectively apply rows.
- Conflicting settings do not overwrite existing Allstarr values without explicit selection.
- Sonarr TV imports and Readarr or Bookshelf book imports skip low-confidence matches into a review queue.
- Imported naming and media-management differences generate rename recommendations instead of filesystem changes.
- The UI clearly distinguishes supported, translated, unresolved, and unsupported rows.
