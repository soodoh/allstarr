import { createServerFn } from "@tanstack/react-start";
import { db } from "src/db";
import { customFormats, profileCustomFormats } from "src/db/schema";
import { eq, inArray } from "drizzle-orm";
import { requireAuth } from "./middleware";
import {
  createCustomFormatSchema,
  updateCustomFormatSchema,
} from "src/lib/validators";
import { invalidateCFCache } from "./indexers/cf-scoring";

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

export const getCustomFormatsFn = createServerFn({ method: "GET" }).handler(
  async () => {
    await requireAuth();
    return db.select().from(customFormats).all();
  },
);

export const getCustomFormatFn = createServerFn({ method: "GET" })
  .inputValidator((d: { id: number }) => d)
  .handler(async ({ data }) => {
    await requireAuth();
    const result = db
      .select()
      .from(customFormats)
      .where(eq(customFormats.id, data.id))
      .get();
    if (!result) {
      throw new Error("Custom format not found");
    }
    return result;
  });

export const createCustomFormatFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => createCustomFormatSchema.parse(d))
  .handler(async ({ data }) => {
    await requireAuth();
    return db
      .insert(customFormats)
      .values({
        ...data,
        origin: null,
        userModified: false,
      })
      .returning()
      .get();
  });

export const updateCustomFormatFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => updateCustomFormatSchema.parse(d))
  .handler(async ({ data }) => {
    await requireAuth();
    const { id, ...values } = data;

    // Check if this is a builtin CF — if so, mark as user-modified
    const existing = db
      .select({ origin: customFormats.origin })
      .from(customFormats)
      .where(eq(customFormats.id, id))
      .get();

    const extraFields =
      existing?.origin === "builtin" ? { userModified: true } : {};

    const result = db
      .update(customFormats)
      .set({
        ...values,
        ...extraFields,
      })
      .where(eq(customFormats.id, id))
      .returning()
      .get();
    invalidateCFCache();
    return result;
  });

export const deleteCustomFormatFn = createServerFn({ method: "POST" })
  .inputValidator((d: { id: number }) => d)
  .handler(async ({ data }) => {
    await requireAuth();
    // Cascade on profileCustomFormats handles join table cleanup
    db.delete(customFormats).where(eq(customFormats.id, data.id)).run();
    invalidateCFCache();
    return { success: true };
  });

export const duplicateCustomFormatFn = createServerFn({ method: "POST" })
  .inputValidator((d: { id: number }) => d)
  .handler(async ({ data }) => {
    await requireAuth();
    const source = db
      .select()
      .from(customFormats)
      .where(eq(customFormats.id, data.id))
      .get();
    if (!source) {
      throw new Error("Custom format not found");
    }
    const { id: _id, ...rest } = source;
    return db
      .insert(customFormats)
      .values({
        ...rest,
        name: `${source.name} (Copy)`,
        origin: null,
        userModified: false,
      })
      .returning()
      .get();
  });

// ---------------------------------------------------------------------------
// Per-profile CF score management
// ---------------------------------------------------------------------------

export const getProfileCustomFormatsFn = createServerFn({ method: "GET" })
  .inputValidator((d: { profileId: number }) => d)
  .handler(async ({ data }) => {
    await requireAuth();
    return db
      .select({
        id: profileCustomFormats.id,
        profileId: profileCustomFormats.profileId,
        customFormatId: profileCustomFormats.customFormatId,
        score: profileCustomFormats.score,
        name: customFormats.name,
        category: customFormats.category,
        defaultScore: customFormats.defaultScore,
        contentTypes: customFormats.contentTypes,
      })
      .from(profileCustomFormats)
      .innerJoin(
        customFormats,
        eq(profileCustomFormats.customFormatId, customFormats.id),
      )
      .where(eq(profileCustomFormats.profileId, data.profileId))
      .all();
  });

export const setProfileCFScoreFn = createServerFn({ method: "POST" })
  .inputValidator(
    (d: { profileId: number; customFormatId: number; score: number }) => d,
  )
  .handler(async ({ data }) => {
    await requireAuth();
    // Upsert: insert or replace on conflict
    const result = db
      .insert(profileCustomFormats)
      .values({
        profileId: data.profileId,
        customFormatId: data.customFormatId,
        score: data.score,
      })
      .onConflictDoUpdate({
        target: [
          profileCustomFormats.profileId,
          profileCustomFormats.customFormatId,
        ],
        set: { score: data.score },
      })
      .returning()
      .get();
    invalidateCFCache();
    return result;
  });

export const bulkSetProfileCFScoresFn = createServerFn({ method: "POST" })
  .inputValidator(
    (d: {
      profileId: number;
      scores: Array<{ customFormatId: number; score: number }>;
    }) => d,
  )
  .handler(async ({ data }) => {
    await requireAuth();
    // Replace all existing scores for this profile
    db.delete(profileCustomFormats)
      .where(eq(profileCustomFormats.profileId, data.profileId))
      .run();

    if (data.scores.length === 0) {
      invalidateCFCache();
      return [];
    }

    const result = db
      .insert(profileCustomFormats)
      .values(
        data.scores.map((s) => ({
          profileId: data.profileId,
          customFormatId: s.customFormatId,
          score: s.score,
        })),
      )
      .returning()
      .all();
    invalidateCFCache();
    return result;
  });

export const removeProfileCFsFn = createServerFn({ method: "POST" })
  .inputValidator((d: { profileId: number; customFormatIds: number[] }) => d)
  .handler(async ({ data }) => {
    await requireAuth();
    if (data.customFormatIds.length === 0) {
      return { success: true };
    }
    db.delete(profileCustomFormats)
      .where(
        and(
          eq(profileCustomFormats.profileId, data.profileId),
          inArray(profileCustomFormats.customFormatId, data.customFormatIds),
        ),
      )
      .run();
    invalidateCFCache();
    return { success: true };
  });

export const addCategoryToProfileFn = createServerFn({ method: "POST" })
  .inputValidator((d: { profileId: number; category: string }) => d)
  .handler(async ({ data }) => {
    await requireAuth();

    // Get all CFs in the given category
    const cfsInCategory = db
      .select({
        id: customFormats.id,
        defaultScore: customFormats.defaultScore,
      })
      .from(customFormats)
      .where(eq(customFormats.category, data.category))
      .all();

    if (cfsInCategory.length === 0) {
      return [];
    }

    // Find which ones are already assigned to this profile
    const alreadyAssigned = db
      .select({ customFormatId: profileCustomFormats.customFormatId })
      .from(profileCustomFormats)
      .where(
        and(
          eq(profileCustomFormats.profileId, data.profileId),
          inArray(
            profileCustomFormats.customFormatId,
            cfsInCategory.map((cf) => cf.id),
          ),
        ),
      )
      .all();

    const assignedIds = new Set(alreadyAssigned.map((r) => r.customFormatId));
    const toInsert = cfsInCategory.filter((cf) => !assignedIds.has(cf.id));

    if (toInsert.length === 0) {
      return [];
    }

    const result = db
      .insert(profileCustomFormats)
      .values(
        toInsert.map((cf) => ({
          profileId: data.profileId,
          customFormatId: cf.id,
          score: cf.defaultScore,
        })),
      )
      .returning()
      .all();
    invalidateCFCache();
    return result;
  });
