# Table Column Configuration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add per-user, per-table column visibility and ordering to all 7 table views, with a settings popover UI and persisted preferences.

**Architecture:** New `user_table_settings` DB table stores column order and hidden columns per user per table. A shared `useTableColumns` hook merges saved settings with hardcoded defaults. A reusable `ColumnSettingsPopover` component with dnd-kit drag-to-reorder and switch toggles sits above each table. Tables render columns dynamically based on the resolved config.

**Tech Stack:** Drizzle ORM (SQLite), TanStack Start server functions, TanStack React Query, dnd-kit (already installed), Radix Popover + Switch (already installed), lucide-react icons.

---

## File Map

### New Files

| File                                                | Responsibility                                                 |
| --------------------------------------------------- | -------------------------------------------------------------- |
| `src/db/schema/user-table-settings.ts`              | Drizzle schema for the new table                               |
| `src/server/user-table-settings.ts`                 | Server functions: get, upsert, delete                          |
| `src/hooks/mutations/user-table-settings.ts`        | Mutation hooks for upsert and reset                            |
| `src/lib/queries/user-table-settings.ts`            | Query options for fetching settings                            |
| `src/lib/table-column-defaults.ts`                  | Hardcoded default column configs for all 7 tables              |
| `src/hooks/use-table-columns.ts`                    | Hook that resolves column config from defaults + user settings |
| `src/components/shared/column-settings-popover.tsx` | Reusable popover with drag-to-reorder + visibility toggles     |

### Modified Files

| File                                                         | Change                                                          |
| ------------------------------------------------------------ | --------------------------------------------------------------- |
| `src/db/schema/index.ts`                                     | Export new schema                                               |
| `src/lib/query-keys.ts`                                      | Add `userTableSettings` query keys                              |
| `src/lib/validators.ts`                                      | Add Zod schemas for upsert/delete                               |
| `src/components/bookshelf/authors/author-table.tsx`          | Refactor to column registry pattern + settings popover          |
| `src/components/bookshelf/books/base-book-table.tsx`         | Add cover to COLUMN_REGISTRY, support monitored in column order |
| `src/components/bookshelf/books/book-table.tsx`              | Wire up useTableColumns + settings popover                      |
| `src/components/bookshelf/books/edition-selection-modal.tsx` | Wire up useTableColumns + settings popover                      |
| `src/routes/_authed/authors/$authorId.tsx`                   | Wire up useTableColumns for both Books and Series tabs          |
| `src/components/tv/show-table.tsx`                           | Refactor to column registry + settings popover + monitor toggle |
| `src/components/movies/movie-table.tsx`                      | Refactor to column registry + settings popover + monitor toggle |
| `src/hooks/mutations/index.ts`                               | Re-export new mutation hooks                                    |

### Generated Files

| File                 | How                                       |
| -------------------- | ----------------------------------------- |
| `drizzle/XXXX_*.sql` | `bun run db:generate` after schema change |

---

## Task 1: Database Schema + Migration

**Files:**

- Create: `src/db/schema/user-table-settings.ts`
- Modify: `src/db/schema/index.ts`

- [ ] **Step 1: Create the schema file**

```typescript
// src/db/schema/user-table-settings.ts
import {
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { user } from "./auth";

export const userTableSettings = sqliteTable(
  "user_table_settings",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    tableId: text("table_id").notNull(),
    columnOrder: text("column_order", { mode: "json" })
      .$type<string[]>()
      .notNull(),
    hiddenColumns: text("hidden_columns", { mode: "json" })
      .$type<string[]>()
      .notNull(),
  },
  (table) => [
    uniqueIndex("user_table_settings_user_table_idx").on(
      table.userId,
      table.tableId,
    ),
  ],
);
```

- [ ] **Step 2: Export from schema index**

In `src/db/schema/index.ts`, add:

```typescript
export * from "./user-table-settings";
```

Add it alphabetically near the other exports.

- [ ] **Step 3: Generate migration**

Run: `bun run db:generate`

Expected: A new migration file is created in `drizzle/` with the CREATE TABLE statement.

- [ ] **Step 4: Apply migration**

Run: `bun run db:migrate`

Expected: Migration applies successfully, the `user_table_settings` table exists in the DB.

- [ ] **Step 5: Commit**

```bash
git add src/db/schema/user-table-settings.ts src/db/schema/index.ts drizzle/
git commit -m "feat: add user_table_settings schema and migration"
```

---

## Task 2: Validators

**Files:**

- Modify: `src/lib/validators.ts`

- [ ] **Step 1: Add the table ID type and validators**

Add at the end of `src/lib/validators.ts`:

```typescript
import { TABLE_IDS } from "src/lib/table-column-defaults";

export const tableIdSchema = z.enum(TABLE_IDS);

export const upsertTableSettingsSchema = z.object({
  tableId: tableIdSchema,
  columnOrder: z.array(z.string()),
  hiddenColumns: z.array(z.string()),
});

export const deleteTableSettingsSchema = z.object({
  tableId: tableIdSchema,
});
```

Note: `TABLE_IDS` is defined in Task 6 (`src/lib/table-column-defaults.ts`). The `TableId` type is also exported from there. If implementing tasks sequentially, create the table-column-defaults file first (Task 6 can be done before Task 2).

- [ ] **Step 2: Commit**

```bash
git add src/lib/validators.ts
git commit -m "feat: add table settings validators"
```

---

## Task 3: Server Functions

**Files:**

- Create: `src/server/user-table-settings.ts`

- [ ] **Step 1: Create server functions file**

