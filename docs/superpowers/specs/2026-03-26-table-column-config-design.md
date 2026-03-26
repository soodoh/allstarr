# Table Column Configuration

Per-user, per-table column visibility and ordering for all table views in Allstarr.

## Problem

Tables across the app have fixed column layouts. Users can't hide columns they don't care about (e.g. ISBN fields) or reorder columns to match their workflow. Different users may want different views of the same data.

## Scope

Seven tables across the app:

| Table ID        | Route          | Notes                       |
| --------------- | -------------- | --------------------------- |
| `authors`       | `/authors`     | Table view only (not cards) |
| `author-books`  | `/authors/$id` | Books tab                   |
| `author-series` | `/authors/$id` | Series tab                  |
| `books`         | `/books`       | Table view only (not cards) |
| `book-editions` | `/books/$id`   | Edition selection modal     |
| `tv`            | `/tv`          | Table view only             |
| `movies`        | `/movies`      | Table view only             |

## Database Schema

New table: `user_table_settings`

| Column          | Type                          | Description                  |
| --------------- | ----------------------------- | ---------------------------- |
| `id`            | integer (PK, autoincrement)   | Primary key                  |
| `userId`        | text (FK → user.id, NOT NULL) | User who owns this config    |
| `tableId`       | text (NOT NULL)               | One of the 7 table IDs above |
| `columnOrder`   | text (JSON)                   | Ordered array of column keys |
| `hiddenColumns` | text (JSON)                   | Array of hidden column keys  |

- Unique constraint on `(userId, tableId)`.
- If no row exists for a user+table, fall back to hardcoded defaults.
- `columnOrder` contains ALL column keys for the table in display order.
- A column is visible if it appears in `columnOrder` but NOT in `hiddenColumns`.

No seed data needed — absence of a row means "use defaults." The defaults are hardcoded in the app.

## Column Categories

Each table's columns fall into two categories:

### Locked columns

Always visible. Cannot be hidden. Can be reordered relative to each other and relative to configurable columns.

- **Monitored** — the toggle icon buttons for monitoring state. Present on: `author-books`, `author-series`, `books`, `tv`, `movies`. NOT present on: `authors`, `book-editions`.
- **Title** (or **Name** for the authors table) — the primary identifier column. Present on all tables.

### Configurable columns

Can be reordered and toggled visible/hidden.

- **Cover image** — the poster/cover thumbnail. Configurable and visible by default on all tables.
- All other data columns.

## Default Column Order and Visibility

### 1. `authors` — /authors

| Order | Column Key   | Locked | Default Visible |
| ----- | ------------ | ------ | --------------- |
| 1     | cover        | No     | Yes             |
| 2     | name         | Yes    | Always          |
| 3     | bookCount    | No     | Yes             |
| 4     | totalReaders | No     | Yes             |

### 2. `author-books` — /authors/$id Books tab

| Order | Column Key  | Locked | Default Visible |
| ----- | ----------- | ------ | --------------- |
| 1     | monitored   | Yes    | Always          |
| 2     | cover       | No     | Yes             |
| 3     | title       | Yes    | Always          |
| 4     | releaseDate | No     | Yes             |
| 5     | series      | No     | Yes             |
| 6     | readers     | No     | Yes             |
| 7     | rating      | No     | Yes             |
| 8     | format      | No     | Yes             |
| 9     | pages       | No     | Yes             |
| 10    | isbn10      | No     | No              |
| 11    | isbn13      | No     | No              |
| 12    | asin        | No     | No              |
| 13    | score       | No     | No              |
| 14    | author      | No     | No              |

### 3. `author-series` — /authors/$id Series tab

| Order | Column Key  | Locked | Default Visible |
| ----- | ----------- | ------ | --------------- |
| 1     | monitored   | Yes    | Always          |
| 2     | cover       | No     | Yes             |
| 3     | position    | No     | Yes             |
| 4     | title       | Yes    | Always          |
| 5     | releaseDate | No     | Yes             |
| 6     | readers     | No     | Yes             |
| 7     | rating      | No     | Yes             |
| 8     | format      | No     | Yes             |
| 9     | pages       | No     | Yes             |
| 10    | isbn10      | No     | No              |
| 11    | isbn13      | No     | No              |
| 12    | asin        | No     | No              |
| 13    | score       | No     | No              |
| 14    | author      | No     | No              |

### 4. `books` — /books

