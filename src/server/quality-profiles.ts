import { createServerFn } from "@tanstack/react-start";
import { db } from "src/db";
import { qualityProfiles, qualityDefinitions } from "src/db/schema";
import { eq } from "drizzle-orm";
import { requireAuth } from "./middleware";
import {
  createQualityProfileSchema,
  updateQualityProfileSchema,
  createQualityDefinitionSchema,
  updateQualityDefinitionSchema,
} from "src/lib/validators";
import { invalidateQualityDefCache } from "./indexers/quality-parser";

async function validateRootFolderPath(rootFolderPath: string): Promise<void> {
  if (!rootFolderPath) {
    return;
  }
  const fs = await import("node:fs");
  if (!fs.existsSync(rootFolderPath)) {
    throw new Error(`Root folder does not exist: ${rootFolderPath}`);
  }
}

export const getQualityProfilesFn = createServerFn({ method: "GET" }).handler(
  async () => {
    await requireAuth();
    return db.select().from(qualityProfiles).all();
  },
);

export const getQualityProfileFn = createServerFn({ method: "GET" })
  .inputValidator((d: { id: number }) => d)
  .handler(async ({ data }) => {
    await requireAuth();
    const result = db
      .select()
      .from(qualityProfiles)
      .where(eq(qualityProfiles.id, data.id))
      .get();
    if (!result) {
      throw new Error("Quality profile not found");
    }
    return result;
  });

export const createQualityProfileFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => createQualityProfileSchema.parse(d))
  .handler(async ({ data }) => {
    await requireAuth();
    await validateRootFolderPath(data.rootFolderPath);
    return db
      .insert(qualityProfiles)
      .values({
        ...data,
      })
      .returning()
      .get();
  });

export const updateQualityProfileFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => updateQualityProfileSchema.parse(d))
  .handler(async ({ data }) => {
    await requireAuth();
    await validateRootFolderPath(data.rootFolderPath);
    const { id, ...values } = data;
    return db
      .update(qualityProfiles)
      .set({
        ...values,
      })
      .where(eq(qualityProfiles.id, id))
      .returning()
      .get();
  });

export const deleteQualityProfileFn = createServerFn({ method: "POST" })
  .inputValidator((d: { id: number }) => d)
  .handler(async ({ data }) => {
    await requireAuth();
    db.delete(qualityProfiles).where(eq(qualityProfiles.id, data.id)).run();
    return { success: true };
  });

// Quality Definitions
export const getQualityDefinitionsFn = createServerFn({
  method: "GET",
}).handler(async () => {
  await requireAuth();
  const rows = db.select().from(qualityDefinitions).all();
  // Ensure specifications is always a parsed array
  for (const row of rows) {
    if (typeof row.specifications === "string") {
      row.specifications = JSON.parse(row.specifications);
    }
  }
  return rows;
});

export const createQualityDefinitionFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => createQualityDefinitionSchema.parse(d))
  .handler(async ({ data }) => {
    await requireAuth();
    const result = db.insert(qualityDefinitions).values(data).returning().get();
    invalidateQualityDefCache();
    return result;
  });

export const updateQualityDefinitionFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => updateQualityDefinitionSchema.parse(d))
  .handler(async ({ data }) => {
    await requireAuth();
    const { id, ...values } = data;
    const result = db
      .update(qualityDefinitions)
      .set(values)
      .where(eq(qualityDefinitions.id, id))
      .returning()
      .get();

    invalidateQualityDefCache();
    return result;
  });

export const deleteQualityDefinitionFn = createServerFn({ method: "POST" })
  .inputValidator((d: { id: number }) => d)
  .handler(async ({ data }) => {
    await requireAuth();
    // Remove from all quality profiles' items arrays
    const profiles = db.select().from(qualityProfiles).all();
    for (const profile of profiles) {
      const filtered = profile.items.filter((id) => id !== data.id);
      if (filtered.length !== profile.items.length) {
        db.update(qualityProfiles)
          .set({ items: filtered })
          .where(eq(qualityProfiles.id, profile.id))
          .run();
      }
    }
    db.delete(qualityDefinitions)
      .where(eq(qualityDefinitions.id, data.id))
      .run();
    invalidateQualityDefCache();
    return { success: true };
  });
