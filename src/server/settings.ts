import { createServerFn } from "@tanstack/react-start";
import { db } from "src/db";
import { settings } from "src/db/schema";
import { eq } from "drizzle-orm";
import { requireAuth } from "./middleware";
import { updateSettingSchema, metadataProfileSchema } from "src/lib/validators";
import { getMetadataProfile } from "./metadata-profile";

export type { MetadataProfile } from "./metadata-profile";

export const getSettingsFn = createServerFn({ method: "GET" }).handler(
  async () => {
    await requireAuth();
    const rows = db.select().from(settings).all();
    const map: Record<string, string | number | boolean | null> = {};
    for (const row of rows) {
      // Values are stored with an extra JSON.stringify wrap (see updateSettingFn).
      // Drizzle's json-mode column deserializes once on read, so string values
      // come back as `"\"actual value\""` — parse once more to unwrap.
      const v = row.value;
      map[row.key] =
        typeof v === "string"
          ? (() => {
              try {
                return JSON.parse(v);
              } catch {
                return v;
              }
            })()
          : v;
    }
    return map;
  },
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

export const regenerateApiKeyFn = createServerFn({ method: "POST" }).handler(
  async () => {
    await requireAuth();
    const newKey = crypto.randomUUID();
    db.insert(settings)
      .values({ key: "general.apiKey", value: JSON.stringify(newKey) })
      .onConflictDoUpdate({
        target: settings.key,
        set: { value: JSON.stringify(newKey) },
      })
      .run();
    return { apiKey: newKey };
  },
);

// ─── Metadata Profile server functions ───────────────────────────────────────

export const getMetadataProfileFn = createServerFn({ method: "GET" }).handler(
  async () => {
    await requireAuth();
    return getMetadataProfile();
  },
);

export const updateMetadataProfileFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => metadataProfileSchema.parse(d))
  .handler(async ({ data }) => {
    await requireAuth();
    db.insert(settings)
      .values({ key: "metadata.profile", value: JSON.stringify(data) })
      .onConflictDoUpdate({
        target: settings.key,
        set: { value: JSON.stringify(data) },
      })
      .run();
    return { success: true };
  });
