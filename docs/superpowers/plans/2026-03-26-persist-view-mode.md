# Persist View Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist list/grid view preference per page per user to the database, and rename `userTableSettings` to `userSettings`.

**Architecture:** Rename the existing `userTableSettings` table/infrastructure to `userSettings`, add a nullable `viewMode` column, add a `useViewMode` hook, and update 4 page components to load/persist their view toggle.

**Tech Stack:** Drizzle ORM, TanStack Query, TanStack Start server functions, Zod, React

---

### Task 1: Rename schema file and update Drizzle table

**Files:**

- Rename: `src/db/schema/user-table-settings.ts` → `src/db/schema/user-settings.ts`
- Modify: `src/db/schema/index.ts:36`

- [ ] **Step 1: Create renamed schema file with viewMode column**

Create `src/db/schema/user-settings.ts` with the renamed table and new column:

```typescript
import {
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { user } from "./auth";

export const userSettings = sqliteTable(
  "user_settings",
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
    viewMode: text("view_mode").$type<"table" | "grid">(),
  },
  (table) => [
    uniqueIndex("user_settings_user_table_idx").on(table.userId, table.tableId),
  ],
);
```

- [ ] **Step 2: Delete old schema file**

```bash
rm src/db/schema/user-table-settings.ts
```

- [ ] **Step 3: Update schema barrel export**

In `src/db/schema/index.ts`, change line 36 from:

```typescript
export * from "./user-table-settings";
```

to:

```typescript
export * from "./user-settings";
```

- [ ] **Step 4: Generate migration**

```bash
cd /Users/pauldiloreto/Projects/allstarr && bun run db:generate
```

Expected: A new migration file in `drizzle/` that renames `user_table_settings` → `user_settings`, drops the old unique index, creates a new unique index, and adds `view_mode` column.

**Important:** Drizzle may generate a destructive migration (drop + recreate table) instead of a rename. Review the generated SQL. If it drops the table, manually edit the migration to use `ALTER TABLE ... RENAME TO` and `ALTER TABLE ... ADD COLUMN` instead. The migration should look approximately like:

```sql
ALTER TABLE `user_table_settings` RENAME TO `user_settings`;
DROP INDEX IF EXISTS `user_table_settings_user_table_idx`;
CREATE UNIQUE INDEX `user_settings_user_table_idx` ON `user_settings` (`user_id`, `table_id`);
ALTER TABLE `user_settings` ADD `view_mode` text;
```

- [ ] **Step 5: Run migration**

```bash
cd /Users/pauldiloreto/Projects/allstarr && bun run db:migrate
```

Expected: Migration applies successfully.

- [ ] **Step 6: Commit**

```bash
git add src/db/schema/user-settings.ts src/db/schema/index.ts drizzle/
git rm src/db/schema/user-table-settings.ts
git commit -m "feat: rename userTableSettings to userSettings and add viewMode column"
```

---

### Task 2: Rename server functions file

**Files:**

- Rename: `src/server/user-table-settings.ts` → `src/server/user-settings.ts`

- [ ] **Step 1: Create renamed server functions file**

Create `src/server/user-settings.ts`:

