import { beforeEach, describe, expect, it, vi } from "vitest";

const settingsMocks = vi.hoisted(() => ({
	all: vi.fn(),
	getMetadataProfile: vi.fn(),
	metadataProfileParse: vi.fn((data: unknown) => data),
	parseStoredSettingValue: vi.fn((value: unknown) => value),
	randomUUID: vi.fn(() => "generated-api-key"),
	requireAdmin: vi.fn(),
	requireAuth: vi.fn(),
	updateSettingParse: vi.fn((data: unknown) => data),
	upsertSettingValue: vi.fn(),
}));

vi.mock("@tanstack/react-start", () => ({
	createServerFn: () => ({
		handler: (handler: (...args: unknown[]) => unknown) => handler,
		inputValidator: (validator: (input: unknown) => unknown) => ({
			handler:
				(handler: (input: { data: unknown }) => unknown) =>
				(input: { data: unknown }) =>
					handler({ data: validator(input.data) }),
		}),
	}),
}));

vi.mock("src/db", () => ({
	db: {
		select: vi.fn(() => ({
			from: vi.fn(() => ({
				all: settingsMocks.all,
			})),
		})),
	},
}));

vi.mock("src/db/schema", () => ({
	settings: {},
}));

vi.mock("src/lib/validators", () => ({
	metadataProfileSchema: {
		parse: settingsMocks.metadataProfileParse,
	},
	updateSettingSchema: {
		parse: settingsMocks.updateSettingParse,
	},
}));

vi.mock("./metadata-profile", () => ({
	getMetadataProfile: settingsMocks.getMetadataProfile,
}));

vi.mock("./middleware", () => ({
	requireAdmin: settingsMocks.requireAdmin,
	requireAuth: settingsMocks.requireAuth,
}));

vi.mock("./settings-store", () => ({
	upsertSettingValue: settingsMocks.upsertSettingValue,
}));

vi.mock("./settings-value", () => ({
	parseStoredSettingValue: settingsMocks.parseStoredSettingValue,
}));

import {
	getMetadataProfileFn,
	getSettingsFn,
	regenerateApiKeyFn,
	updateMetadataProfileFn,
	updateSettingFn,
} from "./settings";

describe("settings server functions", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.stubGlobal("crypto", { randomUUID: settingsMocks.randomUUID });
	});

	it("returns parsed settings after admin auth", async () => {
		settingsMocks.all.mockReturnValue([
			{ key: "general.enabled", value: "true" },
			{ key: "general.pageSize", value: "50" },
		]);
		settingsMocks.parseStoredSettingValue
			.mockReturnValueOnce(true)
			.mockReturnValueOnce(50);

		await expect(getSettingsFn()).resolves.toEqual({
			"general.enabled": true,
			"general.pageSize": 50,
		});
		expect(settingsMocks.requireAdmin).toHaveBeenCalledTimes(1);
		expect(settingsMocks.parseStoredSettingValue).toHaveBeenNthCalledWith(
			1,
			"true",
			null,
		);
		expect(settingsMocks.parseStoredSettingValue).toHaveBeenNthCalledWith(
			2,
			"50",
			null,
		);
	});

	it("validates and upserts individual settings", async () => {
		const payload = { key: "general.theme", value: "light" };

		await expect(updateSettingFn({ data: payload })).resolves.toEqual({
			success: true,
		});

		expect(settingsMocks.updateSettingParse).toHaveBeenCalledWith(payload);
		expect(settingsMocks.requireAdmin).toHaveBeenCalledTimes(1);
		expect(settingsMocks.upsertSettingValue).toHaveBeenCalledWith(
			"general.theme",
			"light",
		);
	});

	it("regenerates and stores an api key", async () => {
		await expect(regenerateApiKeyFn()).resolves.toEqual({
			apiKey: "generated-api-key",
		});

		expect(settingsMocks.requireAdmin).toHaveBeenCalledTimes(1);
		expect(settingsMocks.randomUUID).toHaveBeenCalledTimes(1);
		expect(settingsMocks.upsertSettingValue).toHaveBeenCalledWith(
			"general.apiKey",
			"generated-api-key",
		);
	});

	it("returns the metadata profile for authenticated users", async () => {
		settingsMocks.getMetadataProfile.mockReturnValue({
			skipMissingIsbnAsin: true,
			skipMissingReleaseDate: false,
		});

		await expect(getMetadataProfileFn()).resolves.toEqual({
			skipMissingIsbnAsin: true,
			skipMissingReleaseDate: false,
		});

		expect(settingsMocks.requireAuth).toHaveBeenCalledTimes(1);
		expect(settingsMocks.getMetadataProfile).toHaveBeenCalledTimes(1);
	});

	it("validates and stores metadata profile updates", async () => {
		const payload = {
			skipMissingIsbnAsin: false,
			skipMissingReleaseDate: true,
		};

		await expect(updateMetadataProfileFn({ data: payload })).resolves.toEqual({
			success: true,
		});

		expect(settingsMocks.metadataProfileParse).toHaveBeenCalledWith(payload);
		expect(settingsMocks.requireAdmin).toHaveBeenCalledTimes(1);
		expect(settingsMocks.upsertSettingValue).toHaveBeenCalledWith(
			"metadata.hardcover.profile",
			payload,
		);
	});
});