```typescript
// src/server/user-table-settings.ts
import { createServerFn } from "@tanstack/react-start";
import { eq, and } from "drizzle-orm";
import { db } from "src/db";
import { userTableSettings } from "src/db/schema";
import { requireAuth } from "src/server/middleware";
import {
  upsertTableSettingsSchema,
  deleteTableSettingsSchema,
  tableIdSchema,
} from "src/lib/validators";

export const getUserTableSettingsFn = createServerFn({ method: "GET" })
  .inputValidator((d: { tableId: string }) => ({
    tableId: tableIdSchema.parse(d.tableId),
  }))
  .handler(async ({ data }) => {
    const session = await requireAuth();
    const row = db
      .select()
      .from(userTableSettings)
      .where(
        and(
          eq(userTableSettings.userId, session.user.id),
          eq(userTableSettings.tableId, data.tableId),
        ),
      )
      .get();

    if (!row) return null;
    return {
      columnOrder: row.columnOrder,
      hiddenColumns: row.hiddenColumns,
    };
  });

export const upsertUserTableSettingsFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => upsertTableSettingsSchema.parse(d))
  .handler(async ({ data }) => {
    const session = await requireAuth();
    db.insert(userTableSettings)
      .values({
        userId: session.user.id,
        tableId: data.tableId,
        columnOrder: data.columnOrder,
        hiddenColumns: data.hiddenColumns,
      })
      .onConflictDoUpdate({
        target: [userTableSettings.userId, userTableSettings.tableId],
        set: {
          columnOrder: data.columnOrder,
          hiddenColumns: data.hiddenColumns,
        },
      })
      .run();
    return { success: true };
  });

export const deleteUserTableSettingsFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => deleteTableSettingsSchema.parse(d))
  .handler(async ({ data }) => {
    const session = await requireAuth();
    db.delete(userTableSettings)
      .where(
        and(
          eq(userTableSettings.userId, session.user.id),
          eq(userTableSettings.tableId, data.tableId),
        ),
      )
      .run();
    return { success: true };
  });
```

- [ ] **Step 2: Commit**

```bash
git add src/server/user-table-settings.ts
git commit -m "feat: add user table settings server functions"
```

---

## Task 4: Query Infrastructure

**Files:**

- Modify: `src/lib/query-keys.ts`
- Create: `src/lib/queries/user-table-settings.ts`

- [ ] **Step 1: Add query keys**

In `src/lib/query-keys.ts`, add a new section (alphabetically near other keys):

```typescript
userTableSettings: {
  all: ["userTableSettings"] as const,
  byTable: (tableId: string) =>
    ["userTableSettings", tableId] as const,
},
```

- [ ] **Step 2: Create query options file**

```typescript
// src/lib/queries/user-table-settings.ts
import { queryOptions } from "@tanstack/react-query";
import { queryKeys } from "src/lib/query-keys";
import { getUserTableSettingsFn } from "src/server/user-table-settings";

export const userTableSettingsQuery = (tableId: string) =>
  queryOptions({
    queryKey: queryKeys.userTableSettings.byTable(tableId),
    queryFn: () => getUserTableSettingsFn({ data: { tableId } }),
    staleTime: Infinity,
  });
```

Note: `staleTime: Infinity` because column settings rarely change and we invalidate manually on mutation.

- [ ] **Step 3: Re-export from queries index**

If `src/lib/queries/index.ts` exists, add:

```typescript
export * from "./user-table-settings";
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/query-keys.ts src/lib/queries/user-table-settings.ts src/lib/queries/index.ts
git commit -m "feat: add user table settings query infrastructure"
```

---

## Task 5: Mutation Hooks

**Files:**

- Create: `src/hooks/mutations/user-table-settings.ts`
- Modify: `src/hooks/mutations/index.ts`

- [ ] **Step 1: Create mutation hooks file**

```typescript
// src/hooks/mutations/user-table-settings.ts
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "src/lib/query-keys";
import {
  upsertUserTableSettingsFn,
  deleteUserTableSettingsFn,
} from "src/server/user-table-settings";

export function useUpsertTableSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      tableId: string;
      columnOrder: string[];
      hiddenColumns: string[];
    }) => upsertUserTableSettingsFn({ data }),
    onMutate: async (variables) => {
      const queryKey = queryKeys.userTableSettings.byTable(variables.tableId);
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData(queryKey);
      queryClient.setQueryData(queryKey, {
        columnOrder: variables.columnOrder,
        hiddenColumns: variables.hiddenColumns,
      });
      return { previous };
    },
    onError: (_err, variables, context) => {
      if (context?.previous !== undefined) {
        queryClient.setQueryData(
          queryKeys.userTableSettings.byTable(variables.tableId),
          context.previous,
        );
      }
    },
    onSettled: (_data, _err, variables) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.userTableSettings.byTable(variables.tableId),
      });
    },
  });
}

export function useResetTableSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { tableId: string }) =>
      deleteUserTableSettingsFn({ data }),
    onMutate: async (variables) => {
      const queryKey = queryKeys.userTableSettings.byTable(variables.tableId);
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData(queryKey);
      queryClient.setQueryData(queryKey, null);
      return { previous };
    },
    onError: (_err, variables, context) => {
      if (context?.previous !== undefined) {
        queryClient.setQueryData(
          queryKeys.userTableSettings.byTable(variables.tableId),
          context.previous,
        );
      }
    },
    onSettled: (_data, _err, variables) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.userTableSettings.byTable(variables.tableId),
      });
    },
  });
}
```

No toast notifications — column setting changes are frequent micro-interactions that shouldn't produce toasts.

- [ ] **Step 2: Re-export from mutations index**

In `src/hooks/mutations/index.ts`, add:

```typescript
export * from "./user-table-settings";
```

- [ ] **Step 3: Commit**

```bash
git add src/hooks/mutations/user-table-settings.ts src/hooks/mutations/index.ts
git commit -m "feat: add user table settings mutation hooks"
```

---

## Task 6: Table Column Defaults

**Files:**

- Create: `src/lib/table-column-defaults.ts`

- [ ] **Step 1: Create the defaults file**

