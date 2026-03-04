import { createServerFn } from "@tanstack/react-start";
import { db } from "src/db";
import { rootFolders } from "src/db/schema";
import { eq } from "drizzle-orm";
import { requireAuth } from "./middleware";
import { createRootFolderSchema } from "src/lib/validators";
import * as fs from "node:fs";

export const getRootFoldersFn = createServerFn({ method: "GET" }).handler(
  async () => {
    await requireAuth();
    const folders = db.select().from(rootFolders).all();
    // oxlint-disable-next-line oxc/no-map-spread -- Spreading DB result to override fields is necessary
    return folders.map((folder) => {
      let freeSpace = folder.freeSpace;
      let totalSpace = folder.totalSpace;
      try {
        const stats = fs.statfsSync(folder.path);
        freeSpace = Number(stats.bfree * stats.bsize);
        totalSpace = Number(stats.blocks * stats.bsize);
      } catch {
        // folder may not exist yet
      }
      return { ...folder, freeSpace, totalSpace };
    });
  },
);

export const createRootFolderFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => createRootFolderSchema.parse(d))
  .handler(async ({ data }) => {
    await requireAuth();
    let freeSpace = 0;
    let totalSpace = 0;
    try {
      const stats = fs.statfsSync(data.path);
      freeSpace = Number(stats.bfree * stats.bsize);
      totalSpace = Number(stats.blocks * stats.bsize);
    } catch {
      // path may not exist yet
    }
    try {
      return db
        .insert(rootFolders)
        .values({ path: data.path, freeSpace, totalSpace })
        .returning()
        .get();
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.includes("UNIQUE constraint failed")
      ) {
        throw new Error("This folder has already been added as a root folder", {
          cause: error,
        });
      }
      throw error;
    }
  });

export const deleteRootFolderFn = createServerFn({ method: "POST" })
  .inputValidator((d: { id: number }) => d)
  .handler(async ({ data }) => {
    await requireAuth();
    db.delete(rootFolders).where(eq(rootFolders.id, data.id)).run();
    return { success: true };
  });
