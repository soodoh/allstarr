import { describe, expect, it } from "vitest";
import { buildSettingsMap } from "./settings-registry";

describe("buildSettingsMap", () => {
	it("fills defaults and parses stored values for known setting keys", () => {
		const settings = buildSettingsMap([
			{
				key: "downloadClient.enableCompletedDownloadHandling",
				value: "false",
			},
			{ key: "mediaManagement.book.minimumFreeSpace", value: "250" },
		]);

		expect(settings).toMatchObject({
			"downloadClient.enableCompletedDownloadHandling": false,
			"downloadClient.redownloadFailed": true,
			"mediaManagement.book.minimumFreeSpace": 250,
		});
	});

	it("keeps default values when stored known settings have the wrong type", () => {
		const settings = buildSettingsMap([
			{
				key: "downloadClient.enableCompletedDownloadHandling",
				value: JSON.stringify("false"),
			},
			{
				key: "mediaManagement.book.minimumFreeSpace",
				value: JSON.stringify("250"),
			},
		]);

		expect(settings).toMatchObject({
			"downloadClient.enableCompletedDownloadHandling": true,
			"mediaManagement.book.minimumFreeSpace": 100,
		});
	});

	it("preserves unknown legacy primitive settings", () => {
		const settings = buildSettingsMap([
			{ key: "general.enabled", value: "true" },
			{ key: "general.pageSize", value: "50" },
		]);

		expect(settings).toMatchObject({
			"general.enabled": true,
			"general.pageSize": 50,
		});
	});
});
