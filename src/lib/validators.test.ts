import { describe, expect, it } from "vitest";
import {
	applyImportPlanSchema,
	createDownloadProfileSchema,
	createImportSourceSchema,
	refreshImportSourceSchema,
	resolveImportReviewItemSchema,
	updateDownloadProfileSchema,
	updateImportSourceSchema,
	updateSettingSchema,
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

	it("requires a positive id when updating a source", () => {
		expect(
			updateImportSourceSchema.parse({
				id: 12,
				kind: "radarr",
				label: "Radarr UHD",
				baseUrl: "http://localhost:7878",
				apiKey: "secret-2",
			}).id,
		).toBe(12);
	});

	it("validates import plan rows with object payloads", () => {
		const result = applyImportPlanSchema.parse({
			sourceId: 4,
			selectedRows: [
				{
					sourceKey: "radarr:movie:123",
					resourceType: "movie",
					action: "link",
					payload: { tmdbId: 123, title: "Alien" },
				},
			],
		});

		expect(result.selectedRows[0]?.payload).toEqual({
			tmdbId: 123,
			title: "Alien",
		});
	});

	it("allows review resolution payloads to be omitted", () => {
		const result = resolveImportReviewItemSchema.parse({
			id: 9,
			status: "resolved",
		});

		expect(result.payload).toBeUndefined();
	});
});

describe("updateSettingSchema", () => {
	it("accepts typed values for known setting keys", () => {
		expect(
			updateSettingSchema.parse({
				key: "downloadClient.enableCompletedDownloadHandling",
				value: false,
			}),
		).toEqual({
			key: "downloadClient.enableCompletedDownloadHandling",
			value: false,
		});

		expect(
			updateSettingSchema.parse({
				key: "mediaManagement.book.minimumFreeSpace",
				value: 250,
			}),
		).toEqual({
			key: "mediaManagement.book.minimumFreeSpace",
			value: 250,
		});
	});

	it("rejects unknown setting keys", () => {
		expect(() =>
			updateSettingSchema.parse({
				key: "general.theme",
				value: "dark",
			}),
		).toThrow();
	});

	it("rejects values that do not match the key schema", () => {
		expect(() =>
			updateSettingSchema.parse({
				key: "downloadClient.enableCompletedDownloadHandling",
				value: "false",
			}),
		).toThrow();

		expect(() =>
			updateSettingSchema.parse({
				key: "mediaManagement.book.minimumFreeSpace",
				value: "250",
			}),
		).toThrow();
	});
});
