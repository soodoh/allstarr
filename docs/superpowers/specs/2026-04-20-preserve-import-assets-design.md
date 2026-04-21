# Preserve Import Assets Design

## Summary

Extend unmapped-file import so that primary media assignment remains per physical media file, while all other files in the matched source containers can be preserved, selectively included, and cleaned up without data loss.

The current Servarr-style import rows for primary media files stay in place. The change is to attach owned non-primary assets to those rows, let the user choose which assets to include, optionally delete deselected attached assets, and prune emptied source directories after migration.

## Goals

- Preserve all currently observed managed-library files under `data/` during unmapped imports.
- Keep Servarr-style per-primary-file assignment for movies, TV, ebooks, and audiobooks.
- Avoid cluttering the main import table with nested assets.
- Let users choose which attached assets to migrate.
- Support optional deletion of deselected attached assets.
- Remove emptied source folders after migration without deleting unrelated files.

## Non-Goals

- Introduce standalone import rows for non-primary assets.
- Build a generic file manager for arbitrary library folders.
- Infer ownership for files outside the imported source containers.
- Silently overwrite destination files on collision.

## Real Data Shapes To Preserve

Current managed library data shows these file patterns:

- TV episode-level assets:
  - `<episode>.nfo`
  - `<episode>_chapters.xml`
  - `<episode>-thumb.jpg`
- TV show-level assets:
  - `theme.mp3`
- TV nested episode assets:
  - `<episode>.trickplay/**`
- Movie title-level assets:
  - `movie.nfo`
- Book title-level assets:
  - `cover.jpg`
  - `metadata.opf`
- Audiobooks:
  - only primary audio files in the current sample set

The implementation must preserve these shapes when the user chooses to include them.

## Design Overview

Import stays centered on primary media rows:

- one row per episode video, movie video, ebook file, or audiobook audio file
- each row keeps its own inferred and editable target assignment
- each row also owns a set of attached non-primary assets

Assets do not become top-level rows. They are presented inside a collapsible asset view on each primary row.

There are two asset scopes:

- row-level assets:
  files or directories tied directly to one primary file
- container-level assets:
  files or directories tied to the enclosing matched movie folder, book folder, show folder, or season folder

Each non-primary file or directory under the imported source container must end up in exactly one of these states:

- attached to one row and selected for move
- attached to one row and deselected
- classified as unrelated and left untouched

This prevents duplicate movement, ambiguous cleanup, and accidental data loss.

## UX

### Main Table

The top-level table continues to show only primary media rows.

Each row gets an `Assets` summary, for example:

- `12 selected / 15 total`
- `3 deselected`
- `No assets`

### Asset Drawer

Expanding a row reveals attached assets in grouped sections:

- `Direct file assets`
- `Container assets`
- `Nested assets`

Each asset item shows:

- source-relative path
- file or directory icon
- ownership reason
- selected state

Users can:

- toggle individual assets
- toggle entire groups
- review nested directories without turning them into separate assignment rows

This keeps per-file mapping readable even for deep trees like `.trickplay/`.

### Persisted Options

The import modal should expose two persisted per-user checkboxes:

- `Move related files`
- `Delete deselected related files`

Behavior:

- if `Move related files` is off, only primary files move
- if `Move related files` is on, selected attached assets also move
- if `Delete deselected related files` is on, deselected attached assets are deleted from the source after a successful row import
- if `Delete deselected related files` is off, deselected attached assets stay in place

`Delete deselected related files` is only meaningful when asset attachment is enabled, but it should still persist independently.

## Ownership Rules

### Row Ownership

- Episode-specific files attach to that episode row.
- Movie-folder files attach to the movie row.
- Book-folder files attach to the ebook or audiobook row whose destination is that book folder.
- Show-level files such as `theme.mp3` attach to one designated row for that show import.
- Nested trees such as `.trickplay/` attach to the row whose primary basename anchors the tree.

### Attachment Heuristics

Ownership is determined in this order:

1. Direct match:
   same basename as the primary file
2. Token match:
   same episode token, multipart token, or other parsed media identifier
3. Nested match:
   lives under a directory whose name derives from the primary basename
4. Container match:
   lives in the same matched movie, book, show, or season container and is not a primary file

If more than one row could claim an asset, the server resolves ownership deterministically:

- prefer direct over token over nested over container
- prefer the row in the closest shared ancestor
- if still ambiguous, mark unrelated and do not auto-attach

