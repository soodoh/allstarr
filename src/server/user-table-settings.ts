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

    if (!row) {
      return null;
    }
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
