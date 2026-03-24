import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import {
  customFormats,
  downloadProfiles,
  profileCustomFormats,
} from "./schema";
import { eq } from "drizzle-orm";
import { PRESETS } from "src/lib/custom-format-preset-data";
import type { PresetCF } from "src/lib/custom-format-preset-data";

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

  // Seed profile-custom-format links using defaultScore
  const profiles = db.select().from(downloadProfiles).all();

  for (const profile of profiles) {
    // Skip if profile already has CF links
    const existingLinks = db
      .select({ id: profileCustomFormats.id })
      .from(profileCustomFormats)
      .where(eq(profileCustomFormats.profileId, profile.id))
      .all();
    if (existingLinks.length > 0) {
      continue;
    }

    // Find matching preset by contentType
    const preset = PRESETS.find((p) => p.contentType === profile.contentType);
    if (!preset) {
      continue;
    }

    // Look up CF IDs and insert links with defaultScore
    const values: Array<{
      profileId: number;
      customFormatId: number;
      score: number;
    }> = [];
    for (const presetCF of preset.customFormats) {
      const cf = db
        .select({ id: customFormats.id })
        .from(customFormats)
        .where(eq(customFormats.name, presetCF.name))
        .get();
      if (cf) {
        values.push({
          profileId: profile.id,
          customFormatId: cf.id,
          score: presetCF.defaultScore,
        });
      }
    }

    if (values.length > 0) {
      db.insert(profileCustomFormats).values(values).run();
    }

    // Update profile CF score thresholds
    db.update(downloadProfiles)
      .set({
        minCustomFormatScore: preset.minCustomFormatScore,
        upgradeUntilCustomFormatScore: preset.upgradeUntilCustomFormatScore,
      })
      .where(eq(downloadProfiles.id, profile.id))
      .run();
  }
}
