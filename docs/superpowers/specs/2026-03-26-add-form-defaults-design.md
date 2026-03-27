# Add Form Defaults & Autofocus Design

## Problem

When adding movies, TV shows, or books, the add pages don't autofocus the search input, and form options (download profiles, monitor settings, etc.) reset to hardcoded defaults every time. Users have to re-select their preferred options on each add. Additionally, all download profiles default to checked, which is the wrong default for most users.

## Design

### Autofocus

Add `autoFocus` to the search input on all three add pages:

- Movies: `src/components/movies/tmdb-movie-search.tsx`
- TV Shows: `src/components/tv/tmdb-show-search.tsx`
- Books: `src/routes/_authed/books/add.tsx`

### Persisted Add Form Defaults

Extend the existing `user_settings` table with an `addDefaults` JSON column (nullable). The column stores the last-used form options per content type, scoped by the existing `tableId` + `userId` unique index.

#### Schema Change

Add to `user_settings`:

```typescript
addDefaults: text("add_defaults", { mode: "json" }).$type<AddDefaults>();
```

#### JSON Shape by Content Type

**Movies** (`tableId: "movies"`):

```typescript
{
  downloadProfileIds: number[];
  monitorOption: "movieOnly" | "movieAndCollection" | "none";
  minimumAvailability: "announced" | "inCinemas" | "released";
  searchOnAdd: boolean;
}
```

**TV Shows** (`tableId: "tv"`):

```typescript
{
  downloadProfileIds: number[];
  monitorOption: "all" | "future" | "missing" | "existing" | "pilot" | "firstSeason" | "lastSeason" | "none";
  useSeasonFolder: boolean;
  searchOnAdd: boolean;
  searchCutoffUnmet: boolean;
}
```

Note: `seriesType` is NOT persisted. It always defaults to `"standard"`.

**Books** (`tableId: "books"`) -- shared for both book and author add forms:

```typescript
{
  downloadProfileIds: number[];
  monitorOption: "all" | "future" | "missing" | "existing" | "first" | "latest" | "none";
  monitorNewBooks: "all" | "new" | "none";
  searchOnAdd: boolean;
}
```

#### Default Behavior

When `addDefaults` is `null` (no saved preferences):

- Download profiles: **all unchecked** (empty array)
- All other fields: same hardcoded defaults as today (e.g., monitorOption: "movieOnly" for movies, "all" for TV/books, searchOnAdd: false, etc.)
- TV seriesType: always "standard" regardless of saved preferences

#### Save Trigger

When a user clicks "Add" on any add form, the current form state is saved as `addDefaults` fire-and-forget alongside the actual add mutation. No extra user action needed. No loading state or error toast for the settings save -- if it fails silently, the user just gets defaults next time.

#### Loading Defaults

Each add form component reads `userSettingsQuery(tableId)` and initializes form state from `settings?.addDefaults?.fieldName ?? hardcodedDefault`. The query uses `staleTime: Infinity`, so it's instant after first load. Route loaders prefetch user settings for the add pages.

### Server & Data Flow

- `upsertUserSettingsSchema`: add optional `addDefaults` field
- `upsertUserSettingsFn`: handle `addDefaults` in the partial update pattern (same as columnOrder/viewMode)
- `getUserSettingsFn`: return `addDefaults` alongside existing fields
- `useUpsertUserSettings` mutation: extend type to include `addDefaults` (optimistic update works via spread)

### Files Changed

| File                                                          | Change                                                                                           |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `src/db/schema/user-settings.ts`                              | Add `addDefaults` JSON column (nullable)                                                         |
| `drizzle/` migration                                          | New migration for the column                                                                     |
| `src/lib/validators.ts`                                       | Add `addDefaults` to `upsertUserSettingsSchema`                                                  |
| `src/server/user-settings.ts`                                 | Handle `addDefaults` in get/upsert functions                                                     |
| `src/hooks/mutations/user-settings.ts`                        | Extend mutation type to include `addDefaults`                                                    |
| `src/components/movies/tmdb-movie-search.tsx`                 | Autofocus, init from saved defaults, save on add, default profiles unchecked                     |
| `src/components/tv/tmdb-show-search.tsx`                      | Autofocus, init from saved defaults (except seriesType), save on add, default profiles unchecked |
| `src/routes/_authed/books/add.tsx`                            | Autofocus, pass settings to preview modals                                                       |
| `src/components/bookshelf/hardcover/book-preview-modal.tsx`   | Init from saved defaults, save on add, default profiles unchecked                                |
| `src/components/bookshelf/hardcover/author-preview-modal.tsx` | Init from saved defaults, save on add, default profiles unchecked                                |
| `src/routes/_authed/movies/add.tsx`                           | Prefetch user settings in route loader                                                           |
| `src/routes/_authed/tv/add.tsx`                               | Prefetch user settings in route loader                                                           |

### Not Changing

- No new tables, hooks, or query functions
- No changes to server-side add/import functions
- Episode group selection is not persisted (show-specific, not a preference)