```typescript
import { createServerFn } from "@tanstack/react-start";
import { eq, and } from "drizzle-orm";
import { db } from "src/db";
import { userSettings } from "src/db/schema";
import { requireAuth } from "src/server/middleware";
import {
  upsertUserSettingsSchema,
  deleteUserSettingsSchema,
  tableIdSchema,
} from "src/lib/validators";

export const getUserSettingsFn = createServerFn({ method: "GET" })
  .inputValidator((d: { tableId: string }) => ({
    tableId: tableIdSchema.parse(d.tableId),
  }))
  .handler(async ({ data }) => {
    const session = await requireAuth();
    const row = db
      .select()
      .from(userSettings)
      .where(
        and(
          eq(userSettings.userId, session.user.id),
          eq(userSettings.tableId, data.tableId),
        ),
      )
      .get();

    if (!row) {
      return null;
    }
    return {
      columnOrder: row.columnOrder,
      hiddenColumns: row.hiddenColumns,
      viewMode: row.viewMode,
    };
  });

export const upsertUserSettingsFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => upsertUserSettingsSchema.parse(d))
  .handler(async ({ data }) => {
    const session = await requireAuth();
    const set: Record<string, unknown> = {};
    if (data.columnOrder !== undefined) set.columnOrder = data.columnOrder;
    if (data.hiddenColumns !== undefined)
      set.hiddenColumns = data.hiddenColumns;
    if (data.viewMode !== undefined) set.viewMode = data.viewMode;

    db.insert(userSettings)
      .values({
        userId: session.user.id,
        tableId: data.tableId,
        columnOrder: data.columnOrder ?? [],
        hiddenColumns: data.hiddenColumns ?? [],
        viewMode: data.viewMode ?? null,
      })
      .onConflictDoUpdate({
        target: [userSettings.userId, userSettings.tableId],
        set,
      })
      .run();
    return { success: true };
  });

export const deleteUserSettingsFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => deleteUserSettingsSchema.parse(d))
  .handler(async ({ data }) => {
    const session = await requireAuth();
    db.delete(userSettings)
      .where(
        and(
          eq(userSettings.userId, session.user.id),
          eq(userSettings.tableId, data.tableId),
        ),
      )
      .run();
    return { success: true };
  });
```

- [ ] **Step 2: Delete old server file**

```bash
rm src/server/user-table-settings.ts
```

- [ ] **Step 3: Commit**

```bash
git add src/server/user-settings.ts
git rm src/server/user-table-settings.ts
git commit -m "feat: rename server functions to user-settings"
```

---

### Task 3: Update validators

**Files:**

- Modify: `src/lib/validators.ts:457-468`

- [ ] **Step 1: Update validator schemas**

In `src/lib/validators.ts`, replace lines 457-468:

```typescript
// Table Column Settings
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

with:

```typescript
// User Settings
export const tableIdSchema = z.enum(TABLE_IDS);

export const upsertUserSettingsSchema = z.object({
  tableId: tableIdSchema,
  columnOrder: z.array(z.string()).optional(),
  hiddenColumns: z.array(z.string()).optional(),
  viewMode: z.enum(["table", "grid"]).optional(),
});

export const deleteUserSettingsSchema = z.object({
  tableId: tableIdSchema,
});
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/validators.ts
git commit -m "feat: rename validator schemas and add viewMode field"
```

---

### Task 4: Rename query file and query keys

**Files:**

- Rename: `src/lib/queries/user-table-settings.ts` → `src/lib/queries/user-settings.ts`
- Modify: `src/lib/queries/index.ts:18`
- Modify: `src/lib/query-keys.ts:223-227`

- [ ] **Step 1: Create renamed query file**

Create `src/lib/queries/user-settings.ts`:

```typescript
// oxlint-disable explicit-module-boundary-types -- queryOptions return type is complex generic
// oxlint-disable import/prefer-default-export -- consistent with other query files in this directory
import { queryOptions } from "@tanstack/react-query";
import { queryKeys } from "src/lib/query-keys";
import { getUserSettingsFn } from "src/server/user-settings";

export const userSettingsQuery = (tableId: string) =>
  queryOptions({
    queryKey: queryKeys.userSettings.byTable(tableId),
    queryFn: () => getUserSettingsFn({ data: { tableId } }),
    staleTime: Number.POSITIVE_INFINITY,
  });
```

- [ ] **Step 2: Delete old query file**

```bash
rm src/lib/queries/user-table-settings.ts
```

- [ ] **Step 3: Update queries barrel**

In `src/lib/queries/index.ts`, change line 18 from:

```typescript
export * from "./user-table-settings";
```

to:

```typescript
export * from "./user-settings";
```

- [ ] **Step 4: Update query keys**

In `src/lib/query-keys.ts`, replace lines 223-227:

```typescript
  // ─── User Table Settings ────────────────────────────────────────────────
  userTableSettings: {
    all: ["userTableSettings"] as const,
    byTable: (tableId: string) => ["userTableSettings", tableId] as const,
  },
