import { describe, expect, it } from "vitest";
import { summarizeIndexerResource } from "./logging";
import type { ReadarrIndexerResource } from "./mapper";

describe("summarizeIndexerResource", () => {
	it("redacts apiKey fields", () => {
		const body: ReadarrIndexerResource = {
			name: "NZBgeek",
			implementation: "Newznab",
			configContract: "NewznabSettings",
			protocol: "usenet",
			enableRss: true,
			enableAutomaticSearch: true,
			enableInteractiveSearch: true,
			priority: 25,
			fields: [
				{ name: "baseUrl", value: "https://api.nzbgeek.info" },
				{ name: "apiKey", value: "super-secret-key-12345" },
				{ name: "categories", value: [7020] },
			],
		};

		const summary = summarizeIndexerResource(body);

		const apiKeyField = summary.fields?.find((f) => f.name === "apiKey");
		expect(apiKeyField?.value).toBe("[REDACTED]");
	});

	it("passes through non-apiKey field values unchanged", () => {
		const body: ReadarrIndexerResource = {
			name: "NZBgeek",
			implementation: "Newznab",
			configContract: "NewznabSettings",
			protocol: "usenet",
			enableRss: true,
			enableAutomaticSearch: true,
			enableInteractiveSearch: false,
			priority: 10,
			fields: [
				{ name: "baseUrl", value: "https://api.nzbgeek.info" },
				{ name: "apiPath", value: "/api" },
				{ name: "apiKey", value: "secret" },
			],
		};

		const summary = summarizeIndexerResource(body);

		expect(summary.name).toBe("NZBgeek");
		expect(summary.implementation).toBe("Newznab");
		expect(summary.protocol).toBe("usenet");
		expect(summary.enableRss).toBe(true);
		expect(summary.enableAutomaticSearch).toBe(true);
		expect(summary.enableInteractiveSearch).toBe(false);
		expect(summary.priority).toBe(10);

		const baseUrlField = summary.fields?.find((f) => f.name === "baseUrl");
		expect(baseUrlField?.value).toBe("https://api.nzbgeek.info");

		const apiPathField = summary.fields?.find((f) => f.name === "apiPath");
		expect(apiPathField?.value).toBe("/api");
	});

	it("handles body with no fields", () => {
		const body: ReadarrIndexerResource = {
			name: "Test",
			implementation: "Newznab",
			configContract: "NewznabSettings",
			protocol: "usenet",
			enableRss: true,
			enableAutomaticSearch: true,
			enableInteractiveSearch: true,
			priority: 25,
			fields: [],
		};

		const summary = summarizeIndexerResource(body);

		expect(summary.fields).toEqual([]);
	});
});
