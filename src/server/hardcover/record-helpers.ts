// ---------------------------------------------------------------------------
// Base record-parsing helpers — consolidated from search.ts & import-queries.ts
// ---------------------------------------------------------------------------

export function toRecord(value: unknown): Record<string, unknown> | undefined {
	if (typeof value === "object" && value !== null && !Array.isArray(value)) {
		return value as Record<string, unknown>;
	}
	return undefined;
}

export function toRecordArray(value: unknown): Array<Record<string, unknown>> {
	if (!Array.isArray(value)) {
		return [];
	}
	return value.map((entry) => toRecord(entry)).filter(Boolean) as Array<
		Record<string, unknown>
	>;
}

function getNestedValue(
	record: Record<string, unknown>,
	path: string[],
): unknown {
	let current: unknown = record;
	for (const key of path) {
		const next = toRecord(current);
		if (!next || !(key in next)) {
			return undefined;
		}
		current = next[key];
	}
	return current;
}

export function firstString(
	record: Record<string, unknown>,
	paths: string[][],
): string | undefined {
	for (const path of paths) {
		const value = getNestedValue(record, path);
		if (typeof value === "string") {
			const trimmed = value.trim();
			if (trimmed.length > 0) {
				return trimmed;
			}
		}
	}
	return undefined;
}

export function firstNumber(
	record: Record<string, unknown>,
	paths: string[][],
): number | undefined {
	for (const path of paths) {
		const value = getNestedValue(record, path);
		if (typeof value === "number" && Number.isFinite(value)) {
			return value;
		}
		if (typeof value === "string") {
			const parsed = Number(value);
			if (Number.isFinite(parsed)) {
				return parsed;
			}
		}
	}
	return undefined;
}

export function firstId(
	record: Record<string, unknown>,
	paths: string[][],
): string | undefined {
	const asString = firstString(record, paths);
	if (asString) {
		return asString;
	}
	const asNumber = firstNumber(record, paths);
	if (asNumber === undefined) {
		return undefined;
	}
	return String(asNumber);
}

export function getCoverUrl(
	record: Record<string, unknown>,
): string | undefined {
	const imageRecord = toRecord(record.image);
	if (imageRecord) {
		const imageUrl = firstString(imageRecord, [["url"], ["large"], ["medium"]]);
		if (imageUrl) {
			return imageUrl;
		}
	}

	if (Array.isArray(record.images)) {
		for (const image of record.images) {
			const imageRecordFromList = toRecord(image);
			if (!imageRecordFromList) {
				continue;
			}
			const imageUrl = firstString(imageRecordFromList, [["url"]]);
			if (imageUrl) {
				return imageUrl;
			}
		}
	}

	return firstString(record, [["coverUrl"], ["cover", "url"]]);
}

export function getStringList(value: unknown): string[] {
	if (!Array.isArray(value)) {
		return [];
	}
	return value
		.map((entry) => (typeof entry === "string" ? entry.trim() : ""))
		.filter((entry) => entry.length > 0);
}

export function parseYear(value: string | undefined): number | undefined {
	if (!value) {
		return undefined;
	}
	const yearMatch = value.match(/\b(\d{4})\b/);
	if (!yearMatch) {
		return undefined;
	}
	const year = Number(yearMatch[1]);
	return Number.isFinite(year) ? year : undefined;
}

export function normalizeLanguageCode(
	value: string | undefined,
): string | undefined {
	if (!value) {
		return undefined;
	}
	const normalized = value.trim().toLowerCase();
	return normalized.length > 0 ? normalized : undefined;
}

// ---------------------------------------------------------------------------
// Domain extractors — replace ternary chains in parser functions
// ---------------------------------------------------------------------------

/**
 * Extract language code and name from a record with a `language` sub-object.
 * Reads `record.language.code2` (falling back to `code3`) and `record.language.language`.
 */
export function extractLanguage(record: Record<string, unknown>): {
	code: string | null;
	name: string | null;
} {
	const langRecord = toRecord(record.language);
	if (!langRecord) {
		return { code: null, name: null };
	}
	const code =
		normalizeLanguageCode(firstString(langRecord, [["code2"], ["code3"]])) ??
		null;
	const name = firstString(langRecord, [["language"]]) ?? null;
	return { code, name };
}

/** Extract publisher name from a record with a `publisher` sub-object. */
export function extractPublisher(
	record: Record<string, unknown>,
): string | null {
	const publisherRecord = toRecord(record.publisher);
	return publisherRecord
		? (firstString(publisherRecord, [["name"]]) ?? null)
		: null;
}

/** Extract reading format from a record with a `reading_format` sub-object. */
export function extractFormat(record: Record<string, unknown>): string | null {
	const formatRecord = toRecord(record.reading_format);
	return formatRecord
		? (firstString(formatRecord, [["format"]]) ?? null)
		: null;
}

/** Extract country name from a record with a `country` sub-object. */
export function extractCountry(record: Record<string, unknown>): string | null {
	const countryRecord = toRecord(record.country);
	return countryRecord
		? (firstString(countryRecord, [["name"]]) ?? null)
		: null;
}

/**
 * Extract author names from a contributions-style array field.
 * Works with both `contributions` and `cached_contributors` shapes —
 * both store author info under `[].author.name`.
 *
 * @param items - The array value (e.g. `record.contributions` or `record.cached_contributors`)
 */
export function extractContributorNames(items: unknown): string[] {
	return toRecordArray(items)
		.map((c) => {
			const authorRecord = toRecord(c.author);
			return authorRecord ? firstString(authorRecord, [["name"]]) : undefined;
		})
		.filter((n): n is string => n !== undefined);
}
