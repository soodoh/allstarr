import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	fetchFn: vi.fn(),
	getMediaSetting: vi.fn(),
}));

vi.mock("../api-cache", () => ({
	ApiRateLimitError: class extends Error {
		readonly status = 429;
		constructor(msg: string) {
			super(msg);
			this.name = "ApiRateLimitError";
		}
	},
	createApiFetcher: () => ({
		fetch: mocks.fetchFn,
	}),
}));

vi.mock("../settings-reader", () => ({
	default: mocks.getMediaSetting,
}));

let tmdbFetch: typeof import("./client").tmdbFetch;

beforeEach(async () => {
	vi.resetModules();
	mocks.fetchFn.mockReset();
	mocks.getMediaSetting.mockReset();
	mocks.getMediaSetting.mockReturnValue("en");

	const mod = await import("./client");
	tmdbFetch = mod.tmdbFetch;
});

afterEach(() => {
	vi.unstubAllEnvs();
	vi.useRealTimers();
});

describe("tmdbFetch", () => {
	it("throws when TMDB_TOKEN is not set", async () => {
		vi.stubEnv("TMDB_TOKEN", "");

		await expect(tmdbFetch("/movie/123")).rejects.toThrow(
			"TMDB API key not configured",
		);
		expect(mocks.fetchFn).not.toHaveBeenCalled();
	});

	it("builds URL with API key and default language", async () => {
		vi.stubEnv("TMDB_TOKEN", "test-api-key");
		mocks.getMediaSetting.mockReturnValue("en");
		mocks.fetchFn.mockResolvedValue({ id: 123 });

		const result = await tmdbFetch("/movie/123");

		expect(result).toStrictEqual({ id: 123 });
		expect(mocks.fetchFn).toHaveBeenCalledOnce();

		const [cacheKey] = mocks.fetchFn.mock.calls[0] as [string, () => unknown];
		const url = new URL(cacheKey);
		expect(url.origin + url.pathname).toBe(
			"https://api.themoviedb.org/3/movie/123",
		);
		expect(url.searchParams.get("api_key")).toBe("test-api-key");
		expect(url.searchParams.get("language")).toBe("en");
	});

	it("uses the language from getMediaSetting", async () => {
		vi.stubEnv("TMDB_TOKEN", "test-api-key");
		mocks.getMediaSetting.mockReturnValue("de");
		mocks.fetchFn.mockResolvedValue({});

		await tmdbFetch("/movie/456");

		const [cacheKey] = mocks.fetchFn.mock.calls[0] as [string, () => unknown];
		const url = new URL(cacheKey);
		expect(url.searchParams.get("language")).toBe("de");
		expect(mocks.getMediaSetting).toHaveBeenCalledWith(
			"metadata.tmdb.language",
			"en",
		);
	});

	it("uses TMDB_API_BASE_URL when provided", async () => {
		vi.stubEnv("TMDB_TOKEN", "test-api-key");
		vi.stubEnv("TMDB_API_BASE_URL", "http://localhost:19010/3");
		mocks.fetchFn.mockResolvedValue({});

		await tmdbFetch("/movie/456");

		const [cacheKey] = mocks.fetchFn.mock.calls[0] as [string, () => unknown];
		const url = new URL(cacheKey);
		expect(url.origin + url.pathname).toBe(
			"http://localhost:19010/3/movie/456",
		);
	});

	it("appends custom params to the URL", async () => {
		vi.stubEnv("TMDB_TOKEN", "test-api-key");
		mocks.fetchFn.mockResolvedValue({});

		await tmdbFetch("/search/movie", { query: "Inception", page: "2" });

		const [cacheKey] = mocks.fetchFn.mock.calls[0] as [string, () => unknown];
		const url = new URL(cacheKey);
		expect(url.searchParams.get("query")).toBe("Inception");
		expect(url.searchParams.get("page")).toBe("2");
		expect(url.searchParams.get("api_key")).toBe("test-api-key");
	});

	describe("inner fetcher function", () => {
		beforeEach(() => {
			vi.stubEnv("TMDB_TOKEN", "test-api-key");
			mocks.fetchFn.mockImplementation(
				async (_key: string, fn: () => unknown) => fn(),
			);
		});

		it("fetches and returns JSON on success", async () => {
			const mockResponse = {
				ok: true,
				status: 200,
				json: vi.fn().mockResolvedValue({ title: "Inception" }),
			};
			vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockResponse));

			const result = await tmdbFetch<{ title: string }>("/movie/123");

			expect(result).toStrictEqual({ title: "Inception" });
			expect(globalThis.fetch).toHaveBeenCalledOnce();

			const fetchUrl = (
				vi.mocked(globalThis.fetch).mock.calls[0] as [string]
			)[0];
			expect(fetchUrl).toContain("https://api.themoviedb.org/3/movie/123");
		});

		it("retries TMDB 429 responses before returning data", async () => {
			vi.useFakeTimers();
			vi.stubGlobal("fetch", vi.fn());
			vi.mocked(globalThis.fetch)
				.mockResolvedValueOnce(
					new Response("limited", {
						status: 429,
					}),
				)
				.mockResolvedValueOnce(
					new Response(JSON.stringify({ results: [] }), {
						status: 200,
						headers: { "Content-Type": "application/json" },
					}),
				);

			const promise = tmdbFetch<{ results: unknown[] }>("/search/movie", {
				query: "Alien",
			});
			await vi.advanceTimersByTimeAsync(2000);
			await expect(promise).resolves.toEqual({ results: [] });
			expect(globalThis.fetch).toHaveBeenCalledTimes(2);
		});

		it("throws ApiRateLimitError on 429 response", async () => {
			vi.stubGlobal(
				"fetch",
				vi.fn().mockResolvedValue(
					new Response("rate limited", {
						status: 429,
						headers: { "Retry-After": "0" },
					}),
				),
			);

			await expect(tmdbFetch("/movie/123")).rejects.toThrow("TMDB rate limit");
		});

		it("throws on non-OK responses", async () => {
			const mockResponse = {
				ok: false,
				status: 404,
				statusText: "Not Found",
			};
			vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockResponse));

			await expect(tmdbFetch("/movie/999")).rejects.toThrow(
				"TMDB API error: 404 Not Found",
			);
		});

		it("throws a timeout error when the request is aborted", async () => {
			vi.useFakeTimers();
			vi.stubGlobal(
				"fetch",
				vi.fn().mockImplementation((_url, init) => {
					return new Promise<Response>((_resolve, reject) => {
						init?.signal?.addEventListener(
							"abort",
							() => {
								reject(init.signal?.reason);
							},
							{ once: true },
						);
					});
				}),
			);

			const promise = expect(tmdbFetch("/movie/123")).rejects.toThrow(
				"TMDB API request timed out.",
			);
			await vi.advanceTimersByTimeAsync(30_000);
			await promise;
		});
	});
});
