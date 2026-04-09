import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	getSettingValue: vi.fn(),
}));

vi.mock("./settings-store", () => ({
	getSettingValue: mocks.getSettingValue,
}));

beforeEach(() => {
	vi.clearAllMocks();
});

describe("getMediaSetting", () => {
	it("delegates to getSettingValue with correct args", async () => {
		mocks.getSettingValue.mockReturnValue("1080p");

		const { default: getMediaSetting } = await import("./settings-reader");
		getMediaSetting("media.resolution", "720p");

		expect(mocks.getSettingValue).toHaveBeenCalledWith(
			"media.resolution",
			"720p",
		);
	});

	it("returns the value from getSettingValue", async () => {
		mocks.getSettingValue.mockReturnValue(42);

		const { default: getMediaSetting } = await import("./settings-reader");
		const result = getMediaSetting("media.bitrate", 128);

		expect(result).toBe(42);
	});
});
