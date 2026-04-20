# Servarr-Style Manual Import Design

Date: 2026-04-19

## Goal

Replace the current mixed unmapped-file mapping behavior with one Servarr-style interactive import model for all content types so that:

- every selected unmapped file is reviewed and imported as its own row
- movies import into managed movie folders instead of keeping source paths
- ebooks and audiobooks keep moving into managed author and book folders, but through the same row-based workflow
- audiobooks continue to support multiple physical audio files per book without collapsing them into one hidden bulk target
- optional related-sidecar movement works consistently for media types where it is supported

## Problem Summary

The current unmapped-file flow has diverged by content type:

- TV now supports per-file interactive mapping with one row per selected episode file
- movies still map all selected files to one chosen movie and keep the original file path in `movieFiles`
- ebooks and audiobooks also map all selected files to one chosen book, even though the underlying storage model already supports multiple physical files

That creates three practical problems:

1. bulk imports for non-TV types are structurally unsafe for mixed selections
2. movie imports do not behave like a managed library import
3. audiobook imports treat a selection as a flat batch rather than an explicit list of mapped physical files

Radarr, Sonarr, and Readarr all center manual import around editable per-file rows. Bulk import in Servarr is "confirm many row mappings", not "assign one target to everything selected".

## Recommended Approach

Adopt a single Servarr-style interactive import workflow inside the existing unmapped-file modal:

1. every selected unmapped file becomes an import row
2. each row gets:
   - file identity
   - inferred search text
   - inferred target if available
   - editable target selection
   - selected or unselected state
   - content-specific metadata preview
3. bulk confirm submits only the selected rows and preserves each row's independent mapping
4. import behavior uses managed library paths for all supported content types

This aligns the product model with Servarr, removes the non-TV single-target bulk hazard, and gives one UI and server contract to extend over time.

## Scope

In scope:

- unmapped-file mapping dialog behavior for movies, ebooks, audiobooks, and TV
- a unified row-based import payload for all content types
- managed movie imports
- preservation of the current managed book and audiobook move behavior
- keeping audiobook file-level `part` and `partCount` data while making the mapping flow per-file
- sidecar import options for TV and movies
- user preference persistence for related-sidecar movement
- server, browser, and end-to-end coverage for the new row-based model

Out of scope:

- adding external metadata lookups from TMDB or Hardcover directly inside manual import
- redesigning the underlying book or movie naming systems beyond what is needed for managed import consistency
- introducing edition-aware audiobook grouping beyond the current book-level model
- importing arbitrary non-media directory contents

## UX Design

### Shared modal model

The unmapped mapping modal should use the same interaction model for all content types:

- one row per selected file
- one editable target per row
- one row can be selected while another remains unresolved
- submit imports only the rows that remain selected and valid
- unresolved rows stay visible and editable instead of blocking the whole dialog from rendering

The current TV row model becomes the foundation, not the special case.

### Movies

Movie rows should show:

- file path
- inferred title and year, when available
- an initial movie search seeded from title and year hints
- one editable movie target selection

Bulk movie import should allow different selected files to map to different movies, matching Radarr's interactive import behavior.

### Ebooks

Ebook rows should show:

- file path
- inferred title, author, and year hints
- an initial book search seeded from title and author when available
- one editable book target selection

Bulk ebook import should allow multiple selected files to map to different books, even if a common one-target outcome remains the usual case.

### Audiobooks

Audiobook rows should also be one row per physical audio file:

- file path
- inferred title, author, and year hints
- one editable book target selection
- audio-specific metadata when already known or cheaply derivable

If several selected audio files belong to the same book, the user will see multiple rows pointing at the same target book. That is intentional and matches the Servarr principle that physical files stay visible and editable.

### TV

TV keeps the current per-row episode model:

- inferred show, season, and episode suggestions from hints
- editable row search
- editable row episode target
- one confirm action across rows

## Content-Specific Import Semantics

### Movies

Mapped movie files should import into the managed movie root folder for the selected download profile.

Behavior:

- move the video file into the canonical managed movie path
- store the managed destination in `movieFiles.path`
- do not leave the file registered at its old source path
- preserve existing files already present in the destination directory

