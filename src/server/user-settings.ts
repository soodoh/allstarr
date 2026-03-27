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
      addDefaults: row.addDefaults,
    };
  });

export const upsertUserSettingsFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => upsertUserSettingsSchema.parse(d))
  .handler(async ({ data }) => {
    const session = await requireAuth();
    const set: Record<string, unknown> = {};
    if (data.columnOrder !== undefined) {
      set.columnOrder = data.columnOrder;
    }
    if (data.hiddenColumns !== undefined) {
      set.hiddenColumns = data.hiddenColumns;
    }
    if (data.viewMode !== undefined) {
      set.viewMode = data.viewMode;
    }
    if (data.addDefaults !== undefined) {
      set.addDefaults = data.addDefaults;
    }

    db.insert(userSettings)
      .values({
        userId: session.user.id,
        tableId: data.tableId,
        columnOrder: data.columnOrder ?? [],
        hiddenColumns: data.hiddenColumns ?? [],
        viewMode: data.viewMode ?? null,
        addDefaults: data.addDefaults ?? null,
      })
      .onConflictDoUpdate({
        target: [userSettings.userId, userSettings.tableId],
        set,
      })
      .run();
    return { success: true };
  });

export const resetColumnSettingsFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => deleteUserSettingsSchema.parse(d))
  .handler(async ({ data }) => {
    const session = await requireAuth();
    db.update(userSettings)
      .set({ columnOrder: [], hiddenColumns: [] })
      .where(
        and(
          eq(userSettings.userId, session.user.id),
          eq(userSettings.tableId, data.tableId),
        ),
      )
      .run();
    return { success: true };
  });