```

with:

```typescript
  // ─── User Settings ────────────────────────────────────────────────────
  userSettings: {
    all: ["userSettings"] as const,
    byTable: (tableId: string) => ["userSettings", tableId] as const,
  },
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/queries/user-settings.ts src/lib/queries/index.ts src/lib/query-keys.ts
git rm src/lib/queries/user-table-settings.ts
git commit -m "feat: rename query file and query keys to userSettings"
```

---

### Task 5: Rename mutation hooks file

**Files:**

- Rename: `src/hooks/mutations/user-table-settings.ts` → `src/hooks/mutations/user-settings.ts`
- Modify: `src/hooks/mutations/index.ts:15`

- [ ] **Step 1: Create renamed mutations file**

Create `src/hooks/mutations/user-settings.ts`:

```typescript
// oxlint-disable explicit-module-boundary-types -- useMutation return type is complex generic
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "src/lib/query-keys";
import {
  upsertUserSettingsFn,
  deleteUserSettingsFn,
} from "src/server/user-settings";

export function useUpsertUserSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      tableId: string;
      columnOrder?: string[];
      hiddenColumns?: string[];
      viewMode?: "table" | "grid";
    }) => upsertUserSettingsFn({ data }),
    onMutate: async (variables) => {
      const queryKey = queryKeys.userSettings.byTable(variables.tableId);
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData(queryKey);
      queryClient.setQueryData(
        queryKey,
        (old: Record<string, unknown> | null) => ({
          ...old,
          ...variables,
        }),
      );
      return { previous };
    },
    onError: (_err, variables, context) => {
      if (context?.previous !== undefined) {
        queryClient.setQueryData(
          queryKeys.userSettings.byTable(variables.tableId),
          context.previous,
        );
      }
    },
    onSettled: (_data, _err, variables) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.userSettings.byTable(variables.tableId),
      });
    },
  });
}

