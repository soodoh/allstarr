import { createServerFn } from "@tanstack/react-start";
import { db } from "~/db";
import { settings } from "~/db/schema";
import { eq } from "drizzle-orm";
import { requireAuth } from "./middleware";
import { updateSettingSchema } from "~/lib/validators";

export const getSettingsFn = createServerFn({ method: "GET" }).handler(
  async () => {
    await requireAuth();
    const rows = db.select().from(settings).all();
    const map: Record<string, unknown> = {};
    for (const row of rows) {
      map[row.key] = row.value;
    }
    return map;
  }
);

export const getSettingFn = createServerFn({ method: "GET" })
  .inputValidator((d: { key: string }) => d)
  .handler(async ({ data }) => {
    await requireAuth();
    const row = db
      .select()
      .from(settings)
      .where(eq(settings.key, data.key))
      .get();
    return row?.value ?? null;
  });

export const updateSettingFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => updateSettingSchema.parse(d))
  .handler(async ({ data }) => {
    await requireAuth();
    db.insert(settings)
      .values({ key: data.key, value: JSON.stringify(data.value) })
      .onConflictDoUpdate({
        target: settings.key,
        set: { value: JSON.stringify(data.value) },
      })
      .run();
    return { success: true };
  });