```typescript
// src/lib/table-column-defaults.ts

export type TableColumnDef = {
  /** Unique key identifying this column within the table */
  key: string;
  /** Display label shown in the settings popover and table header */
  label: string;
  /** If true, the column cannot be hidden (always visible) */
  locked?: boolean;
  /** Whether this column is visible by default (ignored if locked) */
  defaultVisible?: boolean;
};

export const TABLE_IDS = [
  "authors",
  "author-books",
  "author-series",
  "books",
  "book-editions",
  "tv",
  "movies",
] as const;

export type TableId = (typeof TABLE_IDS)[number];

export const TABLE_DEFAULTS: Record<TableId, TableColumnDef[]> = {
  authors: [
    { key: "cover", label: "Cover", defaultVisible: true },
    { key: "name", label: "Name", locked: true, defaultVisible: true },
    { key: "bookCount", label: "Books", defaultVisible: true },
    { key: "totalReaders", label: "Readers", defaultVisible: true },
  ],

  "author-books": [
    {
      key: "monitored",
      label: "Monitored",
      locked: true,
      defaultVisible: true,
    },
    { key: "cover", label: "Cover", defaultVisible: true },
    { key: "title", label: "Title", locked: true, defaultVisible: true },
    { key: "releaseDate", label: "Release Date", defaultVisible: true },
    { key: "series", label: "Series", defaultVisible: true },
    { key: "readers", label: "Readers", defaultVisible: true },
    { key: "rating", label: "Rating", defaultVisible: true },
    { key: "format", label: "Type", defaultVisible: true },
    { key: "pages", label: "Pages", defaultVisible: true },
    { key: "isbn10", label: "ISBN 10", defaultVisible: false },
    { key: "isbn13", label: "ISBN-13", defaultVisible: false },
    { key: "asin", label: "ASIN", defaultVisible: false },
    { key: "score", label: "Data Score", defaultVisible: false },
    { key: "author", label: "Author", defaultVisible: false },
  ],

  "author-series": [
    {
      key: "monitored",
      label: "Monitored",
      locked: true,
      defaultVisible: true,
    },
    { key: "cover", label: "Cover", defaultVisible: true },
    { key: "position", label: "#", defaultVisible: true },
    { key: "title", label: "Title", locked: true, defaultVisible: true },
    { key: "releaseDate", label: "Release Date", defaultVisible: true },
    { key: "readers", label: "Readers", defaultVisible: true },
    { key: "rating", label: "Rating", defaultVisible: true },
    { key: "format", label: "Type", defaultVisible: true },
    { key: "pages", label: "Pages", defaultVisible: true },
    { key: "isbn10", label: "ISBN 10", defaultVisible: false },
    { key: "isbn13", label: "ISBN-13", defaultVisible: false },
    { key: "asin", label: "ASIN", defaultVisible: false },
    { key: "score", label: "Data Score", defaultVisible: false },
    { key: "author", label: "Author", defaultVisible: false },
  ],

  books: [
    {
      key: "monitored",
      label: "Monitored",
      locked: true,
      defaultVisible: true,
    },
    { key: "cover", label: "Cover", defaultVisible: true },
    { key: "title", label: "Title", locked: true, defaultVisible: true },
    { key: "author", label: "Author", defaultVisible: true },
    { key: "releaseDate", label: "Release Date", defaultVisible: true },
    { key: "series", label: "Series", defaultVisible: true },
    { key: "readers", label: "Readers", defaultVisible: true },
    { key: "rating", label: "Rating", defaultVisible: true },
  ],

  "book-editions": [
    { key: "cover", label: "Cover", defaultVisible: true },
    { key: "title", label: "Title", locked: true, defaultVisible: true },
    { key: "publisher", label: "Publisher", defaultVisible: true },
    { key: "format", label: "Type", defaultVisible: true },
    { key: "pages", label: "Pages", defaultVisible: true },
    { key: "releaseDate", label: "Release Date", defaultVisible: true },
    { key: "language", label: "Language", defaultVisible: true },
    { key: "readers", label: "Readers", defaultVisible: true },
    { key: "score", label: "Data Score", defaultVisible: true },
    { key: "information", label: "Information", defaultVisible: false },
    { key: "isbn13", label: "ISBN-13", defaultVisible: false },
    { key: "isbn10", label: "ISBN 10", defaultVisible: false },
    { key: "asin", label: "ASIN", defaultVisible: false },
    { key: "country", label: "Country", defaultVisible: false },
  ],

  tv: [
    {
      key: "monitored",
      label: "Monitored",
      locked: true,
      defaultVisible: true,
    },
    { key: "cover", label: "Cover", defaultVisible: true },
    { key: "title", label: "Title", locked: true, defaultVisible: true },
    { key: "year", label: "Year", defaultVisible: true },
    { key: "network", label: "Network", defaultVisible: true },
    { key: "seasons", label: "Seasons", defaultVisible: true },
    { key: "episodes", label: "Episodes", defaultVisible: true },
    { key: "status", label: "Status", defaultVisible: true },
  ],

  movies: [
    {
      key: "monitored",
      label: "Monitored",
      locked: true,
      defaultVisible: true,
    },
    { key: "cover", label: "Cover", defaultVisible: true },
    { key: "title", label: "Title", locked: true, defaultVisible: true },
    { key: "year", label: "Year", defaultVisible: true },
    { key: "studio", label: "Studio", defaultVisible: true },
    { key: "status", label: "Status", defaultVisible: true },
  ],
};

/** Returns the default column order (all column keys) for a table */
export function getDefaultColumnOrder(tableId: TableId): string[] {
  return TABLE_DEFAULTS[tableId].map((c) => c.key);
}

/** Returns the default hidden columns for a table */
export function getDefaultHiddenColumns(tableId: TableId): string[] {
  return TABLE_DEFAULTS[tableId]
    .filter((c) => !c.locked && !c.defaultVisible)
    .map((c) => c.key);
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/table-column-defaults.ts
git commit -m "feat: add table column defaults for all 7 tables"
```

---

## Task 7: useTableColumns Hook

**Files:**

- Create: `src/hooks/use-table-columns.ts`

- [ ] **Step 1: Create the hook**

