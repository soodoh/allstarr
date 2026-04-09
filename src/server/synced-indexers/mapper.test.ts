import { describe, expect, it, vi } from "vitest";

vi.mock("src/lib/categories", () => ({
	CATEGORY_MAP: new Map([
		[7020, "Books/EBook"],
		[5030, "TV/SD"],
	]),
}));

import type { SyncedIndexer } from "src/db/schema";
import {
	fromReadarrResource,
	type ReadarrIndexerResource,
	toReadarrResource,
} from "./mapper";

describe("toReadarrResource", () => {
	const baseRow: SyncedIndexer = {
		id: 42,
		name: "NZBgeek",
		implementation: "Newznab",
		configContract: "NewznabSettings",
		baseUrl: "https://api.nzbgeek.info",
		apiPath: "/api",
		apiKey: "abc123",
		categories: JSON.stringify([7020, 5030]),
		enableRss: true,
		enableSearch: true,
		enableAutomaticSearch: true,
		enableInteractiveSearch: false,
		priority: 10,
		protocol: "usenet",
		tag: null,
		downloadClientId: null,
		requestInterval: 5000,
		dailyQueryLimit: 0,
		dailyGrabLimit: 0,
		backoffUntil: 0,
		escalationLevel: 0,
		createdAt: Date.now(),
		updatedAt: Date.now(),
	};

	it("maps DB row fields to ReadarrIndexerResource", () => {
		const result = toReadarrResource(baseRow);

		expect(result.id).toBe(42);
		expect(result.name).toBe("NZBgeek");
		expect(result.implementation).toBe("Newznab");
		expect(result.implementationName).toBe("Newznab");
		expect(result.configContract).toBe("NewznabSettings");
		expect(result.protocol).toBe("usenet");
		expect(result.enableRss).toBe(true);
		expect(result.enableAutomaticSearch).toBe(true);
		expect(result.enableInteractiveSearch).toBe(false);
		expect(result.priority).toBe(10);
		expect(result.supportsRss).toBe(true);
		expect(result.supportsSearch).toBe(true);
		expect(result.tags).toEqual([]);
	});

	it("parses JSON categories and maps to objects with names", () => {
		const result = toReadarrResource(baseRow);
		const categoriesField = result.fields.find((f) => f.name === "categories");

		expect(categoriesField?.value).toEqual([
			{ id: 7020, name: "Books/EBook" },
			{ id: 5030, name: "TV/SD" },
		]);
	});

	it("uses fallback name for unknown category IDs", () => {
		const row: SyncedIndexer = {
			...baseRow,
			categories: JSON.stringify([9999]),
		};
		const result = toReadarrResource(row);
		const categoriesField = result.fields.find((f) => f.name === "categories");

		expect(categoriesField?.value).toEqual([
			{ id: 9999, name: "Unknown (9999)" },
		]);
	});

	it("handles null categories gracefully", () => {
		const row: SyncedIndexer = { ...baseRow, categories: null };
		const result = toReadarrResource(row);
		const categoriesField = result.fields.find((f) => f.name === "categories");

		expect(categoriesField?.value).toEqual([]);
	});

	it("handles invalid JSON categories gracefully", () => {
		const row: SyncedIndexer = { ...baseRow, categories: "not-json" };
		const result = toReadarrResource(row);
		const categoriesField = result.fields.find((f) => f.name === "categories");

		expect(categoriesField?.value).toEqual([]);
	});

	it("maps baseUrl, apiPath, and apiKey into fields", () => {
		const result = toReadarrResource(baseRow);
		const fieldMap = Object.fromEntries(
			result.fields.map((f) => [f.name, f.value]),
		);

		expect(fieldMap.baseUrl).toBe("https://api.nzbgeek.info");
		expect(fieldMap.apiPath).toBe("/api");
		expect(fieldMap.apiKey).toBe("abc123");
	});
});

