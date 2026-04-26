import { describe, expect, it } from "vitest";
import { readarrIndexerResourceSchema } from "./resource-schema";

describe("readarrIndexerResourceSchema", () => {
	it("accepts a valid Newznab payload with a baseUrl field", () => {
		const result = readarrIndexerResourceSchema.safeParse({
			configContract: "NewznabSettings",
			enableAutomaticSearch: true,
			enableInteractiveSearch: true,
			enableRss: true,
			fields: [{ name: "baseUrl", value: "https://example.com" }],
			implementation: "Newznab",
			name: "Valid Indexer",
			priority: 25,
			protocol: "usenet",
		});

		expect(result.success).toBe(true);
	});

	it("rejects a Torznab payload with a non-torrent protocol", () => {
		const result = readarrIndexerResourceSchema.safeParse({
			configContract: "TorznabSettings",
			enableAutomaticSearch: true,
			enableInteractiveSearch: true,
			enableRss: true,
			fields: [{ name: "baseUrl", value: "https://example.com" }],
			implementation: "Torznab",
			name: "Invalid Indexer",
			priority: 25,
			protocol: "usenet",
		});

		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error.issues).toEqual(
				expect.arrayContaining([
					expect.objectContaining({
						message: "Torznab indexers must use torrent protocol",
					}),
				]),
			);
		}
	});
});