```typescript
// src/hooks/use-table-columns.ts
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { userTableSettingsQuery } from "src/lib/queries/user-table-settings";
import {
  TABLE_DEFAULTS,
  getDefaultColumnOrder,
  getDefaultHiddenColumns,
  type TableId,
  type TableColumnDef,
} from "src/lib/table-column-defaults";

export type ResolvedColumns = {
  /** All columns in display order (includes hidden) */
  allColumns: TableColumnDef[];
  /** Only visible columns in display order */
  visibleColumns: TableColumnDef[];
  /** Set of hidden column keys for fast lookup */
  hiddenKeys: Set<string>;
  /** Ordered array of all column keys */
  columnOrder: string[];
  /** Array of hidden column keys */
  hiddenColumnKeys: string[];
};

export function useTableColumns(tableId: TableId): ResolvedColumns {
  const defaults = TABLE_DEFAULTS[tableId];
  const { data: userSettings } = useQuery(userTableSettingsQuery(tableId));

  return useMemo(() => {
    const defaultsByKey = new Map(defaults.map((c) => [c.key, c]));

    if (!userSettings) {
      const columnOrder = getDefaultColumnOrder(tableId);
      const hiddenColumnKeys = getDefaultHiddenColumns(tableId);
      const hiddenKeys = new Set(hiddenColumnKeys);
      return {
        allColumns: defaults,
        visibleColumns: defaults.filter((c) => c.locked || c.defaultVisible),
        hiddenKeys,
        columnOrder,
        hiddenColumnKeys,
      };
    }

    const { columnOrder: savedOrder, hiddenColumns: savedHidden } =
      userSettings;

    // Append any new columns not in saved order (future-proofing)
    const savedSet = new Set(savedOrder);
    const newColumns = defaults
      .filter((c) => !savedSet.has(c.key))
      .map((c) => c.key);
    const columnOrder = [...savedOrder, ...newColumns];

    // New columns default to hidden
    const hiddenColumnKeys = [...savedHidden, ...newColumns];
    const hiddenKeys = new Set(hiddenColumnKeys);

    // Enforce locked columns are never hidden
    for (const col of defaults) {
      if (col.locked) hiddenKeys.delete(col.key);
    }

    // Filter to only keys that exist in defaults (remove stale keys)
    const allColumns = columnOrder
      .map((key) => defaultsByKey.get(key))
      .filter((c): c is TableColumnDef => c !== undefined);

    const visibleColumns = allColumns.filter(
      (c) => c.locked || !hiddenKeys.has(c.key),
    );

    return {
      allColumns,
      visibleColumns,
      hiddenKeys,
      columnOrder: allColumns.map((c) => c.key),
      hiddenColumnKeys: [...hiddenKeys],
    };
  }, [defaults, userSettings, tableId]);
}
```

- [ ] **Step 2: Commit**

```bash
git add src/hooks/use-table-columns.ts
git commit -m "feat: add useTableColumns hook"
```

---

## Task 8: Column Settings Popover

**Files:**

- Create: `src/components/shared/column-settings-popover.tsx`

This is the reusable popover with dnd-kit drag-to-reorder and switch toggles. It reads from `useTableColumns` and writes via the upsert/reset mutations.

- [ ] **Step 1: Create the component**

```tsx
// src/components/shared/column-settings-popover.tsx
import { useCallback } from "react";
import type { JSX } from "react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, SlidersHorizontal } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "src/components/ui/popover";
import { Button } from "src/components/ui/button";
import Switch from "src/components/ui/switch";
import { useTableColumns } from "src/hooks/use-table-columns";
import {
  useUpsertTableSettings,
  useResetTableSettings,
} from "src/hooks/mutations/user-table-settings";
import type { TableId, TableColumnDef } from "src/lib/table-column-defaults";

function SortableColumnItem({
  column,
  visible,
  onToggle,
}: {
  column: TableColumnDef;
  visible: boolean;
  onToggle: () => void;
}): JSX.Element {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: column.key });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-2 rounded-md px-2 py-1.5 ${
        isDragging ? "bg-muted opacity-50" : ""
      }`}
    >
      <button
        type="button"
        className="cursor-grab touch-none text-muted-foreground hover:text-foreground"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <span className="flex-1 text-sm">{column.label}</span>
      {column.locked ? (
        <span className="text-xs text-muted-foreground">Always</span>
      ) : (
        <Switch size="sm" checked={visible} onCheckedChange={onToggle} />
      )}
    </div>
  );
}

export default function ColumnSettingsPopover({
  tableId,
}: {
  tableId: TableId;
}): JSX.Element {
  const { allColumns, hiddenKeys, columnOrder, hiddenColumnKeys } =
    useTableColumns(tableId);
  const upsert = useUpsertTableSettings();
  const reset = useResetTableSettings();

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const persist = useCallback(
    (newOrder: string[], newHidden: string[]) => {
      upsert.mutate({
        tableId,
        columnOrder: newOrder,
        hiddenColumns: newHidden,
      });
    },
    [tableId, upsert],
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      const oldIndex = columnOrder.indexOf(active.id as string);
      const newIndex = columnOrder.indexOf(over.id as string);
      const newOrder = arrayMove(columnOrder, oldIndex, newIndex);
      persist(newOrder, hiddenColumnKeys);
    },
    [columnOrder, hiddenColumnKeys, persist],
  );

  const handleToggle = useCallback(
    (key: string) => {
      const newHidden = hiddenKeys.has(key)
        ? hiddenColumnKeys.filter((k) => k !== key)
        : [...hiddenColumnKeys, key];
      persist(columnOrder, newHidden);
    },
    [hiddenKeys, hiddenColumnKeys, columnOrder, persist],
  );

  const handleReset = useCallback(() => {
    reset.mutate({ tableId });
  }, [tableId, reset]);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon-sm" title="Column settings">
          <SlidersHorizontal className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 p-0">
        <PopoverHeader>
          <PopoverTitle>Columns</PopoverTitle>
        </PopoverHeader>
        <div className="max-h-80 overflow-y-auto px-2 py-1">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={columnOrder}
              strategy={verticalListSortingStrategy}
            >
              {allColumns.map((col) => (
                <SortableColumnItem
                  key={col.key}
                  column={col}
                  visible={!hiddenKeys.has(col.key)}
                  onToggle={() => handleToggle(col.key)}
                />
              ))}
            </SortableContext>
          </DndContext>
        </div>
        <div className="border-t px-2 py-2">
          <Button
            variant="ghost"
            size="sm"
            className="w-full text-muted-foreground"
            onClick={handleReset}
          >
            Reset to defaults
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/shared/column-settings-popover.tsx
git commit -m "feat: add column settings popover with drag-to-reorder"
```

---

## Task 9: Refactor AuthorTable

**Files:**

- Modify: `src/components/bookshelf/authors/author-table.tsx`

The author table currently renders 3 inline columns plus a cover image. Refactor to use the column registry pattern so `useTableColumns` can control order and visibility.

- [ ] **Step 1: Add imports and column registry**

Add to the top of `author-table.tsx`:

```typescript
import { useTableColumns } from "src/hooks/use-table-columns";
import ColumnSettingsPopover from "src/components/shared/column-settings-popover";
```

Define a column registry above the component (after imports, replacing the inline column array):

```typescript
type AuthorRow = {
  id: number;
  name: string;
  image: string | null;
  bookCount: number;
  totalReaders: number;
};

const COLUMN_REGISTRY: Record<
  string,
  {
    label: string;
    render: (row: AuthorRow) => ReactNode;
    sortable?: boolean;
    cellClassName?: string;
  }
