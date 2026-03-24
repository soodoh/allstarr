# Media Profile Selection: Consistent Multi-Select Across Content Types

## Problem

Profile selection is inconsistent across media types:

- **Authors/Books**: Checkbox multiselect but shows ALL profiles (not filtered by content type or enabled status)
- **TV Shows**: Single-select dropdown, no post-add editing
- **Movies**: Single-select dropdown, no post-add editing

The data model already supports multiple profiles per media item (junction tables exist for all types), but the UI and server APIs don't consistently expose this.

## Changes

### 1. Shared `ProfileCheckboxGroup` Component

Extract a reusable component from the duplicated checkbox rendering across author/book flows.

**File:** `src/components/shared/profile-checkbox-group.tsx`

```tsx
type ProfileCheckboxGroupProps = {
  profiles: Array<{ id: number; name: string; icon: string }>;
  selectedIds: number[];
  onToggle: (id: number) => void;
};
```

Renders a vertical list of checkboxes with profile icon and name. Callers are responsible for passing only filtered profiles (by content type and enabled status).

### 2. Filter Profiles by Content Type and Enabled Status

All profile selection UI must filter by content type AND `enabled` before rendering:

| Context                                           | Filter                                              |
| ------------------------------------------------- | --------------------------------------------------- |
| Author add (author-preview-modal `AddForm`)       | `contentType === "book" && enabled`                 |
| Author add (add-author-dialog)                    | `contentType === "book" && enabled`                 |
| Book add (book-preview-modal `AddBookForm`)       | `contentType === "book" && enabled`                 |
| Author edit (author-form via $authorId)           | `contentType === "book" && enabled`                 |
| TV show add (tmdb-show-search `ShowPreviewModal`) | `contentType === "tv" && enabled` (already done)    |
| Movie add (tmdb-movie-search `MoviePreviewModal`) | `contentType === "movie" && enabled` (already done) |

### 3. TV/Movie Add Modals: Single-Select to Multiselect

**TV Shows** (`src/components/tv/tmdb-show-search.tsx` - `ShowPreviewModal`):

- Replace `<Select>` dropdown with `ProfileCheckboxGroup`
- Change state from `downloadProfileId: string` to `downloadProfileIds: number[]`
- Initialize with all matching profiles checked
- Send `downloadProfileIds` (plural) to server

**Movies** (`src/components/movies/tmdb-movie-search.tsx` - `MoviePreviewModal`):

- Same changes as TV shows

### 4. Edit Profile Selection on Detail Pages

**Show detail header** (`src/components/tv/show-detail-header.tsx`):

- Add an edit (pencil) icon button next to the "Download Profile" row
- Opens a `Dialog` with `ProfileCheckboxGroup` pre-populated with current `downloadProfileIds`
- Save button calls `updateShowFn` with new `downloadProfileIds`
- Expand `DownloadProfile` type to include `icon` field (required by `ProfileCheckboxGroup`)

**Movie detail header** (`src/components/movies/movie-detail-header.tsx`):

- Same pattern as show detail header

### 5. Server API and Schema Changes

**Zod schemas** (`src/lib/tmdb-validators.ts`):

- `addShowSchema`: Change `downloadProfileId: z.number()` to `downloadProfileIds: z.array(z.number())`
- `updateShowSchema`: Change `downloadProfileId: z.number().optional()` to `downloadProfileIds: z.array(z.number()).optional()`
- `addMovieSchema`: Same change as shows
- `updateMovieSchema`: Same change as shows

**Shows** (`src/server/shows.ts`):

- `addShowFn`: Loop over `downloadProfileIds` array, insert one junction row per profile ID
- `updateShowFn`: Delete all existing junction rows, then loop-insert new ones

**Movies** (`src/server/movies.ts`):

- `addMovieFn`: Same pattern as shows
- `updateMovieFn`: Same pattern as shows

**Mutation hooks** (`src/hooks/mutations/shows.ts`, `src/hooks/mutations/movies.ts`): Types flow automatically from `z.infer<typeof schema>` — verify call sites compile after schema changes.

## Files Modified

| File                                                          | Change                                                                                              |
| ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `src/components/shared/profile-checkbox-group.tsx`            | **New** — shared checkbox group                                                                     |
| `src/components/bookshelf/hardcover/author-preview-modal.tsx` | Filter profiles to `contentType === "book" && enabled`, use shared component                        |
| `src/components/bookshelf/hardcover/add-author-dialog.tsx`    | Filter profiles to `contentType === "book" && enabled`, use shared component                        |
| `src/components/bookshelf/hardcover/book-preview-modal.tsx`   | Filter profiles to `contentType === "book" && enabled`, use shared component                        |
| `src/components/bookshelf/authors/author-form.tsx`            | Use shared component                                                                                |
| `src/components/tv/tmdb-show-search.tsx`                      | Replace Select with multiselect checkboxes                                                          |
| `src/components/movies/tmdb-movie-search.tsx`                 | Replace Select with multiselect checkboxes                                                          |
| `src/components/tv/show-detail-header.tsx`                    | Add edit button + profile edit dialog, expand DownloadProfile type to include `icon`                |
| `src/components/movies/movie-detail-header.tsx`               | Add edit button + profile edit dialog, expand DownloadProfile type to include `icon`                |
| `src/server/shows.ts`                                         | `downloadProfileId` -> `downloadProfileIds` (add + update), loop-insert junction rows               |
| `src/server/movies.ts`                                        | `downloadProfileId` -> `downloadProfileIds` (add + update), loop-insert junction rows               |
| `src/lib/tmdb-validators.ts`                                  | Update Zod schemas from singular to array                                                           |
| `src/routes/_authed/bookshelf/authors/$authorId.tsx`          | Filter profiles passed to AuthorForm (only the form prop, not other usages like `profileLanguages`) |

## Out of Scope

- Edition-level profile selection (edition_download_profiles junction table exists but is not addressed here)
- Bulk profile editing from list views
- Profile reordering or priority within a media item
