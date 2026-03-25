import { createServerFn } from "@tanstack/react-start";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "src/db";
import { bookImportListExclusions } from "src/db/schema";
import { removeImportListExclusionSchema } from "src/lib/validators";
import { requireAuth } from "./middleware";

export const getImportListExclusionsFn = createServerFn({ method: "GET" })
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

export const removeImportListExclusionFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => removeImportListExclusionSchema.parse(d))
  .handler(async ({ data }) => {
    await requireAuth();
    db.delete(bookImportListExclusions)
      .where(eq(bookImportListExclusions.id, data.id))
      .run();
    return { success: true };
  });
