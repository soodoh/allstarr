# Persist View Mode Per Page

## Summary

Persist the list/card (table/grid) view preference per page per user to the database. Currently the view toggle is ephemeral `useState` that resets on reload. Each page (authors, books, movies, tv) should remember the user's last-selected view mode.

## Changes

### 1. Rename `userTableSettings` to `userSettings`

The existing `userTableSettings` table already has `userId + tableId` keying and stores per-page column preferences. Rename it to `userSettings` since it will evolve to store other per-user, per-page settings beyond table columns.

**Rename scope:**

- Schema file: `src/db/schema/user-table-settings.ts` → `src/db/schema/user-settings.ts`
- Drizzle table variable: `userTableSettings` → `userSettings`
- SQLite table name: `"user_table_settings"` → `"user_settings"`
- Server functions file: `src/server/user-table-settings.ts` → `src/server/user-settings.ts`
- Server function names: `getUserTableSettingsFn` → `getUserSettingsFn`, `upsertUserTableSettingsFn` → `upsertUserSettingsFn`, `deleteUserTableSettingsFn` → `deleteUserSettingsFn`
- Query file: `src/lib/queries/user-table-settings.ts` → `src/lib/queries/user-settings.ts`
- Mutation hook file: `src/hooks/mutations/user-table-settings.ts` → `src/hooks/mutations/user-settings.ts`
- Hook file: `src/hooks/use-table-columns.ts` — update imports
- Component: `src/components/shared/column-settings-popover.tsx` — update imports
- Schema index: `src/db/schema/index.ts` — update export
- All route files that reference these

### 2. Add `viewMode` column

Add a nullable `text` column `view_mode` to the `userSettings` table:

```typescript
viewMode: text("view_mode").$type<"table" | "grid">(),
```

Nullable — `null` means "use page default." No data migration needed since existing rows just get `null`.

### 3. Migration

Drizzle generates a migration that:

- Renames `user_table_settings` → `user_settings`
- Adds `view_mode` column (nullable text)

### 4. Update server functions

- `upsertUserSettingsFn` accepts optional `viewMode` in its input schema
- `getUserSettingsFn` returns `viewMode` in its response

### 5. Update page components

Each page (authors, books, movies, tv) at `src/routes/_authed/{page}/index.tsx`:

- Load `viewMode` from the user settings query for that `tableId`
- Initialize `useState` with the persisted value, falling back to the page default:
  - Authors: `"table"`
  - Books: `"table"`
  - Movies: `"grid"`
  - TV: `"grid"`
- On toggle: call the upsert mutation with the new `viewMode` (optimistic update)

### 6. Update validators

Update the Zod schema for the upsert input to include optional `viewMode` field.

## Non-goals

- No new tables or files — reuse and rename existing infrastructure
- No changes to column settings behavior — that continues to work as-is
