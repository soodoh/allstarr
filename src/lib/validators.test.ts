import { describe, expect, it } from "vitest";
import {
	createDownloadProfileSchema,
	createImportSourceSchema,
	refreshImportSourceSchema,
	updateDownloadProfileSchema,
} from "./validators";

function validProfile(overrides: Record<string, unknown> = {}) {
	return {
		name: "Default",
		rootFolderPath: "/media",
		cutoff: 0,
		items: [[1]],
		upgradeAllowed: false,
		icon: "book",
		categories: [],
		contentType: "ebook" as const,
		language: "en",
		minCustomFormatScore: 0,
		upgradeUntilCustomFormatScore: 0,
		...overrides,
	};
}

describe("createDownloadProfileSchema refinement", () => {
	it("passes when upgradeAllowed is false and cutoff is 0", () => {
		const result = createDownloadProfileSchema.safeParse(
			validProfile({ upgradeAllowed: false, cutoff: 0 }),
		);
		expect(result.success).toBe(true);
	});

	it("passes when upgradeAllowed is true and cutoff > 0", () => {
		const result = createDownloadProfileSchema.safeParse(
			validProfile({ upgradeAllowed: true, cutoff: 5 }),
		);
		expect(result.success).toBe(true);
	});

	it("fails when upgradeAllowed is true and cutoff is 0", () => {
		const result = createDownloadProfileSchema.safeParse(
			validProfile({ upgradeAllowed: true, cutoff: 0 }),
		);
		expect(result.success).toBe(false);
		if (!result.success) {
			const cutoffError = result.error.issues.find((i) =>
				i.path.includes("cutoff"),
			);
			expect(cutoffError).toBeDefined();
			expect(cutoffError?.message).toBe("Upgrade cutoff quality is required");
		}
	});
});

describe("updateDownloadProfileSchema refinement", () => {
	it("passes when upgradeAllowed is false and cutoff is 0", () => {
		const result = updateDownloadProfileSchema.safeParse(
			validProfile({ id: 1, upgradeAllowed: false, cutoff: 0 }),
		);
		expect(result.success).toBe(true);
	});

	it("passes when upgradeAllowed is true and cutoff > 0", () => {
		const result = updateDownloadProfileSchema.safeParse(
			validProfile({ id: 1, upgradeAllowed: true, cutoff: 3 }),
		);
		expect(result.success).toBe(true);
	});

	it("fails when upgradeAllowed is true and cutoff is 0", () => {
		const result = updateDownloadProfileSchema.safeParse(
			validProfile({ id: 1, upgradeAllowed: true, cutoff: 0 }),
		);
		expect(result.success).toBe(false);
		if (!result.success) {
			const cutoffError = result.error.issues.find((i) =>
				i.path.includes("cutoff"),
			);
			expect(cutoffError).toBeDefined();
			expect(cutoffError?.message).toBe("Upgrade cutoff quality is required");
		}
	});
});

describe("import source validators", () => {
	it("accepts the supported source kinds", () => {
		expect(
			createImportSourceSchema.parse({
				kind: "sonarr",
				label: "Radarr 4K",
				baseUrl: "http://localhost:7878",
				apiKey: "secret",
			}).kind,
		).toBe("sonarr");
	});

	it("rejects unsupported source kinds", () => {
		expect(() =>
			createImportSourceSchema.parse({
				kind: "prowlarr",
				label: "Prowlarr",
				baseUrl: "http://localhost:9696",
				apiKey: "secret",
			}),
		).toThrow(/Invalid (enum value|option)/);
	});

	it("validates refresh payloads by source id", () => {
		expect(refreshImportSourceSchema.parse({ id: 12 }).id).toBe(12);
	});
});
