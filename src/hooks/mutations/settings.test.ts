import { QueryClient } from "@tanstack/react-query";
import { act } from "@testing-library/react";
import { renderHook } from "src/test/render";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
	error,
	invalidateQueries,
	regenerateApiKeyFn,
	success,
	updateMetadataProfileFn,
	updateSettingFn,
} = vi.hoisted(() => ({
	error: vi.fn(),
	invalidateQueries: vi.fn(),
	regenerateApiKeyFn: vi.fn(),
	success: vi.fn(),
	updateMetadataProfileFn: vi.fn(),
	updateSettingFn: vi.fn(),
}));

vi.mock("sonner", () => ({
	toast: {
		error,
		success,
	},
}));

vi.mock("src/server/settings", () => ({
	regenerateApiKeyFn: (...args: unknown[]) => regenerateApiKeyFn(...args),
	updateMetadataProfileFn: (...args: unknown[]) =>
		updateMetadataProfileFn(...args),
	updateSettingFn: (...args: unknown[]) => updateSettingFn(...args),
}));

import { queryKeys } from "src/lib/query-keys";

import {
	useRegenerateApiKey,
	useUpdateMetadataProfile,
	useUpdateSettings,
} from "./settings";

type HookRunner = () => { mutateAsync: (variables: any) => Promise<any> };

async function runMutation(
	useHook: HookRunner,
	variables: unknown,
	swallowError = false,
) {
	const { result } = renderHook(() => useHook());

	await act(async () => {
		const promise = result.current.mutateAsync(variables as never);
		if (swallowError) {
			await promise.catch(() => {});
			return;
		}
		await promise;
	});
}

describe("mutations/settings", () => {
	beforeEach(() => {
		vi.spyOn(QueryClient.prototype, "invalidateQueries").mockImplementation(
			invalidateQueries,
		);
	});

	afterEach(() => {
		vi.restoreAllMocks();
		error.mockReset();
		invalidateQueries.mockReset();
		regenerateApiKeyFn.mockReset();
		success.mockReset();
		updateMetadataProfileFn.mockReset();
		updateSettingFn.mockReset();
	});

	it("batches setting updates and invalidates the settings cache", async () => {
		updateSettingFn
			.mockResolvedValueOnce({ success: true })
			.mockResolvedValueOnce({ success: true });

		await runMutation(useUpdateSettings, [
			{ key: "general.theme", value: "dark" },
			{ key: "general.language", value: "en" },
		]);

		expect(updateSettingFn).toHaveBeenNthCalledWith(1, {
			data: { key: "general.theme", value: "dark" },
		});
		expect(updateSettingFn).toHaveBeenNthCalledWith(2, {
			data: { key: "general.language", value: "en" },
		});
		expect(success).toHaveBeenCalledWith("Settings saved");
		expect(invalidateQueries).toHaveBeenCalledWith({
			queryKey: queryKeys.settings.all,
		});
	});

	it("shows the settings error toast when a batched update fails", async () => {
		updateSettingFn
			.mockResolvedValueOnce({ success: true })
			.mockRejectedValueOnce(new Error("boom"));

		await runMutation(
			useUpdateSettings,
			[
				{ key: "general.theme", value: "light" },
				{ key: "general.language", value: "fr" },
			],
			true,
		);

		expect(error).toHaveBeenCalledWith("Failed to save settings");
	});

	it("regenerates the API key and invalidates settings", async () => {
		regenerateApiKeyFn.mockResolvedValue({ apiKey: "abc" });

		await runMutation(useRegenerateApiKey, undefined);

		expect(regenerateApiKeyFn).toHaveBeenCalledWith();
		expect(success).toHaveBeenCalledWith("API key regenerated");
		expect(invalidateQueries).toHaveBeenCalledWith({
			queryKey: queryKeys.settings.all,
		});
	});

	it("shows the regenerate API key error toast", async () => {
		regenerateApiKeyFn.mockRejectedValue(new Error("boom"));

		await runMutation(useRegenerateApiKey, undefined, true);

		expect(error).toHaveBeenCalledWith("Failed to regenerate API key");
	});

	it("saves the metadata profile and invalidates the metadata cache", async () => {
		updateMetadataProfileFn.mockResolvedValue({ success: true });

		await runMutation(useUpdateMetadataProfile, {
			id: "hardcover",
			name: "Hardcover",
		} as never);

		expect(updateMetadataProfileFn).toHaveBeenCalledWith({
			data: { id: "hardcover", name: "Hardcover" },
		});
		expect(success).toHaveBeenCalledWith("Metadata profile saved");
		expect(invalidateQueries).toHaveBeenCalledWith({
			queryKey: queryKeys.metadataProfile.all,
		});
	});

	it("shows the metadata profile error toast", async () => {
		updateMetadataProfileFn.mockRejectedValue(new Error("boom"));

		await runMutation(
			useUpdateMetadataProfile,
			{ id: "hardcover", name: "Hardcover" } as never,
			true,
		);

		expect(error).toHaveBeenCalledWith("Failed to save metadata profile");
	});
});