### Show-Level Asset Anchoring

Container-level assets that belong to a show or title rather than a specific episode or file must attach to a single designated row so they are represented once in the import payload.

For TV:

- prefer the first selected row for that show in natural season/episode order
- if nothing is selected yet, attach to the earliest row in the modal

For books, movies, and audiobooks:

- attach to the row whose destination container matches the title-level folder

## Import Payload

Each primary row submission is extended with an explicit asset list. The modal sends resolved user decisions; the server does not reinterpret selection at commit time.

Each asset entry contains:

- `sourcePath`
- `kind`: `file` or `directory`
- `ownershipReason`
- `selected`
- `action`: `move`, `delete`, or `ignore`
- `relativeSourcePath`

Directory assets represent a preserved subtree root. The server moves or deletes the subtree while maintaining its internal structure.

## Filesystem Behavior

### Destination Rules

- Primary files move into managed destinations as they do today.
- Selected assets move into the managed destination container anchored by that row.
- Directory assets keep their relative subtree shape.
- Existing destination files are preserved.
- If moving an asset would collide with an existing destination path, that row fails with a clear collision error.
- The server never silently overwrites destination files.

### Source Cleanup

After a row succeeds:

- delete deselected attached assets if the setting is enabled
- remove empty directories left behind inside that row's imported source container
- recursively prune empty parent directories, stopping at the imported container root

The cleanup rules are:

- never delete a directory that still contains unrelated files
- never prune above the source container root for that row
- never delete files classified as unrelated

### Source Container Roots

Cleanup needs a bounded root per row:

- TV episode imports:
  the owning season folder for row-level assets, and the show folder for show-level assets
- Movie imports:
  the movie folder
- Ebook and audiobook imports:
  the matched book folder

This lets cleanup remove emptied folders without risking broader library damage.

## Failure Handling

Bulk import succeeds or fails per row, not as one global transaction.

Per row:

1. move primary file
2. move selected assets
3. write DB changes
4. delete deselected attached assets if enabled
5. prune emptied source folders

If a row fails after filesystem changes:

- roll back moved files for that row as far as possible
- skip delete and prune steps for that row
- report the row failure without rolling back already completed rows

Rollback is best-effort but must cover all moves initiated by that row in normal error cases.

## Content-Type Expectations

### TV

Must preserve:

- episode `.nfo`
- episode `_chapters.xml`
- episode `-thumb.jpg`
- episode `.trickplay/**`
- show `theme.mp3`

TV import remains episode-row-driven. Show-level assets are attached once via designated-row anchoring.

### Movies

Must preserve:

- title-level `movie.nfo`
- any other non-primary files in the matched movie folder unless classified unrelated

Movie import remains one row per primary movie file.

### Books

Must preserve:

- `cover.jpg`
- `metadata.opf`
- any other non-primary files in the matched book folder unless classified unrelated

### Audiobooks

Audiobook import remains one row per physical audio file. Non-primary files found in the matched book folder should follow the same title-level attachment rules as ebooks.

## Settings

Add persisted per-user unmapped-import settings for:

- moving related files
- deleting deselected related files

These settings apply across supported content types and prefill future unmapped import modals.

## Testing

### Unit Tests

- asset ownership classification across TV, movie, book, and audiobook cases
- attachment precedence and ambiguity handling
- subtree-preserving destination mapping for nested directories
- cleanup pruning that removes only empty directories
- collision failures without overwrite
- row rollback after partial filesystem movement

### Browser Tests

- row asset drawer rendering
- per-file and per-group asset toggling
- persisted checkbox defaults
- designated-row attachment visibility for show-level assets

### E2E Tests

- TV import preserving `.nfo`, `_chapters.xml`, `-thumb.jpg`, `.trickplay/**`, and `theme.mp3`
- movie import preserving `movie.nfo`
- book import preserving `cover.jpg` and `metadata.opf`
- deselected asset deletion enabled
- deselected asset deletion disabled
- cleanup of emptied folders without deleting unrelated files

## Open Decisions Resolved

- Non-primary assets are not separate top-level rows.
- Deselected attached assets may be deleted, controlled by a persisted setting.
- Directory-shaped assets such as `.trickplay/` are preserved as subtrees, not flattened into filenames.
- Cleanup deletes emptied folders after successful migration, but only within the row's bounded source container.
