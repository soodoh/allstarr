import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	fetchFn: vi.fn(),
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

let hardcoverFetch: typeof import("./client").hardcoverFetch;

beforeEach(async () => {
	vi.resetModules();
	mocks.fetchFn.mockReset();

	const mod = await import("./client");
	hardcoverFetch = mod.hardcoverFetch;
});

afterEach(() => {
	vi.unstubAllEnvs();
	vi.useRealTimers();
});

describe("hardcoverFetch", () => {
	it("throws when HARDCOVER_TOKEN is not set", async () => {
		vi.stubEnv("HARDCOVER_TOKEN", "");

		await expect(hardcoverFetch("{ books { id } }", {})).rejects.toThrow(
			"HARDCOVER_TOKEN is not configured.",
		);
		expect(mocks.fetchFn).not.toHaveBeenCalled();
	});

	it('adds "Bearer " prefix when token lacks it', async () => {
		vi.stubEnv("HARDCOVER_TOKEN", "my-raw-token");
		mocks.fetchFn.mockImplementation(async (_key: string, fn: () => unknown) =>
			fn(),
		);
		const mockResponse = {
			ok: true,
			status: 200,
			text: vi.fn().mockResolvedValue(JSON.stringify({ data: { books: [] } })),
		};
		vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockResponse));

		await hardcoverFetch("{ books { id } }", {});

		const fetchCall = vi.mocked(globalThis.fetch).mock.calls[0] as [
			string,
			RequestInit,
		];
		const headers = fetchCall[1].headers as Record<string, string>;
		expect(headers.Authorization).toBe("Bearer my-raw-token");
	});

	it('passes through token that already has "Bearer " prefix', async () => {
		vi.stubEnv("HARDCOVER_TOKEN", "Bearer already-prefixed");
		mocks.fetchFn.mockImplementation(async (_key: string, fn: () => unknown) =>
			fn(),
		);
		const mockResponse = {
			ok: true,
			status: 200,
			text: vi.fn().mockResolvedValue(JSON.stringify({ data: { books: [] } })),
		};
		vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockResponse));

		await hardcoverFetch("{ books { id } }", {});

		const fetchCall = vi.mocked(globalThis.fetch).mock.calls[0] as [
			string,
			RequestInit,
		];
		const headers = fetchCall[1].headers as Record<string, string>;
		expect(headers.Authorization).toBe("Bearer already-prefixed");
	});

	it("sends correct GraphQL request body", async () => {
		vi.stubEnv("HARDCOVER_TOKEN", "test-token");
		mocks.fetchFn.mockImplementation(async (_key: string, fn: () => unknown) =>
			fn(),
		);
		const mockResponse = {
			ok: true,
			status: 200,
			text: vi
				.fn()
				.mockResolvedValue(JSON.stringify({ data: { search: [{ id: 1 }] } })),
		};
		vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockResponse));

		const query = "query Search($term: String!) { search(term: $term) { id } }";
		const variables = { term: "Dune" };

		await hardcoverFetch(query, variables);

		const fetchCall = vi.mocked(globalThis.fetch).mock.calls[0] as [
			string,
			RequestInit,
		];
		expect(JSON.parse(fetchCall[1].body as string)).toStrictEqual({
			query,
			variables,
		});
		expect(fetchCall[0]).toBe("https://api.hardcover.app/v1/graphql");
	});

	it("uses the cache key based on query + variables", async () => {
		vi.stubEnv("HARDCOVER_TOKEN", "test-token");
		mocks.fetchFn.mockResolvedValue({ books: [] });

		await hardcoverFetch("{ books { id } }", { limit: 10 });

		const [cacheKey] = mocks.fetchFn.mock.calls[0] as [string, () => unknown];
		expect(cacheKey).toBe('{ books { id } }{"limit":10}');
	});

	describe("inner fetcher function", () => {
		beforeEach(() => {
			vi.stubEnv("HARDCOVER_TOKEN", "test-token");
			mocks.fetchFn.mockImplementation(
				async (_key: string, fn: () => unknown) => fn(),
			);
		});

		it("returns data on successful response", async () => {
			const mockResponse = {
				ok: true,
				status: 200,
				text: vi
					.fn()
					.mockResolvedValue(
						JSON.stringify({ data: { book: { id: 42, title: "Dune" } } }),
					),
			};
			vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockResponse));

			const result = await hardcoverFetch<{
				book: { id: number; title: string };
			}>("{ book(id: 42) { id title } }", {});

			expect(result).toStrictEqual({ book: { id: 42, title: "Dune" } });
		});

		it("retries Hardcover 429 responses before parsing data", async () => {
			vi.useFakeTimers();
			vi.stubGlobal("fetch", vi.fn());
			vi.mocked(globalThis.fetch)
				.mockResolvedValueOnce(
					new Response("rate limited", {
						status: 429,
					}),
				)
				.mockResolvedValueOnce(
					new Response(JSON.stringify({ data: { books: [] } }), {
						status: 200,
						headers: { "Content-Type": "application/json" },
					}),
				);

			const promise = hardcoverFetch<{ books: unknown[] }>(
				"{ books { id } }",
				{},
			);
			const expectation = expect(promise).resolves.toEqual({ books: [] });
			await vi.advanceTimersByTimeAsync(2000);
			await expectation;
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

			await expect(hardcoverFetch("{ books { id } }", {})).rejects.toThrow(
				"Hardcover rate limit",
			);
		});

		it("does not duplicate persistent rate-limit retries through the cache fetcher", async () => {
			vi.useFakeTimers();
			vi.doUnmock("../api-cache");
			vi.resetModules();
			vi.stubEnv("HARDCOVER_TOKEN", "test-token");
			const { hardcoverFetch: realHardcoverFetch } = await import("./client");
			const fetchMock = vi.fn().mockResolvedValue(
				new Response("rate limited", {
					status: 429,
					headers: { "Retry-After": "0" },
				}),
			);
			vi.stubGlobal("fetch", fetchMock);

			const promise = realHardcoverFetch("{ books { id } }", {});
			const expectation = expect(promise).rejects.toThrow(
				"Hardcover rate limit",
			);
			await vi.advanceTimersByTimeAsync(70_000);
			await expectation;

			expect(fetchMock).toHaveBeenCalledTimes(4);
		});

		it("throws on non-JSON responses", async () => {
			const mockResponse = {
				ok: true,
				status: 200,
				text: vi.fn().mockResolvedValue("<html>Server Error</html>"),
			};
			vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockResponse));

			await expect(hardcoverFetch("{ books { id } }", {})).rejects.toThrow(
				"Hardcover API returned non-JSON (status 200)",
			);
		});

		it("throws on non-OK HTTP status with valid JSON", async () => {
			const mockResponse = {
				ok: false,
				status: 500,
				text: vi
					.fn()
					.mockResolvedValue(
						JSON.stringify({ errors: [{ message: "Internal error" }] }),
					),
			};
			vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockResponse));

			await expect(hardcoverFetch("{ books { id } }", {})).rejects.toThrow(
				"Hardcover API request failed (status 500).",
			);
		});

		it("throws on GraphQL errors in the response body", async () => {
			const mockResponse = {
				ok: true,
				status: 200,
				text: vi.fn().mockResolvedValue(
					JSON.stringify({
						data: null,
						errors: [{ message: "Field 'foo' not found" }],
					}),
				),
			};
			vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockResponse));

			await expect(hardcoverFetch("{ foo { id } }", {})).rejects.toThrow(
				"Field 'foo' not found",
			);
		});

		it("throws when response body has no data field", async () => {
			const mockResponse = {
				ok: true,
				status: 200,
				text: vi.fn().mockResolvedValue(JSON.stringify({})),
			};
			vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockResponse));

			await expect(hardcoverFetch("{ books { id } }", {})).rejects.toThrow(
				"No data in Hardcover API response.",
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

			const promise = expect(
				hardcoverFetch("{ books { id } }", {}),
			).rejects.toThrow("Hardcover API request timed out.");
			await vi.advanceTimersByTimeAsync(30_000);
			await promise;
		});

		it("uses default GraphQL errors message when error message is empty", async () => {
			const mockResponse = {
				ok: true,
				status: 200,
				text: vi.fn().mockResolvedValue(
					JSON.stringify({
						data: null,
						errors: [{ message: "" }],
					}),
				),
			};
			vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockResponse));

			await expect(hardcoverFetch("{ foo }", {})).rejects.toThrow(
				"Hardcover API error.",
			);
		});
	});
});
