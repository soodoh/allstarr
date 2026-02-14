import { createServerFn } from "@tanstack/react-start";
import { db } from "~/db";
import { qualityProfiles, qualityDefinitions } from "~/db/schema";
import { eq } from "drizzle-orm";
import { requireAuth } from "./middleware";
import {
  createQualityProfileSchema,
  updateQualityProfileSchema,
  updateQualityDefinitionSchema,
} from "~/lib/validators";

export const getQualityProfilesFn = createServerFn({ method: "GET" }).handler(
  async () => {
    await requireAuth();
    return db.select().from(qualityProfiles).all();
  }
);

export const getQualityProfileFn = createServerFn({ method: "GET" })
  .validator((d: { id: number }) => d)
  .handler(async ({ data }) => {
    await requireAuth();
    const result = db
      .select()
      .from(qualityProfiles)
      .where(eq(qualityProfiles.id, data.id))
      .get();
    if (!result) throw new Error("Quality profile not found");
    return result;
  });

export const createQualityProfileFn = createServerFn({ method: "POST" })
  .validator((d: unknown) => createQualityProfileSchema.parse(d))
  .handler(async ({ data }) => {
    await requireAuth();
    return db
      .insert(qualityProfiles)
      .values({
        ...data,
        items: JSON.stringify(data.items) as unknown as typeof qualityProfiles.$inferInsert.items,
      })
      .returning()
      .get();
  });

export const updateQualityProfileFn = createServerFn({ method: "POST" })
  .validator((d: unknown) => updateQualityProfileSchema.parse(d))
  .handler(async ({ data }) => {
    await requireAuth();
    const { id, ...values } = data;
    return db
      .update(qualityProfiles)
      .set({
        ...values,
        items: JSON.stringify(values.items) as unknown as typeof qualityProfiles.$inferInsert.items,
      })
      .where(eq(qualityProfiles.id, id))
      .returning()
      .get();
  });

export const deleteQualityProfileFn = createServerFn({ method: "POST" })
  .validator((d: { id: number }) => d)
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
  return db.select().from(qualityDefinitions).all();
});

export const updateQualityDefinitionFn = createServerFn({ method: "POST" })
  .validator((d: unknown) => updateQualityDefinitionSchema.parse(d))
  .handler(async ({ data }) => {
    await requireAuth();
    const { id, ...values } = data;
    return db
      .update(qualityDefinitions)
      .set(values)
      .where(eq(qualityDefinitions.id, id))
      .returning()
      .get();
  });
