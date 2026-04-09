import { beforeEach, describe, expect, it, vi } from "vitest";

const apiKeyAuthMocks = vi.hoisted(() => ({
	getSettingValue: vi.fn(),
	timingSafeEqual: vi.fn(),
}));

vi.mock("./settings-store", () => ({
	getSettingValue: (...args: unknown[]) =>
		apiKeyAuthMocks.getSettingValue(...args),
}));

vi.mock("node:crypto", () => ({
	timingSafeEqual: (...args: unknown[]) =>
		apiKeyAuthMocks.timingSafeEqual(...args),
}));

import requireApiKey from "./api-key-auth";

describe("requireApiKey", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		apiKeyAuthMocks.getSettingValue.mockReturnValue("secret-key");
		apiKeyAuthMocks.timingSafeEqual.mockReturnValue(true);
	});

	it("rejects requests without an api key header", async () => {
		const request = new Request("https://example.com/api");

		await expect(requireApiKey(request)).rejects.toBeInstanceOf(Response);

		try {
			await requireApiKey(request);
		} catch (error) {
			const response = error as Response;
			expect(response.status).toBe(401);
			await expect(response.json()).resolves.toEqual({
				message: "API key required",
			});
		}
	});

	it("rejects requests when no stored api key exists", async () => {
		apiKeyAuthMocks.getSettingValue.mockReturnValue("");
		const request = new Request("https://example.com/api", {
			headers: { "X-Api-Key": "secret-key" },
		});

		try {
			await requireApiKey(request);
		} catch (error) {
			const response = error as Response;
			expect(response.status).toBe(401);
			await expect(response.json()).resolves.toEqual({
				message: "Invalid API key",
			});
		}
	});

	it("rejects requests when the provided key length differs", async () => {
		const request = new Request("https://example.com/api", {
			headers: { "X-Api-Key": "short" },
		});

		try {
			await requireApiKey(request);
		} catch (error) {
			const response = error as Response;
			expect(response.status).toBe(401);
			await expect(response.json()).resolves.toEqual({
				message: "Invalid API key",
			});
		}

		expect(apiKeyAuthMocks.timingSafeEqual).not.toHaveBeenCalled();
	});

	it("rejects requests when timingSafeEqual reports a mismatch", async () => {
		apiKeyAuthMocks.timingSafeEqual.mockReturnValue(false);
		const request = new Request("https://example.com/api", {
			headers: { "X-Api-Key": "secret-key" },
		});

		try {
			await requireApiKey(request);
		} catch (error) {
			const response = error as Response;
			expect(response.status).toBe(401);
			await expect(response.json()).resolves.toEqual({
				message: "Invalid API key",
			});
		}

		expect(apiKeyAuthMocks.timingSafeEqual).toHaveBeenCalledTimes(1);
	});

	it("accepts requests with a matching api key", async () => {
		const request = new Request("https://example.com/api", {
			headers: { "X-Api-Key": "secret-key" },
		});

		await expect(requireApiKey(request)).resolves.toBeUndefined();
		expect(apiKeyAuthMocks.getSettingValue).toHaveBeenCalledWith(
			"general.apiKey",
			"",
		);
		expect(apiKeyAuthMocks.timingSafeEqual).toHaveBeenCalledTimes(1);
	});
});