This closes the current gap with Radarr's managed import behavior.

### Ebooks and audiobooks

Books already move into managed author and book folders. That should remain unchanged at the filesystem level.

Behavior:

- each mapped ebook or audio file moves into the canonical author and book destination folder
- each imported physical file gets its own `bookFiles` row
- audiobook rows keep storing `part` and `partCount`
- the manual import flow becomes row-based, but the destination rules remain the current managed-book rules

### TV

TV continues to move into the managed show and season destination and can optionally move related per-episode sidecars.

## Sidecar Rules

### Supported content types

Sidecar movement should be supported for:

- TV episode files
- movie video files

It should not be added to ebooks or audiobooks in this change because the current product model does not define a stable set of related extra-file rules for those media types.

### User option

Use one persisted per-user checkbox in the mapping modal:

- label: `Move related sidecar files`
- shown for movie and TV imports
- hidden for ebook and audiobook imports
- last-used value is stored per user under the unmapped-files settings bucket

### Matching rules

Related sidecars must stay file-scoped, not folder-scoped.

Eligible sidecars:

- files tied to the mapped media file by basename
- for TV, files tied by parsed season and episode token as well
- known metadata and subtitle extensions only

Not eligible:

- unrelated files in the same source directory
- folder art
- series-level or collection-level metadata not tied to the imported media file
- arbitrary source-directory contents

### Destination rules

If sidecar movement is enabled:

- move the main media file first
- move only matched sidecars for that file
- rename sidecars to the destination media basename when appropriate
- preserve all unrelated files already present in the destination directory

## Inference and Search Rules

### Shared rule

Each row should be seeded from its own hints, never from a single shared hint payload for the whole selection.

### Movies

Movie row inference should use:

1. extracted title and year from filename or parent directory
2. title-only fallback when year is missing

Search ranking should prefer exact or near-exact title plus year matches over title-only matches.

### Books and audiobooks

Book and audiobook row inference should use:

1. extracted title and author
2. extracted year as a ranking signal, not the only gate
3. title-only fallback when author is missing

Search ranking should prefer title plus primary-author matches.

### TV

TV row inference should continue to use:

1. show title
2. season number
3. episode number

with exact episode suggestions when possible and editable fallback otherwise.

## Server Design

### Unified input contract

Replace the mixed current payloads with one row-based import contract.

Conceptually:

- request contains `downloadProfileId`
- request contains `rows`
- each row contains:
  - `unmappedFileId`
  - `entityType`
  - `entityId`
- request optionally contains `moveRelatedSidecars`

Validation rules:

- movie rows map only to movie ids
- book and audiobook rows map only to book ids
- TV rows map only to episode ids
- `moveRelatedSidecars` is only valid when every selected row is movie or TV content in the current request model

The UI may still constrain the dialog to one content type at a time, but the payload shape should be row-based rather than one-target-based.

### Import execution

For each row:

1. load the unmapped file
2. load the target entity
3. resolve the managed destination path for that content type
4. move the media file into the destination
5. probe metadata from the moved file when applicable
6. insert the corresponding file row
7. write history
8. move sidecars if enabled and supported
9. delete the processed unmapped-file row and any moved sidecar unmapped rows

Rollback behavior should match the current move-based import logic:

- if DB writes fail after file movement, move the file back
- if sidecar movement partially fails, roll back the already-moved files for that row
- do not delete unmapped rows for a row that failed to import

### Movie destination resolution

Add a managed movie destination builder parallel to the current TV destination helper so the movie manual import flow no longer writes source paths into `movieFiles`.

The movie destination builder should:

- resolve the managed movie root folder from the selected movie profile
- place the file in the canonical managed movie directory
- preserve the imported file extension
- respect existing naming conventions already used elsewhere in the movie library

### Audiobook part assignment

This design keeps the current `part` and `partCount` data model, but the assignment rules should be explicit:

- if multiple selected audio files map to the same book in one import action, assign part numbers in stable natural filename order
- if a single audio file is imported, `part` and `partCount` remain `null`
- future metadata-aware grouping can improve this later, but this change should not guess hidden grouping beyond the selected physical files

