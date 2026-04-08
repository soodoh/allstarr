import { afterEach, describe, expect, it, vi } from "vitest";
import { buildBaseUrl, fetchWithTimeout } from "./http";

afterEach(() => {
	vi.restoreAllMocks();
	vi.useRealTimers();
});

describe("download client http helpers", () => {
	describe("buildBaseUrl", () => {
		it("normalizes empty, relative, and slash-prefixed urlBase values", () => {
			expect(buildBaseUrl("127.0.0.1", 8080, false, "")).toBe(
				"http://127.0.0.1:8080",
			);
			expect(buildBaseUrl("127.0.0.1", 8080, false, "api")).toBe(
				"http://127.0.0.1:8080/api",
			);
			expect(buildBaseUrl("127.0.0.1", 8080, true, "/api/")).toBe(
				"https://127.0.0.1:8080/api",
			);
		});
	});

	describe("fetchWithTimeout", () => {
		it("translates AbortError into Connection timed out.", async () => {
			vi.useFakeTimers();

			const abortError = new DOMException(
				"The operation was aborted.",
				"AbortError",
			);
			vi.spyOn(globalThis, "fetch").mockImplementation((_url, init) => {
				const signal = init?.signal;
				return new Promise<Response>((_resolve, reject) => {
					if (signal?.aborted) {
						reject(abortError);
						return;
					}

					signal?.addEventListener(
						"abort",
						() => {
							reject(abortError);
						},
						{ once: true },
					);
				});
			});

			const promise = expect(
				fetchWithTimeout("http://example.com/test", {}, 25),
			).rejects.toThrow("Connection timed out.");
			await vi.advanceTimersByTimeAsync(25);
			await promise;
		});

		it("rethrows non-timeout errors unchanged", async () => {
			const error = new Error("network failed");
			vi.spyOn(globalThis, "fetch").mockRejectedValue(error);

			await expect(
				fetchWithTimeout("http://example.com/test", {}),
			).rejects.toBe(error);
		});
	});
});
