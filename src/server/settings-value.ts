export function parseStoredSettingValue<T>(value: unknown, fallback: T): T {
	if (value === undefined || value === null) {
		return fallback;
	}

	if (typeof value !== "string") {
		return value as T;
	}

	try {
		return JSON.parse(value) as T;
	} catch {
		return value as T;
	}
}