> = {
  name: {
    label: "Name",
    render: (row) => row.name,
    sortable: true,
  },
  bookCount: {
    label: "Books",
    render: (row) => row.bookCount,
    sortable: true,
  },
  totalReaders: {
    label: "Readers",
    render: (row) => row.totalReaders.toLocaleString(),
    sortable: true,
  },
};
```

- [ ] **Step 2: Wire up useTableColumns and refactor rendering**

Inside the AuthorTable component, add:

```typescript
const { visibleColumns, hiddenKeys } = useTableColumns("authors");
```

Refactor the table header to iterate over `visibleColumns`:

```tsx
<TableHeader>
  <TableRow>
    {visibleColumns.map((col) => {
      if (col.key === "cover") {
        return <TableHead key="cover" className="w-14" />;
      }
      const def = COLUMN_REGISTRY[col.key];
      if (!def) return null;
      return (
        <TableHead
          key={col.key}
          className={`cursor-pointer select-none ${def.cellClassName ?? ""}`}
          onClick={() => def.sortable && handleSort(col.key as keyof Author)}
        >
          <div className="flex items-center gap-1">
            {def.label}
            {def.sortable && <SortIcon columnKey={col.key} />}
          </div>
        </TableHead>
      );
    })}
  </TableRow>
</TableHeader>
```

And the table body cells:

```tsx
<TableRow key={author.id} className="cursor-pointer" onClick={() => navigate(...)}>
  {visibleColumns.map((col) => {
    if (col.key === "cover") {
      return (
        <TableCell key="cover" className="w-14 p-2">
          <OptimizedImage ... />
        </TableCell>
      );
    }
    const def = COLUMN_REGISTRY[col.key];
    if (!def) return null;
    return (
      <TableCell key={col.key} className={def.cellClassName}>
        {col.key === "name" ? (
          <Link to="/authors/$authorId" params={{ authorId: String(author.id) }} className="font-medium hover:underline" onClick={(e) => e.stopPropagation()}>
            {def.render(author)}
          </Link>
        ) : (
          def.render(author)
        )}
      </TableCell>
    );
  })}
</TableRow>
```

- [ ] **Step 3: Add settings popover above the table**

Add the `ColumnSettingsPopover` above the `<Table>` element. If there's already a wrapper div or toolbar area, add it there. Otherwise wrap:

```tsx
<div>
  <div className="flex justify-end pb-2">
    <ColumnSettingsPopover tableId="authors" />
  </div>
  <Table>{/* existing table content */}</Table>
</div>
```

Note: The exact placement depends on the parent component's layout. The popover trigger should sit in the toolbar area above the table, alongside any existing controls (search, filter, view toggle). Check the parent route component to find where the toolbar lives. If the toolbar is in the parent, the popover may need to be passed as a prop or slot.

- [ ] **Step 4: Verify build**

Run: `bun run build`

Expected: Build succeeds with no type errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/bookshelf/authors/author-table.tsx
git commit -m "feat: wire up column config for authors table"
```

---

## Task 10: Refactor BaseBookTable

**Files:**

- Modify: `src/components/bookshelf/books/base-book-table.tsx`

BaseBookTable already has a `COLUMN_REGISTRY` and takes a `columns` prop. The refactor needs to:

1. Add "cover" as a column in the registry
2. Support "monitored" as a column key (rendered via `renderLeadingCell`)
3. Render columns in the order provided by the `columns` prop (which consumers will filter/reorder based on `useTableColumns`)

- [ ] **Step 1: Add cover to COLUMN_REGISTRY**

In `base-book-table.tsx`, add to the `COLUMN_REGISTRY` object:

```typescript
cover: {
  label: "Cover",
  render: () => null, // Cover rendering is handled specially in the JSX
},
```

And add `"cover"` and `"monitored"` to the `ColumnKey` type:

```typescript
export type ColumnKey =
  | "cover"
  | "monitored"
  | "title"
  | "author"
  | "releaseDate";
// ... existing keys
```

- [ ] **Step 2: Refactor header rendering to handle cover and monitored**

Update the header rendering loop to handle the special columns:

```tsx
<TableHeader>
  <TableRow>
    {columns.map((col) => {
      if (col.key === "monitored") {
        return <TableHead key="monitored" className="w-10" />;
      }
      if (col.key === "cover") {
        return <TableHead key="cover" className="w-14" />;
      }
      const def = COLUMN_REGISTRY[col.key];
      if (!def) return null;
      return (
        <TableHead
          key={col.key}
          className={`${col.sortable ? "cursor-pointer select-none" : ""} ${def.cellClassName ?? ""}`}
          onClick={() => col.sortable && onSort?.(col.key)}
        >
          <div className="flex items-center gap-1">
            {def.label}
            {col.sortable && <SortIcon columnKey={col.key} />}
          </div>
        </TableHead>
      );
    })}
  </TableRow>
</TableHeader>
```

- [ ] **Step 3: Refactor body cell rendering to handle cover and monitored**

Update the body rendering loop:

```tsx
<TableRow key={row.id} ...>
  {columns.map((col) => {
    if (col.key === "monitored") {
      return (
        <TableCell key="monitored" className="w-10 p-0">
          {renderLeadingCell?.(row)}
        </TableCell>
      );
    }
    if (col.key === "cover") {
      return (
        <TableCell key="cover" className="w-14 p-2">
          <OptimizedImage
            src={row.coverUrl}
            alt=""
            width={56}
            height={84}
            className="rounded"
            style={{ aspectRatio: "2/3" }}
          />
        </TableCell>
      );
    }
    const def = COLUMN_REGISTRY[col.key];
    if (!def) return null;
    return (
      <TableCell key={col.key} className={def.cellClassName}>
        {def.render(row, currentAuthorId)}
      </TableCell>
    );
  })}
</TableRow>
```

- [ ] **Step 4: Remove the old separate cover image and leading cell rendering**

Remove the previously hard-coded cover image cell and leading cell that were rendered outside the column loop. They are now part of the column iteration.

- [ ] **Step 5: Verify build**

Run: `bun run build`

Expected: Build succeeds. Existing consumers (BookTable, EditionSelectionModal, AuthorBooksTab) still work because they pass columns arrays that include "cover" and "monitored" keys.

- [ ] **Step 6: Commit**

```bash
git add src/components/bookshelf/books/base-book-table.tsx
git commit -m "refactor: add cover and monitored to BaseBookTable column system"
```

---

## Task 11: Wire Up BookTable (/books)

**Files:**