That keeps the behavior deterministic and compatible with the existing UI.

## Error Handling

### Row-level validity

Rows can fail independently for reasons such as:

- no target selected
- target entity missing
- source file missing
- root folder missing
- destination path generation failure

The dialog should make unresolved rows visible before submit. The server should reject invalid rows explicitly rather than partially inventing behavior.

### Submit behavior

The UI should report the real submission outcome:

- success when all submitted rows import successfully
- failure when the server rejects the import request

This design does not introduce partial-success UX in the same request. If partial-success handling is needed later, it should be added intentionally with per-row status reporting.

## Files Likely Affected

- `src/components/unmapped-files/unmapped-files-table.tsx`
- `src/components/unmapped-files/mapping-dialog.tsx`
- `src/components/unmapped-files/mapping-dialog.browser.test.tsx`
- `src/components/unmapped-files/unmapped-files-table.browser.test.tsx`
- `src/server/unmapped-files.ts`
- `src/server/unmapped-files.test.ts`
- `src/server/hint-extractor.ts`
- user-settings plumbing for unmapped-file defaults
- `e2e/tests/11-unmapped-files.spec.ts`

Additional server helpers will likely be needed if movie destination generation is extracted into shared import-path utilities.

## Testing Strategy

### Server tests

Add or update coverage for:

- row-based validation for all content types
- managed movie path import behavior
- per-row bulk movie mapping to different movie ids
- per-row bulk ebook mapping to different book ids
- per-row bulk audiobook mapping where multiple rows point to the same book id
- deterministic audiobook `part` and `partCount` assignment
- movie sidecar movement when enabled
- movie sidecar omission when disabled
- TV sidecar persistence behavior remaining correct under the unified contract

### Browser tests

Add or update coverage for:

- one row per selected movie file
- one row per selected ebook file
- one row per selected audiobook file
- independent row edits in mixed-title bulk imports
- sidecar checkbox showing only for supported content types
- persisted sidecar checkbox defaults

### End-to-end tests

Add or update coverage for:

- bulk movie mapping where two selected files resolve to different movies
- movie import into the managed destination path while preserving unrelated destination files
- bulk audiobook mapping where multiple audio files map to one book and persist separate file rows
- bulk ebook mapping with different row targets
- unresolved rows staying editable until fixed

## Implementation Notes

The highest-risk migration point is replacing the current non-TV single-target request shape. To keep the rollout safe:

1. convert the modal and server contract to row-based requests first
2. preserve existing book move semantics while migrating the request shape
3. add managed movie imports once row-based request handling is in place
4. add movie sidecar movement on top of the managed movie path behavior

This sequencing keeps the architecture coherent and avoids reworking the client twice.

## Sources

- Radarr manual import: https://raw.githubusercontent.com/Radarr/Radarr/develop/src/Radarr.Api.V3/ManualImport/ManualImportController.cs
- Sonarr manual import: https://raw.githubusercontent.com/Sonarr/Sonarr/develop/src/Sonarr.Api.V3/ManualImport/ManualImportController.cs
- Readarr manual import: https://raw.githubusercontent.com/Readarr/Readarr/develop/src/Readarr.Api.V1/ManualImport/ManualImportController.cs
- Readarr manual import resource: https://raw.githubusercontent.com/Readarr/Readarr/develop/src/Readarr.Api.V1/ManualImport/ManualImportResource.cs
- Readarr parsed track info: https://raw.githubusercontent.com/Readarr/Readarr/develop/src/NzbDrone.Core/Parser/Model/ParsedTrackInfo.cs
- Radarr extra files: https://raw.githubusercontent.com/Radarr/Radarr/develop/src/NzbDrone.Core/Extras/ExtraService.cs
- Sonarr extra files: https://raw.githubusercontent.com/Sonarr/Sonarr/develop/src/NzbDrone.Core/Extras/ExtraService.cs
- Readarr extra files: https://raw.githubusercontent.com/Readarr/Readarr/develop/src/NzbDrone.Core/Extras/ExtraService.cs
- Servarr media management docs: https://wikiold.servarr.com/Settings_Media_Management
