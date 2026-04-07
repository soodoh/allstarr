import { eq } from "drizzle-orm";
import { db } from "src/db";
import { settings } from "src/db/schema";
import { parseStoredSettingValue } from "./settings-value";

export function getSettingValue<T>(key: string, fallback: T): T {
	const row = db.select().from(settings).where(eq(settings.key, key)).get();
	return parseStoredSettingValue(row?.value, fallback);
}

export function upsertSettingValue(key: string, value: unknown): void {
	db.insert(settings)
		.values({ key, value: JSON.stringify(value) })
		.onConflictDoUpdate({
			target: settings.key,
			set: { value: JSON.stringify(value) },
		})
		.run();
}