- Modify: `src/components/bookshelf/books/book-table.tsx`

- [ ] **Step 1: Add imports**

```typescript
import { useTableColumns } from "src/hooks/use-table-columns";
import ColumnSettingsPopover from "src/components/shared/column-settings-popover";
```

- [ ] **Step 2: Replace hardcoded COLUMNS with useTableColumns**

Remove the static `COLUMNS` constant. Inside the component:

```typescript
const { visibleColumns } = useTableColumns("books");

const columns = useMemo(
  () =>
    visibleColumns.map((col) => ({
      key: col.key as ColumnKey,
      sortable:
        col.key === "title" ||
        col.key === "author" ||
        col.key === "releaseDate" ||
        col.key === "series" ||
        col.key === "readers" ||
        col.key === "rating",
    })),
  [visibleColumns],
);
```

Note: "monitored" and "cover" are included in `visibleColumns` — BaseBookTable now handles them in the column loop (from Task 10).

- [ ] **Step 3: Add settings popover**

Add `<ColumnSettingsPopover tableId="books" />` to the toolbar area above the table. Check the parent component that renders BookTable to find the right slot.

- [ ] **Step 4: Remove the old "monitored" column from BOOKS_TAB_COLUMNS if it existed**

The old separate "monitored" badge column (key `"monitored"` with Badge rendering) is replaced by the locked Monitored column that renders ProfileToggleIcons via `renderLeadingCell`. Remove `{ key: "monitored" }` from the columns array if present — the "monitored" key now maps to the toggle icons.

- [ ] **Step 5: Verify build**

Run: `bun run build`

Expected: Build succeeds.

- [ ] **Step 6: Commit**

```bash
git add src/components/bookshelf/books/book-table.tsx
git commit -m "feat: wire up column config for /books table"
```

---

## Task 12: Wire Up Author Books Tab

**Files:**

- Modify: `src/routes/_authed/authors/$authorId.tsx`

- [ ] **Step 1: Add imports**

Add to the imports section of `$authorId.tsx`:

```typescript
import { useTableColumns } from "src/hooks/use-table-columns";
import ColumnSettingsPopover from "src/components/shared/column-settings-popover";
```

- [ ] **Step 2: Replace BOOKS_TAB_COLUMNS with useTableColumns**

Inside the `BooksTab` component, remove the static `BOOKS_TAB_COLUMNS` constant. Replace with:

```typescript
const { visibleColumns } = useTableColumns("author-books");

const columns = useMemo(
  () =>
    visibleColumns.map((col) => ({
      key: col.key as ColumnKey,
      sortable:
        col.key === "title" ||
        col.key === "releaseDate" ||
        col.key === "series" ||
        col.key === "readers" ||
        col.key === "rating",
    })),
  [visibleColumns],
);
```

- [ ] **Step 3: Remove the old "monitored" badge column**

The old `{ key: "monitored" as const }` entry in the columns array rendered a Badge. Remove it. The "monitored" key now renders the ProfileToggleIcons via `renderLeadingCell` in the column iteration (from Task 10).

- [ ] **Step 4: Add settings popover to the books tab toolbar**

In the books tab header area (around lines 429-470 where the search input and language selector live), add:

```tsx
<ColumnSettingsPopover tableId="author-books" />
```

Place it in the toolbar row, near the existing controls.

- [ ] **Step 5: Verify build**

Run: `bun run build`

Expected: Build succeeds.

- [ ] **Step 6: Commit**

```bash
git add src/routes/_authed/authors/$authorId.tsx
git commit -m "feat: wire up column config for author books tab"
```

---

## Task 13: Wire Up Author Series Tab

**Files:**

- Modify: `src/routes/_authed/authors/$authorId.tsx`

The series tab is custom-built (not using BaseBookTable). It renders columns manually in JSX. Refactor it to use a column registry pattern with `useTableColumns`.

- [ ] **Step 1: Define a column registry for the series tab**

Add above the series tab component (or in the same file, near the top):

```typescript
type SeriesBookRow = {
  // The union of local book + external entry fields needed for rendering
  id: number | string;
  title: string;
  position: string | number | null;
  coverUrl: string | null;
  releaseDate: string | null;
  usersCount: number | null;
  rating: number | null;
  ratingsCount: number | null;
  format: string | null;
  pageCount: number | null;
  isbn10: string | null;
  isbn13: string | null;
  asin: string | null;
  score: number | null;
  authors: BookAuthorEntry[];
};

const SERIES_COLUMN_REGISTRY: Record<
  string,
  {
    label: string;
    render: (row: SeriesBookRow, currentAuthorId?: number) => ReactNode;
    headerClassName?: string;
    cellClassName?: string;
  }
> = {
  position: {
    label: "#",
    headerClassName: "w-12",
    render: (row) => row.position ?? "—",
  },
  cover: {
    label: "",
    headerClassName: "w-14",
    render: (row) => (
      <OptimizedImage
        src={row.coverUrl}
        alt=""
        width={56}
        height={84}
        className="rounded"
        style={{ aspectRatio: "2/3" }}
      />
    ),
  },
  title: {
    label: "Title",
    render: (row) => <span className="font-medium">{row.title}</span>,
  },
  releaseDate: {
    label: "Release Date",
    render: (row) => row.releaseDate ?? "—",
  },
  readers: {
    label: "Readers",
    render: (row) =>
      row.usersCount != null ? row.usersCount.toLocaleString() : "—",
  },
  rating: {
    label: "Rating",
    render: (row) =>
      row.rating != null ? (
        <span className="flex items-center gap-1">
          <Star className="h-3.5 w-3.5 fill-yellow-500 text-yellow-500" />
          {row.rating.toFixed(1)}
          {row.ratingsCount != null && (
            <span className="text-muted-foreground">
              ({row.ratingsCount.toLocaleString()})
            </span>
          )}
        </span>
      ) : (
        "—"
      ),
  },
  format: {
    label: "Type",
    render: (row) => row.format ?? "—",
  },
  pages: {
    label: "Pages",
    render: (row) =>
      row.pageCount != null ? row.pageCount.toLocaleString() : "—",
  },
  isbn10: {
    label: "ISBN 10",
    render: (row) => row.isbn10 ?? "—",
  },
  isbn13: {
    label: "ISBN-13",
    render: (row) => row.isbn13 ?? "—",
  },
  asin: {
    label: "ASIN",
    render: (row) => row.asin ?? "—",
  },
  score: {
    label: "Data Score",
    render: (row) => (row.score != null ? row.score : "—"),
  },
  author: {
    label: "Author",
    render: (row, currentAuthorId) => (
      <AdditionalAuthors
        authors={row.authors}
        currentAuthorId={currentAuthorId}
      />
    ),
  },
};
```

