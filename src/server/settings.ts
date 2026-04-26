import { createServerFn } from "@tanstack/react-start";
import { db } from "src/db";
import { settings } from "src/db/schema";
import { buildSettingsMap } from "src/lib/settings-registry";
import { metadataProfileSchema, updateSettingSchema } from "src/lib/validators";
import { getMetadataProfile } from "./metadata-profile";
import { requireAdmin, requireAuth } from "./middleware";
import { upsertSettingValue } from "./settings-store";

export type { MetadataProfile } from "./metadata-profile";

export const getSettingsFn = createServerFn({ method: "GET" }).handler(
	async () => {
		await requireAdmin();
		const rows = db.select().from(settings).all();
		return buildSettingsMap(rows);
	},
);

export const updateSettingFn = createServerFn({ method: "POST" })
	.inputValidator((d: unknown) => updateSettingSchema.parse(d))
	.handler(async ({ data }) => {
		await requireAdmin();
		upsertSettingValue(data.key, data.value);
		return { success: true };
	});

export const regenerateApiKeyFn = createServerFn({ method: "POST" }).handler(
	async () => {
		await requireAdmin();
		const newKey = crypto.randomUUID();
		upsertSettingValue("general.apiKey", newKey);
		return { apiKey: newKey };
	},
);

// ─── Metadata Profile server functions ───────────────────────────────────────

export const getMetadataProfileFn = createServerFn({ method: "GET" }).handler(
	async () => {
		await requireAuth();
		return getMetadataProfile();
	},
);

export const updateMetadataProfileFn = createServerFn({ method: "POST" })
	.inputValidator((d: unknown) => metadataProfileSchema.parse(d))
	.handler(async ({ data }) => {
		await requireAdmin();
		upsertSettingValue("metadata.hardcover.profile", data);
		return { success: true };
	});
