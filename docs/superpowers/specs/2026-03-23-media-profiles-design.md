# Media Profile Selection: Consistent Multi-Select Across Content Types

## Problem

Profile selection is inconsistent across media types:

- **Authors**: Checkbox multiselect but shows ALL profiles (not filtered to book profiles)
- **TV Shows**: Single-select dropdown, no post-add editing
- **Movies**: Single-select dropdown, no post-add editing

The data model already supports multiple profiles per media item (junction tables exist for all types), but the UI and server APIs don't consistently expose this.

## Changes

### 1. Shared `ProfileCheckboxGroup` Component

Extract a reusable component from the duplicated checkbox rendering across author flows.

**File:** `src/components/shared/profile-checkbox-group.tsx`

```tsx
type ProfileCheckboxGroupProps = {
  profiles: Array<{ id: number; name: string; icon: string }>;
  selectedIds: number[];
  onToggle: (id: number) => void;
};
```

Renders a vertical list of checkboxes with profile icon and name. Used by all add/edit flows.

### 2. Filter Profiles by Content Type

All profile selection UI must filter by content type before rendering:

| Context                                           | Filter                                   |
| ------------------------------------------------- | ---------------------------------------- |
| Author add (author-preview-modal `AddForm`)       | `contentType === "book"`                 |
| Author add (add-author-dialog)                    | `contentType === "book"`                 |
| Author edit (author-form via $authorId)           | `contentType === "book"`                 |
| TV show add (tmdb-show-search `ShowPreviewModal`) | `contentType === "tv"` (already done)    |
| Movie add (tmdb-movie-search `MoviePreviewModal`) | `contentType === "movie"` (already done) |

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

**Movie detail header** (`src/components/movies/movie-detail-header.tsx`):

- Same pattern as show detail header

### 5. Server API Changes

**Shows** (`src/server/shows.ts`):

- `addShowFn`: Change `downloadProfileId: number` to `downloadProfileIds: z.array(z.number())`. Insert multiple junction rows.
- `updateShowFn`: Change `downloadProfileId: number` to `downloadProfileIds: z.array(z.number()).optional()`. Delete existing rows, insert new ones.

**Movies** (`src/server/movies.ts`):

- `addMovieFn`: Same change as shows.
- `updateMovieFn`: Same change as shows.

**Validators** (`src/lib/validators.ts`): Update any related Zod schemas.

### 6. Mutation Hook Updates

- `useAddShow`: Update input type to `downloadProfileIds: number[]`
- `useAddMovie`: Update input type to `downloadProfileIds: number[]`
- `useUpdateShow`: Update input type to `downloadProfileIds?: number[]`
- `useUpdateMovie`: Update input type to `downloadProfileIds?: number[]`

## Files Modified

| File                                                          | Change                                                            |
| ------------------------------------------------------------- | ----------------------------------------------------------------- |
| `src/components/shared/profile-checkbox-group.tsx`            | **New** — shared checkbox group                                   |
| `src/components/bookshelf/hardcover/author-preview-modal.tsx` | Filter profiles to `contentType === "book"`, use shared component |
| `src/components/bookshelf/hardcover/add-author-dialog.tsx`    | Filter profiles to `contentType === "book"`, use shared component |
| `src/components/bookshelf/authors/author-form.tsx`            | Use shared component                                              |
| `src/components/tv/tmdb-show-search.tsx`                      | Replace Select with multiselect checkboxes                        |
| `src/components/movies/tmdb-movie-search.tsx`                 | Replace Select with multiselect checkboxes                        |
| `src/components/tv/show-detail-header.tsx`                    | Add edit button + profile edit dialog                             |
| `src/components/movies/movie-detail-header.tsx`               | Add edit button + profile edit dialog                             |
| `src/server/shows.ts`                                         | `downloadProfileId` -> `downloadProfileIds` (add + update)        |
| `src/server/movies.ts`                                        | `downloadProfileId` -> `downloadProfileIds` (add + update)        |
| `src/lib/validators.ts`                                       | Update Zod schemas if applicable                                  |
| `src/hooks/mutations/shows.ts`                                | Update types                                                      |
| `src/hooks/mutations/movies.ts`                               | Update types                                                      |
| `src/routes/_authed/bookshelf/authors/$authorId.tsx`          | Filter profiles passed to AuthorForm                              |

## Out of Scope

- Edition-level profile selection (edition_download_profiles junction table exists but is not addressed here)
- Bulk profile editing from list views
- Profile reordering or priority within a media item