describe("fromReadarrResource", () => {
	const baseBody: ReadarrIndexerResource = {
		name: "NZBgeek (Prowlarr)",
		implementation: "Newznab",
		configContract: "NewznabSettings",
		protocol: "usenet",
		enableRss: true,
		enableAutomaticSearch: false,
		enableInteractiveSearch: true,
		priority: 15,
		fields: [
			{ name: "baseUrl", value: "https://api.nzbgeek.info" },
			{ name: "apiPath", value: "/api" },
			{ name: "apiKey", value: "abc123" },
			{ name: "categories", value: [7020, 5030] },
		],
	};

	it("strips (Prowlarr) suffix from name", () => {
		const result = fromReadarrResource(baseBody);
		expect(result.name).toBe("NZBgeek");
	});

	it("preserves name without (Prowlarr) suffix", () => {
		const body: ReadarrIndexerResource = {
			...baseBody,
			name: "NZBgeek",
		};
		const result = fromReadarrResource(body);
		expect(result.name).toBe("NZBgeek");
	});

	it("handles number[] category format", () => {
		const result = fromReadarrResource(baseBody);
		expect(result.categories).toBe(JSON.stringify([7020, 5030]));
	});

	it("handles {id, name}[] category format", () => {
		const body: ReadarrIndexerResource = {
			...baseBody,
			fields: [
				...baseBody.fields.filter((f) => f.name !== "categories"),
				{
					name: "categories",
					value: [
						{ id: 7020, name: "Books/EBook" },
						{ id: 5030, name: "TV/SD" },
					],
				},
			],
		};
		const result = fromReadarrResource(body);
		expect(result.categories).toBe(JSON.stringify([7020, 5030]));
	});

	it("extracts fields into top-level properties", () => {
		const result = fromReadarrResource(baseBody);

		expect(result.baseUrl).toBe("https://api.nzbgeek.info");
		expect(result.apiPath).toBe("/api");
		expect(result.apiKey).toBe("abc123");
	});

	it("maps boolean and numeric properties", () => {
		const result = fromReadarrResource(baseBody);

		expect(result.enableRss).toBe(true);
		expect(result.enableSearch).toBe(false);
		expect(result.enableAutomaticSearch).toBe(false);
		expect(result.enableInteractiveSearch).toBe(true);
		expect(result.priority).toBe(15);
	});

	it("infers torrent protocol from Torznab implementation", () => {
		const body: ReadarrIndexerResource = {
			...baseBody,
			implementation: "Torznab",
			configContract: "TorznabSettings",
			protocol: undefined as unknown as string,
		};
		const result = fromReadarrResource(body);
		expect(result.protocol).toBe("torrent");
	});

	it("infers usenet protocol from non-Torznab implementation", () => {
		const body: ReadarrIndexerResource = {
			...baseBody,
			implementation: "Newznab",
			protocol: undefined as unknown as string,
		};
		const result = fromReadarrResource(body);
		expect(result.protocol).toBe("usenet");
	});

	it("uses explicit protocol when provided", () => {
		const body: ReadarrIndexerResource = {
			...baseBody,
			implementation: "Torznab",
			protocol: "usenet",
		};
		const result = fromReadarrResource(body);
		expect(result.protocol).toBe("usenet");
	});

	it("handles empty categories array", () => {
		const body: ReadarrIndexerResource = {
			...baseBody,
			fields: [
				...baseBody.fields.filter((f) => f.name !== "categories"),
				{ name: "categories", value: [] },
			],
		};
		const result = fromReadarrResource(body);
		expect(result.categories).toBe("[]");
	});

	it("handles non-array categories value", () => {
		const body: ReadarrIndexerResource = {
			...baseBody,
			fields: [
				...baseBody.fields.filter((f) => f.name !== "categories"),
				{ name: "categories", value: "invalid" },
			],
		};
		const result = fromReadarrResource(body);
		expect(result.categories).toBe("[]");
	});
});
