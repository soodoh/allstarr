import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import { customFormats } from "./schema";
import { eq } from "drizzle-orm";
import { PRESETS } from "src/server/custom-format-presets";
import type { PresetCF } from "src/server/custom-format-presets";

export function seedBuiltinCustomFormats(db: BunSQLiteDatabase): void {
  // Deduplicate formats by name, merging contentTypes
  const byName = new Map<string, PresetCF>();
  for (const preset of PRESETS) {
    for (const cf of preset.customFormats) {
      const existing = byName.get(cf.name);
      if (existing) {
        const merged = new Set([...existing.contentTypes, ...cf.contentTypes]);
        existing.contentTypes = [...merged];
      } else {
        byName.set(cf.name, { ...cf, contentTypes: [...cf.contentTypes] });
      }
    }
  }

  // Check which builtin formats already exist
  const existingNames = new Set(
    db
      .select({ name: customFormats.name })
      .from(customFormats)
      .where(eq(customFormats.origin, "builtin"))
      .all()
      .map((r) => r.name),
  );

  // Insert missing ones
  for (const cf of byName.values()) {
    if (!existingNames.has(cf.name)) {
      db.insert(customFormats)
        .values({
          name: cf.name,
          category: cf.category,
          specifications: cf.specifications,
          defaultScore: cf.defaultScore,
          contentTypes: cf.contentTypes,
          description: cf.description,
          origin: "builtin",
          userModified: false,
        })
        .run();
    }
  }
}