- [ ] **Step 2: Use useTableColumns in the series tab section**

```typescript
const { visibleColumns: seriesVisibleColumns } =
  useTableColumns("author-series");
```

- [ ] **Step 3: Refactor table headers**

Replace the hardcoded `<TableHeader>` block (lines ~987-1003) with:

```tsx
<TableHeader>
  <TableRow>
    {seriesVisibleColumns.map((col) => {
      if (col.key === "monitored") {
        return <TableHead key="monitored" className="w-10" />;
      }
      const def = SERIES_COLUMN_REGISTRY[col.key];
      if (!def) return null;
      return (
        <TableHead key={col.key} className={def.headerClassName}>
          {def.label}
        </TableHead>
      );
    })}
  </TableRow>
</TableHeader>
```

- [ ] **Step 4: Refactor table body cells for local books**

Replace the manually rendered cells for each local book row with a column iteration:

```tsx
<TableRow key={book.id}>
  {seriesVisibleColumns.map((col) => {
    if (col.key === "monitored") {
      return (
        <TableCell key="monitored" className="w-10 p-0">
          {/* Existing MetadataWarning or ProfileToggleIcons logic */}
        </TableCell>
      );
    }
    const def = SERIES_COLUMN_REGISTRY[col.key];
    if (!def) return null;
    return (
      <TableCell key={col.key} className={def.cellClassName}>
        {def.render(normalizedRow, authorId)}
      </TableCell>
    );
  })}
</TableRow>
```

The `normalizedRow` should map the existing book data into the `SeriesBookRow` shape. Build this mapping from the existing rendering logic.

- [ ] **Step 5: Refactor table body cells for external entries**

Same pattern for external (Hardcover) entries — iterate over `seriesVisibleColumns` and use the registry. For external entries, the "monitored" column renders the Plus button instead of ProfileToggleIcons.

- [ ] **Step 6: Add settings popover to the series tab toolbar**

In the series tab header area (around lines 892-931), add:

```tsx
<ColumnSettingsPopover tableId="author-series" />
```

- [ ] **Step 7: Verify build**

Run: `bun run build`

Expected: Build succeeds.

- [ ] **Step 8: Commit**

```bash
git add src/routes/_authed/authors/$authorId.tsx
git commit -m "feat: wire up column config for author series tab"
```

---

## Task 14: Wire Up Edition Selection Modal

**Files:**

- Modify: `src/components/bookshelf/books/edition-selection-modal.tsx`

- [ ] **Step 1: Add imports**

```typescript
import { useTableColumns } from "src/hooks/use-table-columns";
import ColumnSettingsPopover from "src/components/shared/column-settings-popover";
```

- [ ] **Step 2: Replace EDITION_COLUMNS with useTableColumns**

Remove the static `EDITION_COLUMNS` constant. Inside the component:

```typescript
const { visibleColumns } = useTableColumns("book-editions");

const columns = useMemo(
  () =>
    visibleColumns.map((col) => ({
      key: col.key as ColumnKey,
      sortable: true, // All edition columns were sortable
    })),
  [visibleColumns],
);
```

- [ ] **Step 3: Add settings popover to the dialog header area**

In the area between the dialog header and the table (near the "Show matching formats only" switch), add:

```tsx
<div className="flex items-center justify-between">
  <div className="flex items-center gap-2">
    <Switch ... />
    <Label ...>Show matching formats only</Label>
  </div>
  <ColumnSettingsPopover tableId="book-editions" />
</div>
```

- [ ] **Step 4: Verify build**

Run: `bun run build`

Expected: Build succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/components/bookshelf/books/edition-selection-modal.tsx
git commit -m "feat: wire up column config for edition selection modal"
```

---

## Task 15: Refactor ShowTable + Add Monitor Toggle

**Files:**

- Modify: `src/components/tv/show-table.tsx`

The show table needs two changes: (1) refactor to column registry pattern for configurable columns, and (2) add a Monitored locked column with ProfileToggleIcons.

- [ ] **Step 1: Add imports**

```typescript
import { useTableColumns } from "src/hooks/use-table-columns";
import ColumnSettingsPopover from "src/components/shared/column-settings-popover";
import ProfileToggleIcons from "src/components/shared/profile-toggle-icons";
```

- [ ] **Step 2: Define column registry**

Replace the inline column array with a registry:

```typescript
const SHOW_COLUMN_REGISTRY: Record<
  string,
  {
    label: string;
    render: (show: Show) => ReactNode;
    sortable?: boolean;
    cellClassName?: string;
  }
> = {
  title: {
    label: "Title",
    sortable: true,
    render: (show) => (
      <Link
        to="/tv/series/$showId"
        params={{ showId: String(show.id) }}
        className="font-medium hover:underline"
        onClick={(e) => e.stopPropagation()}
      >
        {show.title}
      </Link>
    ),
  },
  year: {
    label: "Year",
    sortable: true,
    render: (show) => (show.year === 0 ? "—" : show.year),
  },
  network: {
    label: "Network",
    sortable: true,
    cellClassName: "text-muted-foreground",
    render: (show) => show.network || "—",
  },
  seasons: {
    label: "Seasons",
    sortable: true,
    render: (show) => show.seasonCount,
  },
  episodes: {
    label: "Episodes",
    sortable: true,
    render: (show) => `${show.episodeFileCount}/${show.episodeCount}`,
  },
  status: {
    label: "Status",
    sortable: true,
    render: (show) => {
      const badge = STATUS_BADGE[show.status] ?? {
        className: "bg-zinc-600",
        label: show.status,
      };
      return (
        <Badge className={`${badge.className} text-white`}>
          {badge.label}
        </Badge>
      );
    },
  },
};
```

- [ ] **Step 3: Wire up useTableColumns and refactor rendering**

Inside the component:

```typescript
const { visibleColumns } = useTableColumns("tv");
```

Refactor the header and body to iterate over `visibleColumns`:

**Header:**

```tsx
<TableHeader>
  <TableRow>
    {selectable && <TableHead className="w-10">...</TableHead>}
    {visibleColumns.map((col) => {
      if (col.key === "monitored") {
        return <TableHead key="monitored" className="w-10" />;
      }
      if (col.key === "cover") {
        return <TableHead key="cover" className="w-14" />;
      }
      const def = SHOW_COLUMN_REGISTRY[col.key];
      if (!def) return null;
      return (
        <TableHead
          key={col.key}
          className={`${def.sortable ? "cursor-pointer select-none" : ""} ${def.cellClassName ?? ""}`}
          onClick={() => def.sortable && handleSort(col.key)}
        >
          <div className="flex items-center gap-1">
            {def.label}
            {def.sortable && <SortIcon columnKey={col.key} />}
          </div>
        </TableHead>
      );
    })}
  </TableRow>
