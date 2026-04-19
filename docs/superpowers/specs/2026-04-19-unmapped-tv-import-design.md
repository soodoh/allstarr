# Unmapped TV Import Mapping Design

Date: 2026-04-19

## Goal

Fix the unmapped TV file mapping flow so it:

- suggests the correct season and episode from the filename or path when possible
- allows bulk TV mapping with a different episode target per selected file
- optionally moves related episode sidecar files during mapping
- remembers the last-used sidecar option per user for future unmapped-file imports

## Problem Summary

The current unmapped-file mapping flow treats TV mapping as a single-target action:

- the table passes only one hint payload into the mapping dialog
- the dialog maps all selected TV files to one `entityId`
- the server only accepts one episode target for the entire request

That breaks the common case where a user selects multiple episode files from the same show or season. It also leaves TV mapping weaker than Sonarr's interactive import model, where each file carries its own suggested series, season, and episode mapping before a single bulk confirm.

The current server flow also stores mapped TV files at their existing paths instead of relocating them into the managed show folder, and it has no episode-sidecar transfer option for imported metadata files.

## Recommended Approach

Adopt a Sonarr-style per-file interactive mapping model for TV files inside the existing unmapped-file modal:

1. single-file TV mapping opens the same modal shape as bulk mapping, but with one row
2. each selected TV file gets its own mapping row with:
   - file identity
   - extracted hints
   - inferred episode suggestion
   - editable search term
   - editable target episode selection
3. one shared checkbox controls whether related sidecar files move with the mapped episode files
4. the server accepts per-file mapping instructions and performs one managed move per file

This keeps the user in one flow, avoids a one-file-at-a-time wizard, and preserves reviewability for mixed or partially inferred selections.

## Scope

In scope:

- unmapped TV mapping dialog behavior
- bulk TV mapping payload and server contract
- TV episode suggestion from filename and path hints
- managed destination moves for mapped TV files
- optional move of related episode sidecar files
- per-user persistence of the sidecar checkbox
- server, browser, and end-to-end tests for the changed flow

Out of scope:

- non-TV unmapped file behavior beyond shared modal plumbing
- folder-level artwork or unrelated directory metadata migration
- automatic remapping without user review
- importing arbitrary sidecars when they cannot be tied to a specific episode file

## UX Design

### Single-file TV mapping

When a single TV unmapped file is mapped:

- the modal opens with one row for that file
- the search field is prefilled from the best available title hint
- if hints contain both season and episode numbers, the UI requests matching episode candidates immediately
- if one clear episode match exists, that row is preselected
- the user can change the search or choose a different episode before confirming

### Bulk TV mapping

When multiple TV files are selected:

- the modal renders one row per selected file
- each row carries its own inferred mapping state
- rows can resolve to different shows or different episodes within the same show
- confirmation imports all valid rows in one action
- rows without a valid target remain blocked from submission and show why

### Sidecar option

The modal includes a shared checkbox:

- label: `Move related sidecar files`
- applies to all TV file rows in the current confirm action
- defaults to the most recent value used by the current user in an unmapped-file import flow
- updates the stored user preference after a successful mapping action

### Destination semantics

Mapped TV imports move files into the canonical managed show path:

- move the episode video file into the configured show and season folder
- if enabled, move only related episode sidecars alongside that file
- do not clear or replace the destination directory
- preserve existing files already in the destination directory, including Jellyfin metadata already present there

## Episode Suggestion Rules

### Hint extraction

The existing hint extractor already parses standard TV forms such as `S01E03`. That hint data should drive row suggestions.

For each selected TV file:

1. use the extracted title as the initial show search
2. use extracted season and episode numbers as the preferred lookup key
3. fall back to search-only matching when season and episode are incomplete

### Matching strategy

Suggested episode selection should follow this order:

1. exact match by show title search plus season and episode numbers
2. exact match by show title search plus parsed episode candidates returned from the server
3. unresolved row requiring manual user selection

The UI should not silently auto-map a row when multiple plausible matches remain.

## Sidecar Rules

The sidecar move option should mirror Sonarr's episode-scoped behavior, but always move rather than copy or hardlink.

Eligible sidecars:

- files in the source directory tree tied to the same episode file by basename or season and episode parsing
- configured extra extensions such as `.srt`, `.sub`, `.nfo`, and `.xml`

Not eligible:

- unrelated files in the same source directory
- folder-level artwork such as `folder.jpg`
- series-level metadata such as `tvshow.nfo`
- season-level artwork or metadata not tied to the specific episode file