export function useResetUserSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { tableId: string }) => deleteUserSettingsFn({ data }),
    onMutate: async (variables) => {
      const queryKey = queryKeys.userSettings.byTable(variables.tableId);
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData(queryKey);
      queryClient.setQueryData(queryKey, null);
      return { previous };
    },
    onError: (_err, variables, context) => {
      if (context?.previous !== undefined) {
        queryClient.setQueryData(
          queryKeys.userSettings.byTable(variables.tableId),
          context.previous,
        );
      }
    },
    onSettled: (_data, _err, variables) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.userSettings.byTable(variables.tableId),
      });
    },
  });
}
```

- [ ] **Step 2: Delete old mutations file**

```bash
rm src/hooks/mutations/user-table-settings.ts
```

- [ ] **Step 3: Update mutations barrel**

In `src/hooks/mutations/index.ts`, change line 15 from:

```typescript
export * from "./user-table-settings";
```

to:

```typescript
export * from "./user-settings";
```

- [ ] **Step 4: Commit**

```bash
git add src/hooks/mutations/user-settings.ts src/hooks/mutations/index.ts
git rm src/hooks/mutations/user-table-settings.ts
git commit -m "feat: rename mutation hooks to userSettings"
```

---

### Task 6: Update consumers — useTableColumns and ColumnSettingsPopover

**Files:**

- Modify: `src/hooks/use-table-columns.ts:3,26`
- Modify: `src/components/shared/column-settings-popover.tsx:32-34,93-94`

- [ ] **Step 1: Update useTableColumns imports**

In `src/hooks/use-table-columns.ts`, change line 3 from:

```typescript
import { userTableSettingsQuery } from "src/lib/queries/user-table-settings";
```

to:

```typescript
import { userSettingsQuery } from "src/lib/queries/user-settings";
```

And change line 26 from:

```typescript
const { data: userSettings } = useQuery(userTableSettingsQuery(tableId));
```

to:

```typescript
const { data: userSettings } = useQuery(userSettingsQuery(tableId));
```

- [ ] **Step 2: Update ColumnSettingsPopover imports**

In `src/components/shared/column-settings-popover.tsx`, change lines 32-34 from:

```typescript
import {
  useUpsertTableSettings,
  useResetTableSettings,
} from "src/hooks/mutations/user-table-settings";
```

to:

```typescript
import {
  useUpsertUserSettings,
  useResetUserSettings,
} from "src/hooks/mutations/user-settings";
```

And change lines 93-94 from:

```typescript
const upsert = useUpsertTableSettings();
const reset = useResetTableSettings();
```

to:

```typescript
const upsert = useUpsertUserSettings();
const reset = useResetUserSettings();
```

- [ ] **Step 3: Verify build**

```bash
cd /Users/pauldiloreto/Projects/allstarr && bun run build
```

Expected: Build succeeds with no errors. This confirms the full rename chain is wired correctly.

- [ ] **Step 4: Commit**

```bash
git add src/hooks/use-table-columns.ts src/components/shared/column-settings-popover.tsx
git commit -m "feat: update consumers to use renamed userSettings"
```

---

### Task 7: Create useViewMode hook

**Files:**

- Create: `src/hooks/use-view-mode.ts`

- [ ] **Step 1: Create the hook**

Create `src/hooks/use-view-mode.ts`:

```typescript
import { useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { userSettingsQuery } from "src/lib/queries/user-settings";
import { useUpsertUserSettings } from "src/hooks/mutations/user-settings";
import type { TableId } from "src/lib/table-column-defaults";

const PAGE_VIEW_DEFAULTS: Partial<Record<TableId, "table" | "grid">> = {
  authors: "table",
  books: "table",
  movies: "grid",
  tv: "grid",
};

export function useViewMode(tableId: TableId) {
  const { data: settings } = useQuery(userSettingsQuery(tableId));
  const upsert = useUpsertUserSettings();

  const defaultView = PAGE_VIEW_DEFAULTS[tableId] ?? "table";
  const view = settings?.viewMode ?? defaultView;

  const setView = useCallback(
    (mode: "table" | "grid") => {
      upsert.mutate({ tableId, viewMode: mode });
    },
    [tableId, upsert],
  );

  return [view, setView] as const;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/hooks/use-view-mode.ts
git commit -m "feat: add useViewMode hook for persisted view preferences"
```

---

### Task 8: Update page components to use useViewMode

**Files:**

- Modify: `src/routes/_authed/authors/index.tsx:2,25`
- Modify: `src/routes/_authed/books/index.tsx:2,34`
- Modify: `src/routes/_authed/movies/index.tsx:2,55`
- Modify: `src/routes/_authed/tv/index.tsx:2,55`

- [ ] **Step 1: Update authors page**

In `src/routes/_authed/authors/index.tsx`:

Add import (after existing imports):

```typescript
import { useViewMode } from "src/hooks/use-view-mode";
```

Replace line 25:

```typescript
const [view, setView] = useState<"table" | "grid">("table");
```

with:

```typescript
const [view, setView] = useViewMode("authors");
```

Remove `useState` from the React import on line 2 if it's no longer used elsewhere. Check: `search`, `sentinelRef` still use `useState` and `useRef`, so keep those. Just ensure `useState` stays since `search` uses it.

- [ ] **Step 2: Update books page**

In `src/routes/_authed/books/index.tsx`:

Add import:

```typescript
import { useViewMode } from "src/hooks/use-view-mode";
```

Replace line 34:

```typescript
const [view, setView] = useState<"table" | "grid">("table");
```

with:

```typescript
const [view, setView] = useViewMode("books");
```

- [ ] **Step 3: Update movies page**

In `src/routes/_authed/movies/index.tsx`:

Add import:

```typescript
import { useViewMode } from "src/hooks/use-view-mode";
```

Replace line 55:

```typescript
const [view, setView] = useState<"table" | "grid">("grid");
```

with:

```typescript
const [view, setView] = useViewMode("movies");
```

- [ ] **Step 4: Update TV page**

In `src/routes/_authed/tv/index.tsx`:

Add import:

```typescript
import { useViewMode } from "src/hooks/use-view-mode";
```

Replace line 55:

```typescript
const [view, setView] = useState<"table" | "grid">("grid");
```

with:

```typescript
const [view, setView] = useViewMode("tv");
```

- [ ] **Step 5: Verify build**

```bash
cd /Users/pauldiloreto/Projects/allstarr && bun run build
```

Expected: Build succeeds with no errors.

- [ ] **Step 6: Commit**

```bash
git add src/routes/_authed/authors/index.tsx src/routes/_authed/books/index.tsx src/routes/_authed/movies/index.tsx src/routes/_authed/tv/index.tsx
git commit -m "feat: persist view mode preference per page"
```
