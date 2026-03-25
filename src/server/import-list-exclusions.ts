import { createServerFn } from "@tanstack/react-start";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "src/db";
import {
  bookImportListExclusions,
  movieImportListExclusions,
} from "src/db/schema";
import {
  removeImportListExclusionSchema,
  removeMovieImportExclusionSchema,
} from "src/lib/validators";
import { requireAuth } from "./middleware";

// ─── Book Exclusions ─────────────────────────────────────────────────────

export const getBookImportExclusionsFn = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) =>
    z
      .object({ page: z.number().default(1), limit: z.number().default(50) })
      .parse(d),
  )
  .handler(async ({ data }) => {
    await requireAuth();
    const offset = (data.page - 1) * data.limit;
    const items = db
      .select()
      .from(bookImportListExclusions)
      .orderBy(bookImportListExclusions.createdAt)
      .limit(data.limit)
      .offset(offset)
      .all();
    const total = db
      .select({ count: sql<number>`count(*)` })
      .from(bookImportListExclusions)
      .get();
    return { items, total: total?.count ?? 0 };
  });

export const removeBookImportExclusionFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => removeImportListExclusionSchema.parse(d))
  .handler(async ({ data }) => {
    await requireAuth();
    db.delete(bookImportListExclusions)
      .where(eq(bookImportListExclusions.id, data.id))
      .run();
    return { success: true };
  });

// ─── Movie Exclusions ────────────────────────────────────────────────────

export const getMovieImportExclusionsFn = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) =>
    z
      .object({ page: z.number().default(1), limit: z.number().default(50) })
      .parse(d),
  )
  .handler(async ({ data }) => {
    await requireAuth();
    const offset = (data.page - 1) * data.limit;
    const items = db
      .select()
      .from(movieImportListExclusions)
      .orderBy(movieImportListExclusions.createdAt)
      .limit(data.limit)
      .offset(offset)
      .all();
    const total = db
      .select({ count: sql<number>`count(*)` })
      .from(movieImportListExclusions)
      .get();
    return { items, total: total?.count ?? 0 };
  });

export const removeMovieImportExclusionFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => removeMovieImportExclusionSchema.parse(d))
  .handler(async ({ data }) => {
    await requireAuth();
    db.delete(movieImportListExclusions)
      .where(eq(movieImportListExclusions.id, data.id))
      .run();
    return { success: true };
  });

// ─── Backward Compatibility ─────────────────────────────────────────────
// Keep old names as aliases for any callers not yet updated
export const getImportListExclusionsFn = getBookImportExclusionsFn;
export const removeImportListExclusionFn = removeBookImportExclusionFn;