If enabled:

- move the episode file first into the managed destination
- move each matched sidecar into the same destination directory
- rename sidecars to match the destination episode basename when appropriate

If disabled:

- move only the episode video file

## Server Design

### Input contract

Replace the current single-target TV mapping shape with a per-file mapping payload for episode imports.

Conceptually:

- keep single-target behavior for books and movies
- accept a list of TV row mappings for episodes, where each row contains:
  - `unmappedFileId`
  - `episodeId`
- accept `moveRelatedSidecars` as a boolean
- keep `downloadProfileId`

### Import flow

For each TV row:

1. load the unmapped file and target episode
2. resolve the managed destination path from the episode, show, season, and active naming rules
3. move the episode file into that destination
4. probe media metadata from the destination file
5. insert the `episodeFiles` record with the managed path
6. insert history
7. if enabled, find and move related sidecars
8. delete the processed unmapped-file rows

The operation should remain transactional where database writes are concerned, with best-effort file rollback matching existing unmapped relocation behavior.

### Search and suggestion support

The current search endpoint returns generic episode search results. TV mapping will need an additional targeted lookup path for row suggestions:

- given show text plus season and episode numbers, return candidate episodes ordered by confidence
- support initial row hydration without requiring the user to type first

This can either extend the existing search endpoint or add a focused suggestion endpoint. The choice should minimize duplicated query logic.

### User preference persistence

Persist the `moveRelatedSidecars` default per user in the same style as the existing import-new-content modal defaults:

- read the saved value when the mapping dialog opens
- write the new value after a successful mapping action
- scope the preference to the current authenticated user

## Error Handling

### Row-level validation

Each TV row should surface unresolved state before confirm:

- no candidate episode found
- multiple possible episodes with no chosen selection
- selected episode no longer exists

### Import failures

During submission:

- rows that fail due to missing source files, missing root folders, or destination collisions should report actionable errors
- the UI should not claim success for failed rows
- persisted sidecar preference should update only after a successful submission attempt that completes the server action

### Sidecar edge cases

If a sidecar cannot be moved:

- log the failure
- do not delete unrelated files
- do not broaden matching to sweep the whole folder
- fail that row
- roll back the episode-file move and any already-moved sidecars for that row so the library state stays explicit

## Files Likely Affected

- `src/components/unmapped-files/unmapped-files-table.tsx`
- `src/components/unmapped-files/mapping-dialog.tsx`
- `src/components/unmapped-files/mapping-dialog.browser.test.tsx`
- `src/components/unmapped-files/unmapped-files-table.browser.test.tsx`
- `src/server/unmapped-files.ts`
- `src/server/unmapped-files.test.ts`
- user-preference plumbing used by import modal defaults
- `e2e/tests/11-unmapped-files.spec.ts`

Additional files may change if TV path-building helpers already exist elsewhere and should be reused rather than duplicated.

## Testing Strategy

### Server tests

Add server coverage for:

- suggesting exact TV episode matches from `SxxEyy` hints
- mapping multiple unmapped TV files to different episode ids in one request
- moving mapped episode files into managed TV paths
- moving only related sidecars when enabled
- leaving sidecars behind when disabled
- not moving unrelated metadata or artwork
- persisting and reading the sidecar preference if handled through server-facing user settings code

### Browser tests

Add browser coverage for:

- single TV file opens with inferred episode suggestion
- bulk TV mapping renders separate row targets
- changing one row does not affect the others
- sidecar checkbox renders and uses the saved default

### End-to-end tests

Extend unmapped-file Playwright coverage with:

- multiple selected TV files mapped to different episodes in one confirm
- mapped files land in the managed show and season folder
- matched `.xml` and `.nfo` episode sidecars move only when the checkbox is enabled
- unrelated files in the source directory remain in place
- existing files in the destination season directory remain untouched

## Risks

- TV path naming may already exist in another import path and should be reused to avoid divergence
- sidecar matching that is too broad could move unrelated Jellyfin files
- sidecar matching that is too narrow could miss legitimate episode metadata
- bulk UI complexity can grow quickly if row state is not isolated cleanly

## Success Criteria

The feature is complete when:

- a TV file named like `Show.Name.S02E03.mkv` suggests season 2 episode 3 automatically
- bulk-selecting multiple TV files allows a distinct episode selection per file
- mapped TV files move into the managed library path
- enabling sidecar moves relocates only episode-related sidecars
- existing destination metadata files remain untouched
- the sidecar checkbox remembers the user’s last choice for future unmapped-file imports
