import { createServerFn } from "@tanstack/react-start";
import { eq } from "drizzle-orm";
import { db } from "src/db";
import {
	customFormats,
	downloadProfiles,
	profileCustomFormats,
} from "src/db/schema";
import { PRESETS } from "src/lib/custom-format-preset-data";
import { invalidateCFCache } from "./indexers/cf-scoring";
import { requireAuth } from "./middleware";

export type { PresetCF } from "src/lib/custom-format-preset-data";

// ---------------------------------------------------------------------------
// Server functions
// ---------------------------------------------------------------------------

export const getPresetsFn = createServerFn({ method: "GET" })
	.inputValidator((d: { contentType?: string }) => d)
	.handler(async ({ data }) => {
		await requireAuth();
		let filtered = PRESETS;

		if (data.contentType) {
			filtered = filtered.filter((p) => p.contentType === data.contentType);
		}

		return filtered.map((p) => ({
			name: p.name,
			description: p.description,
			category: p.category,
			contentType: p.contentType,
			cfCount: p.customFormats.length,
			scores: p.scores,
			minCustomFormatScore: p.minCustomFormatScore,
			upgradeUntilCustomFormatScore: p.upgradeUntilCustomFormatScore,
		}));
	});

export const applyPresetFn = createServerFn({ method: "POST" })
	.inputValidator((d: { profileId: number; presetName: string }) => d)
	.handler(async ({ data }) => {
		await requireAuth();

		// 1. Find preset
		const preset = PRESETS.find((p) => p.name === data.presetName);
		if (!preset) {
			throw new Error(`Preset "${data.presetName}" not found`);
		}

		// 2. Verify profile exists
		const profile = db
			.select()
			.from(downloadProfiles)
			.where(eq(downloadProfiles.id, data.profileId))
			.get();
		if (!profile) {
			throw new Error("Download profile not found");
		}

		// 3. For each CF in preset: check if it exists by name, create if not
		const cfIdsByName: Record<string, number> = {};

		for (const presetCF of preset.customFormats) {
			const existing = db
				.select({ id: customFormats.id })
				.from(customFormats)
				.where(eq(customFormats.name, presetCF.name))
				.get();

			if (existing) {
				cfIdsByName[presetCF.name] = existing.id;
			} else {
				const created = db
					.insert(customFormats)
					.values({
						name: presetCF.name,
						category: presetCF.category,
						specifications: presetCF.specifications,
						defaultScore: presetCF.defaultScore,
						contentTypes: presetCF.contentTypes,
						description: presetCF.description,
						origin: "builtin",
						userModified: false,
					})
					.returning()
					.get();
				cfIdsByName[presetCF.name] = created.id;
			}
		}

		// 4. Delete existing profile_custom_formats for this profile
		db.delete(profileCustomFormats)
			.where(eq(profileCustomFormats.profileId, data.profileId))
			.run();

		// 5. Insert new scores
		const scoreEntries = Object.entries(preset.scores);
		if (scoreEntries.length > 0) {
			db.insert(profileCustomFormats)
				.values(
					scoreEntries
						.filter(([name]) => cfIdsByName[name] !== undefined)
						.map(([name, score]) => ({
							profileId: data.profileId,
							customFormatId: cfIdsByName[name],
							score,
						})),
				)
				.run();
		}

		// 6. Update profile's CF score thresholds
		db.update(downloadProfiles)
			.set({
				minCustomFormatScore: preset.minCustomFormatScore,
				upgradeUntilCustomFormatScore: preset.upgradeUntilCustomFormatScore,
			})
			.where(eq(downloadProfiles.id, data.profileId))
			.run();

		invalidateCFCache();

		return {
			success: true,
			cfCount: Object.keys(cfIdsByName).length,
			presetName: preset.name,
		};
	});