| Order | Column Key  | Locked | Default Visible |
| ----- | ----------- | ------ | --------------- |
| 1     | monitored   | Yes    | Always          |
| 2     | cover       | No     | Yes             |
| 3     | title       | Yes    | Always          |
| 4     | author      | No     | Yes             |
| 5     | releaseDate | No     | Yes             |
| 6     | series      | No     | Yes             |
| 7     | readers     | No     | Yes             |
| 8     | rating      | No     | Yes             |

### 5. `book-editions` — /books/$id Editions modal

| Order | Column Key  | Locked | Default Visible |
| ----- | ----------- | ------ | --------------- |
| 1     | cover       | No     | Yes             |
| 2     | title       | Yes    | Always          |
| 3     | publisher   | No     | Yes             |
| 4     | format      | No     | Yes             |
| 5     | pages       | No     | Yes             |
| 6     | releaseDate | No     | Yes             |
| 7     | language    | No     | Yes             |
| 8     | readers     | No     | Yes             |
| 9     | score       | No     | Yes             |
| 10    | information | No     | No              |
| 11    | isbn13      | No     | No              |
| 12    | isbn10      | No     | No              |
| 13    | asin        | No     | No              |
| 14    | country     | No     | No              |

### 6. `tv` — /tv

| Order | Column Key | Locked | Default Visible |
| ----- | ---------- | ------ | --------------- |
| 1     | monitored  | Yes    | Always          |
| 2     | cover      | No     | Yes             |
| 3     | title      | Yes    | Always          |
| 4     | year       | No     | Yes             |
| 5     | network    | No     | Yes             |
| 6     | seasons    | No     | Yes             |
| 7     | episodes   | No     | Yes             |
| 8     | status     | No     | Yes             |

### 7. `movies` — /movies

| Order | Column Key | Locked | Default Visible |
| ----- | ---------- | ------ | --------------- |
| 1     | monitored  | Yes    | Always          |
| 2     | cover      | No     | Yes             |
| 3     | title      | Yes    | Always          |
| 4     | year       | No     | Yes             |
| 5     | studio     | No     | Yes             |
| 6     | status     | No     | Yes             |

## UI: Settings Popover

### Trigger

A settings icon button (sliders/gear icon) positioned above each table, aligned with existing toolbar controls (e.g. sort, filter, view toggle).

### Popover Content

A reorderable list of all columns for that table:

- Each row: drag handle, column name, visibility toggle (eye icon or switch)
- Locked columns show the column name but have no visibility toggle (they are always on). They can still be dragged to reorder.
- Drag to reorder, toggle to show/hide.

A "Reset to defaults" link/button at the bottom — restores hardcoded defaults and deletes the user's row from `user_table_settings`.

### Save Behavior

Changes persist immediately on interaction (optimistic updates). Reordering or toggling a column instantly reflects in the table, with a background server call to upsert the `user_table_settings` row. No explicit "Save" button.

## Data Flow

### Reading settings

1. Table component mounts, queries `getUserTableSettingsFn({ tableId })`.
2. If a row exists, use `columnOrder` and `hiddenColumns` to determine visible columns and their order.
3. If no row exists, use the hardcoded defaults from a `TABLE_DEFAULTS` constant.

### Writing settings

1. User drags or toggles in the popover.
2. Optimistic update: table re-renders immediately with new column config.
3. Background call to `upsertUserTableSettingsFn({ tableId, columnOrder, hiddenColumns })`.
4. Server upserts the row (INSERT ... ON CONFLICT DO UPDATE).

### New columns added in future

When the app adds a new column to a table, users with saved settings won't see it until they reset or the app merges new columns into their saved order. Strategy: on read, append any column keys from the default that are missing from the user's `columnOrder` to the end. New columns default to hidden so they don't disrupt existing layouts.

## Monitor Toggle for TV and Movies

The `/tv` and `/movies` tables currently lack monitor toggle icons. As part of this work, add a Monitored locked column to both tables matching the pattern used in `/books`:

- Toggle icon button in the leading cell
- Calls the existing update server function to toggle the monitored state
- Same visual treatment as the books table monitor toggle

## Server Functions

### `getUserTableSettingsFn`

- Method: GET
- Input: `{ tableId: string }`
- Auth: `requireAuth()` to get userId
- Returns: `{ columnOrder: string[], hiddenColumns: string[] } | null`

### `upsertUserTableSettingsFn`

- Method: POST
- Input: `{ tableId: string, columnOrder: string[], hiddenColumns: string[] }`
- Auth: `requireAuth()` to get userId
- Upserts the row in `user_table_settings`

### `deleteUserTableSettingsFn`

- Method: POST
- Input: `{ tableId: string }`
- Auth: `requireAuth()` to get userId
- Deletes the user's row (reset to defaults)
