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

export const getQualityProfilesFn = createServerFn({ method: "GET" }).handler(
  async () => {
    await requireAuth();
    const rows = db.select().from(qualityProfiles).all();
    // Fix double-stringified items from legacy seed data
    for (const row of rows) {
      if (typeof row.items === "string") {
        row.items = JSON.parse(row.items);
      }
    }
    return rows;
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
    // Fix double-stringified items from legacy seed data
    if (typeof result.items === "string") {
      result.items = JSON.parse(result.items);
    }
    return result;
  });

export const createQualityProfileFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => createQualityProfileSchema.parse(d))
  .handler(async ({ data }) => {
    await requireAuth();
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
      const items =
        typeof profile.items === "string"
          ? JSON.parse(profile.items)
          : profile.items;
      if (Array.isArray(items)) {
        const filtered = items.filter(
          (i: { quality: { id: number } }) => i.quality.id !== data.id,
        );
        if (filtered.length !== items.length) {
          db.update(qualityProfiles)
            .set({ items: filtered })
            .where(eq(qualityProfiles.id, profile.id))
            .run();
        }
      }
    }
    db.delete(qualityDefinitions)
      .where(eq(qualityDefinitions.id, data.id))
      .run();
    invalidateQualityDefCache();
    return { success: true };
  });
