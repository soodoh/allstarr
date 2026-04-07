import { getSettingValue } from "./settings-store";

/**
 * Validates the X-Api-Key header against the stored general.apiKey setting.
 * Throws a 401 Response if missing or invalid.
 */
export default async function requireApiKey(request: Request): Promise<void> {
	const providedKey = request.headers.get("X-Api-Key");

	if (!providedKey) {
		throw Response.json({ message: "API key required" }, { status: 401 });
	}

	const storedKey = getSettingValue("general.apiKey", "");
	if (!storedKey) {
		throw Response.json({ message: "Invalid API key" }, { status: 401 });
	}

	const { timingSafeEqual } = await import("node:crypto");
	const provided = Buffer.from(providedKey);
	const stored = Buffer.from(storedKey);

	if (provided.length !== stored.length || !timingSafeEqual(provided, stored)) {
		throw Response.json({ message: "Invalid API key" }, { status: 401 });
	}
}
