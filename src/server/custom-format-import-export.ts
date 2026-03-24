import { createServerFn } from "@tanstack/react-start";
import { db } from "src/db";
import { customFormats } from "src/db/schema";
import { eq, inArray } from "drizzle-orm";
import { requireAuth } from "./middleware";
import { invalidateCFCache } from "./indexers/cf-scoring";
import type { CustomFormatSpecification } from "src/db/schema/custom-formats";

// ---------------------------------------------------------------------------
// Export types
// ---------------------------------------------------------------------------

type ExportedCustomFormat = {
  name: string;
  category: string;
  specifications: CustomFormatSpecification[];
  defaultScore: number;
  contentTypes: string[];
  includeInRenaming: boolean;
  description: string | null;
};

// ---------------------------------------------------------------------------
// Server functions
// ---------------------------------------------------------------------------

export const exportCustomFormatsFn = createServerFn({ method: "POST" })
  .inputValidator((d: { customFormatIds: number[] }) => d)
  .handler(async ({ data }) => {
    await requireAuth();

    let rows;
    if (data.customFormatIds.length === 0) {
      // Export all
      rows = db.select().from(customFormats).all();
    } else {
      rows = db
        .select()
        .from(customFormats)
        .where(inArray(customFormats.id, data.customFormatIds))
        .all();
    }

    const exported: ExportedCustomFormat[] = rows.map((cf) => ({
      name: cf.name,
      category: cf.category,
      specifications: cf.specifications,
      defaultScore: cf.defaultScore,
      contentTypes: cf.contentTypes,
      includeInRenaming: cf.includeInRenaming,
      description: cf.description,
    }));

    return {
      version: 1,
      exportedAt: new Date().toISOString(),
      customFormats: exported,
    };
  });

export const importCustomFormatsFn = createServerFn({ method: "POST" })
  .inputValidator(
    (d: {
      customFormats: ExportedCustomFormat[];
      mode: "skip" | "overwrite" | "copy";
    }) => d,
  )
  .handler(async ({ data }) => {
    await requireAuth();

    let imported = 0;
    let skipped = 0;

    for (const cf of data.customFormats) {
      const existing = db
        .select()
        .from(customFormats)
        .where(eq(customFormats.name, cf.name))
        .get();

      if (existing) {
        switch (data.mode) {
          case "skip": {
            skipped += 1;
            break;
          }
          case "overwrite": {
            db.update(customFormats)
              .set({
                category: cf.category,
                specifications: cf.specifications,
                defaultScore: cf.defaultScore,
                contentTypes: cf.contentTypes,
                includeInRenaming: cf.includeInRenaming,
                description: cf.description,
                origin: "imported",
                userModified: false,
              })
              .where(eq(customFormats.id, existing.id))
              .run();
            imported += 1;
            break;
          }
          case "copy": {
            db.insert(customFormats)
              .values({
                name: `${cf.name} (Imported)`,
                category: cf.category,
                specifications: cf.specifications,
                defaultScore: cf.defaultScore,
                contentTypes: cf.contentTypes,
                includeInRenaming: cf.includeInRenaming,
                description: cf.description,
                origin: "imported",
                userModified: false,
              })
              .run();
            imported += 1;
            break;
          }
          default: {
            skipped += 1;
            break;
          }
        }
      } else {
        db.insert(customFormats)
          .values({
            name: cf.name,
            category: cf.category,
            specifications: cf.specifications,
            defaultScore: cf.defaultScore,
            contentTypes: cf.contentTypes,
            includeInRenaming: cf.includeInRenaming,
            description: cf.description,
            origin: "imported",
            userModified: false,
          })
          .run();
        imported += 1;
      }
    }

    invalidateCFCache();
    return { imported, skipped };
  });
