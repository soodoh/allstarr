import type { NewSyncedIndexer, SyncedIndexer } from "src/db/schema";
import { CATEGORY_MAP } from "src/lib/categories";

/**
 * Normalise a categories value from Prowlarr into a plain number[].
 * Prowlarr may send either plain IDs [7020] or objects [{id:7020,name:"Books/EBook"}].
 */
function normaliseCategoryIds(raw: unknown): number[] {
	if (!Array.isArray(raw)) {
		return [];
	}
	return raw
		.map((item: unknown) => {
			if (typeof item === "number") {
				return item;
			}
			if (typeof item === "object" && item !== null && "id" in item) {
				return (item as { id: number }).id;
			}
			return null;
		})
		.filter((id): id is number => id !== null);
}

export type ReadarrField = {
	name: string;
	value: unknown;
};

export type ReadarrIndexerResource = {
	id?: number;
	name: string;
	implementation: string;
	implementationName?: string;
	configContract: string;
	infoLink?: string;
	fields: ReadarrField[];
	enableRss: boolean;
	enableAutomaticSearch: boolean;
	enableInteractiveSearch: boolean;
	supportsRss?: boolean;
	supportsSearch?: boolean;
	protocol: string;
	priority: number;
	tags?: number[];
};

/**
 * Converts a DB row to a Readarr-style indexer resource that Prowlarr expects.
 */
export function toReadarrResource(row: SyncedIndexer): ReadarrIndexerResource {
	const categoryIds = (() => {
		try {
			return JSON.parse(row.categories ?? "[]") as number[];
		} catch {
			return [];
		}
	})();

	// Send categories back as objects {id, name} to match Prowlarr's expected format
	const categoryObjects = categoryIds.map((id) => ({
		id,
		name: CATEGORY_MAP.get(id) ?? `Unknown (${id})`,
	}));

	return {
		id: row.id,
		name: row.name,
		implementation: row.implementation,
		implementationName: row.implementation,
		configContract: row.configContract,
		infoLink: "",
		fields: [
			{ name: "baseUrl", value: row.baseUrl },
			{ name: "apiPath", value: row.apiPath ?? "/api" },
			{ name: "apiKey", value: row.apiKey ?? "" },
			{ name: "categories", value: categoryObjects },
		],
		enableRss: row.enableRss,
		enableAutomaticSearch: row.enableAutomaticSearch,
		enableInteractiveSearch: row.enableInteractiveSearch,
		supportsRss: true,
		supportsSearch: true,
		protocol: row.protocol,
		priority: row.priority,
		tags: [],
	};
}

/**
 * Converts a Readarr-style indexer resource from Prowlarr into a DB insert/update shape.
 */
export function fromReadarrResource(
	body: ReadarrIndexerResource,
): Omit<NewSyncedIndexer, "id" | "createdAt" | "updatedAt"> {
	const getField = (name: string): unknown =>
		body.fields?.find((f) => f.name === name)?.value;

	const categories = JSON.stringify(
		normaliseCategoryIds(getField("categories")),
	);

	return {
		name: body.name.replace(/\s*\(Prowlarr\)$/i, ""),
		implementation: body.implementation,
		configContract: body.configContract,
		baseUrl: (getField("baseUrl") as string) ?? "",
		apiPath: (getField("apiPath") as string) ?? "/api",
		apiKey: (getField("apiKey") as string) ?? null,
		categories,
		enableRss: body.enableRss ?? true,
		enableSearch: body.enableAutomaticSearch ?? true,
		enableAutomaticSearch: body.enableAutomaticSearch ?? true,
		enableInteractiveSearch: body.enableInteractiveSearch ?? true,
		priority: body.priority ?? 25,
		// Prowlarr doesn't always send protocol at top level — infer from implementation
		protocol:
			body.protocol ??
			(body.implementation === "Torznab" ? "torrent" : "usenet"),
	};
}
