import { eq } from "drizzle-orm";
import { db } from "src/db";
import { settings } from "src/db/schema";

/**
 * Validates the X-Api-Key header against the stored general.apiKey setting.
 * Throws a 401 Response if missing or invalid.
 */
export default async function requireApiKey(request: Request): Promise<void> {
	const providedKey = request.headers.get("X-Api-Key");

	if (!providedKey) {
		throw Response.json({ message: "API key required" }, { status: 401 });
	}

	const row = await db
		.select()
		.from(settings)
		.where(eq(settings.key, "general.apiKey"))
		.get();

	// Settings values are stored with an extra JSON.stringify wrap (see updateSettingFn / seed),
	// so Drizzle's json-mode column returns the value one parse short of the bare string.
	// We do one additional parse to unwrap it (e.g. `"\"uuid\""` → `"uuid"`).
	const rawValue = row?.value;
	const storedKey =
		typeof rawValue === "string"
			? (() => {
					try {
						return JSON.parse(rawValue) as string;
					} catch {
						return rawValue;
					}
				})()
			: undefined;

	if (!storedKey || providedKey !== storedKey) {
		throw Response.json({ message: "Invalid API key" }, { status: 401 });
	}
}
