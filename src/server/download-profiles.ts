import { createServerFn } from "@tanstack/react-start";
import { db } from "src/db";
import { downloadProfiles, downloadFormats } from "src/db/schema";
import { eq } from "drizzle-orm";
import { requireAuth } from "./middleware";
import {
  createDownloadProfileSchema,
  updateDownloadProfileSchema,
  createDownloadFormatSchema,
  updateDownloadFormatSchema,
} from "src/lib/validators";
import { invalidateFormatDefCache } from "./indexers/format-parser";

async function validateRootFolderPath(rootFolderPath: string): Promise<void> {
  if (!rootFolderPath) {
    return;
  }
  const fs = await import("node:fs");
  if (!fs.existsSync(rootFolderPath)) {
    throw new Error(`Root folder does not exist: ${rootFolderPath}`);
  }
}

export const getDownloadProfilesFn = createServerFn({ method: "GET" }).handler(
  async () => {
    await requireAuth();
    return db.select().from(downloadProfiles).all();
  },
);

export const getDownloadProfileFn = createServerFn({ method: "GET" })
  .inputValidator((d: { id: number }) => d)
  .handler(async ({ data }) => {
    await requireAuth();
    const result = db
      .select()
      .from(downloadProfiles)
      .where(eq(downloadProfiles.id, data.id))
      .get();
    if (!result) {
      throw new Error("Download profile not found");
    }
    return result;
  });

export const createDownloadProfileFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => createDownloadProfileSchema.parse(d))
  .handler(async ({ data }) => {
    await requireAuth();
    await validateRootFolderPath(data.rootFolderPath);
    return db
      .insert(downloadProfiles)
      .values({
        ...data,
      })
      .returning()
      .get();
  });

export const updateDownloadProfileFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => updateDownloadProfileSchema.parse(d))
  .handler(async ({ data }) => {
    await requireAuth();
    await validateRootFolderPath(data.rootFolderPath);
    const { id, ...values } = data;
    return db
      .update(downloadProfiles)
      .set({
        ...values,
      })
      .where(eq(downloadProfiles.id, id))
      .returning()
      .get();
  });

export const deleteDownloadProfileFn = createServerFn({ method: "POST" })
  .inputValidator((d: { id: number }) => d)
  .handler(async ({ data }) => {
    await requireAuth();
    db.delete(downloadProfiles).where(eq(downloadProfiles.id, data.id)).run();
    return { success: true };
  });

// Download Formats
export const getDownloadFormatsFn = createServerFn({
  method: "GET",
}).handler(async () => {
  await requireAuth();
  const rows = db.select().from(downloadFormats).all();
  // Ensure specifications is always a parsed array
  for (const row of rows) {
    if (typeof row.specifications === "string") {
      row.specifications = JSON.parse(row.specifications);
    }
  }
  return rows;
});

export const createDownloadFormatFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => createDownloadFormatSchema.parse(d))
  .handler(async ({ data }) => {
    await requireAuth();
    const result = db.insert(downloadFormats).values(data).returning().get();
    invalidateFormatDefCache();
    return result;
  });

export const updateDownloadFormatFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => updateDownloadFormatSchema.parse(d))
  .handler(async ({ data }) => {
    await requireAuth();
    const { id, ...values } = data;
    const result = db
      .update(downloadFormats)
      .set(values)
      .where(eq(downloadFormats.id, id))
      .returning()
      .get();

    invalidateFormatDefCache();
    return result;
  });

export const deleteDownloadFormatFn = createServerFn({ method: "POST" })
  .inputValidator((d: { id: number }) => d)
  .handler(async ({ data }) => {
    await requireAuth();
    // Remove from all download profiles' items arrays
    const profiles = db.select().from(downloadProfiles).all();
    for (const profile of profiles) {
      const filtered = profile.items.filter((id) => id !== data.id);
      if (filtered.length !== profile.items.length) {
        db.update(downloadProfiles)
          .set({ items: filtered })
          .where(eq(downloadProfiles.id, profile.id))
          .run();
      }
    }
    db.delete(downloadFormats).where(eq(downloadFormats.id, data.id)).run();
    invalidateFormatDefCache();
    return { success: true };
  });
