import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	getSettingValue: vi.fn(),
	safeParse: vi.fn(),
}));

vi.mock("src/lib/validators", () => ({
	metadataProfileSchema: { safeParse: mocks.safeParse },
}));

vi.mock("./settings-store", () => ({
	getSettingValue: mocks.getSettingValue,
}));

import { getMetadataProfile } from "./metadata-profile";

const DEFAULT_PROFILE = {
	skipMissingReleaseDate: true,
	skipMissingIsbnAsin: true,
	skipCompilations: false,
	minimumPopularity: 10,
	minimumPages: 0,
};

beforeEach(() => {
	vi.clearAllMocks();
});

describe("getMetadataProfile", () => {
	it("passes the correct key and default to getSettingValue", () => {
		mocks.getSettingValue.mockReturnValue(DEFAULT_PROFILE);
		mocks.safeParse.mockReturnValue({ success: true, data: DEFAULT_PROFILE });

		getMetadataProfile();

		expect(mocks.getSettingValue).toHaveBeenCalledWith(
			"metadata.hardcover.profile",
			DEFAULT_PROFILE,
		);
	});

	it("returns parsed data when safeParse succeeds", () => {
		const customProfile = {
			skipMissingReleaseDate: false,
			skipMissingIsbnAsin: false,
			skipCompilations: true,
			minimumPopularity: 50,
			minimumPages: 100,
		};
		mocks.getSettingValue.mockReturnValue(customProfile);
		mocks.safeParse.mockReturnValue({ success: true, data: customProfile });

		const result = getMetadataProfile();

		expect(mocks.safeParse).toHaveBeenCalledWith(customProfile);
		expect(result).toEqual(customProfile);
	});

	it("returns the default profile when safeParse fails", () => {
		mocks.getSettingValue.mockReturnValue("invalid");
		mocks.safeParse.mockReturnValue({
			success: false,
			error: new Error("parse error"),
		});

		const result = getMetadataProfile();

		expect(result).toEqual(DEFAULT_PROFILE);
	});
});
