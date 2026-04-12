import { describe, expect, it } from "vitest";
import getSchemaTemplates from "./schema-templates";

function assertExists<T>(
	value: T | null | undefined,
): asserts value is NonNullable<T> {
	expect(value).toBeDefined();
}

describe("getSchemaTemplates", () => {
	it("returns exactly two templates", () => {
		const templates = getSchemaTemplates();
		expect(templates).toHaveLength(2);
	});

	it("returns a Newznab template with usenet protocol", () => {
		const templates = getSchemaTemplates();
		const newznab = templates.find((t) => t.implementation === "Newznab");

		assertExists(newznab);
		expect(newznab.protocol).toBe("usenet");
		expect(newznab.configContract).toBe("NewznabSettings");
		expect(newznab.implementationName).toBe("Newznab");
	});

	it("returns a Torznab template with torrent protocol", () => {
		const templates = getSchemaTemplates();
		const torznab = templates.find((t) => t.implementation === "Torznab");

		assertExists(torznab);
		expect(torznab.protocol).toBe("torrent");
		expect(torznab.configContract).toBe("TorznabSettings");
		expect(torznab.implementationName).toBe("Torznab");
	});

	it("includes expected fields on each template", () => {
		const templates = getSchemaTemplates();

		for (const template of templates) {
			const fieldNames = template.fields.map((f) => f.name);
			expect(fieldNames).toContain("baseUrl");
			expect(fieldNames).toContain("apiPath");
			expect(fieldNames).toContain("apiKey");
			expect(fieldNames).toContain("categories");
		}
	});

	it("sets default values for shared properties", () => {
		const templates = getSchemaTemplates();

		for (const template of templates) {
			expect(template.id).toBe(0);
			expect(template.name).toBe("");
			expect(template.enableRss).toBe(true);
			expect(template.enableAutomaticSearch).toBe(true);
			expect(template.enableInteractiveSearch).toBe(true);
			expect(template.supportsRss).toBe(true);
			expect(template.supportsSearch).toBe(true);
			expect(template.priority).toBe(25);
			expect(template.tags).toEqual([]);
		}
	});
});