</TableHeader>
```

**Body:**

```tsx
<TableRow key={show.id}>
  {selectable && <TableCell>...</TableCell>}
  {visibleColumns.map((col) => {
    if (col.key === "monitored") {
      return (
        <TableCell key="monitored" className="w-10 p-0">
          <ProfileToggleIcons
            profiles={downloadProfiles}
            activeProfileIds={show.downloadProfileIds}
            onToggle={(profileId, active) =>
              onToggleProfile?.(show.id, profileId, active)
            }
          />
        </TableCell>
      );
    }
    if (col.key === "cover") {
      return (
        <TableCell key="cover" className="w-14 p-2">
          <OptimizedImage
            src={resizeTmdbUrl(show.posterPath, "w185")}
            alt=""
            width={56}
            height={84}
            className="rounded"
            style={{ aspectRatio: "2/3" }}
          />
        </TableCell>
      );
    }
    const def = SHOW_COLUMN_REGISTRY[col.key];
    if (!def) return null;
    return (
      <TableCell key={col.key} className={def.cellClassName}>
        {def.render(show)}
      </TableCell>
    );
  })}
</TableRow>
```

- [ ] **Step 4: Add props for monitor toggle**

The component needs new props for the monitor toggle to work:

```typescript
type ShowTableProps = {
  shows: Show[];
  // ... existing props
  downloadProfiles?: DownloadProfile[];
  onToggleProfile?: (
    showId: number,
    profileId: number,
    active: boolean,
  ) => void;
};
```

The parent component (TV index route) will pass download profiles and the toggle handler. Check `src/routes/_authed/tv/index.tsx` (or similar) for how the BookTable pattern works and replicate it for shows.

- [ ] **Step 5: Add settings popover**

Add `<ColumnSettingsPopover tableId="tv" />` to the toolbar area above the table.

- [ ] **Step 6: Verify build**

Run: `bun run build`

Expected: Build succeeds.

- [ ] **Step 7: Commit**

```bash
git add src/components/tv/show-table.tsx
git commit -m "feat: wire up column config and monitor toggle for /tv table"
```

---

## Task 16: Refactor MovieTable + Add Monitor Toggle

**Files:**

- Modify: `src/components/movies/movie-table.tsx`

Same pattern as Task 15 but for movies.

- [ ] **Step 1: Add imports**

```typescript
import { useTableColumns } from "src/hooks/use-table-columns";
import ColumnSettingsPopover from "src/components/shared/column-settings-popover";
import ProfileToggleIcons from "src/components/shared/profile-toggle-icons";
```

- [ ] **Step 2: Define column registry**

```typescript
const MOVIE_COLUMN_REGISTRY: Record<
  string,
  {
    label: string;
    render: (movie: Movie) => ReactNode;
    sortable?: boolean;
    cellClassName?: string;
  }
> = {
  title: {
    label: "Title",
    sortable: true,
    render: (movie) => (
      <Link
        to="/movies/$movieId"
        params={{ movieId: String(movie.id) }}
        className="font-medium hover:underline"
        onClick={(e) => e.stopPropagation()}
      >
        {movie.title}
      </Link>
    ),
  },
  year: {
    label: "Year",
    sortable: true,
    render: (movie) => (movie.year === 0 ? "—" : movie.year),
  },
  studio: {
    label: "Studio",
    sortable: true,
    cellClassName: "text-muted-foreground",
    render: (movie) => movie.studio || "—",
  },
  status: {
    label: "Status",
    sortable: true,
    render: (movie) => {
      const badge = STATUS_BADGE[movie.status] ?? {
        className: "bg-zinc-600",
        label: movie.status ?? "TBA",
      };
      return (
        <Badge className={`${badge.className} text-white`}>
          {badge.label}
        </Badge>
      );
    },
  },
};
```

- [ ] **Step 3: Wire up useTableColumns and refactor rendering**

Inside the component:

```typescript
const { visibleColumns } = useTableColumns("movies");
```

Refactor header and body to iterate over `visibleColumns`, following the exact same pattern as Task 15 Step 3 but using `MOVIE_COLUMN_REGISTRY`, the movie's `posterPath`, and movie-specific link (`/movies/$movieId`).

- [ ] **Step 4: Add props for monitor toggle**

Same pattern as Task 15 Step 4:

```typescript
type MovieTableProps = {
  movies: Movie[];
  // ... existing props
  downloadProfiles?: DownloadProfile[];
  onToggleProfile?: (
    movieId: number,
    profileId: number,
    active: boolean,
  ) => void;
};
```

The parent component (movies index route) passes download profiles and the toggle handler.

- [ ] **Step 5: Add settings popover**

Add `<ColumnSettingsPopover tableId="movies" />` to the toolbar area above the table.

- [ ] **Step 6: Verify build**

Run: `bun run build`

Expected: Build succeeds.

- [ ] **Step 7: Commit**

```bash
git add src/components/movies/movie-table.tsx
git commit -m "feat: wire up column config and monitor toggle for /movies table"
```

---

## Task 17: Final Build Verification

- [ ] **Step 1: Full production build**

Run: `bun run build`

Expected: Build completes with no errors.

- [ ] **Step 2: Verify all table IDs are consistent**

Grep the codebase for all `tableId` usages and ensure they match the 7 defined IDs:

```bash
grep -r "tableId.*=.*['\"]" src/ --include="*.ts" --include="*.tsx"
```

Expected: Only the 7 valid table IDs appear: `authors`, `author-books`, `author-series`, `books`, `book-editions`, `tv`, `movies`.

- [ ] **Step 3: Commit any remaining changes**

```bash
git add -A
git commit -m "chore: final cleanup for table column configuration"
```
