import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiRateLimitError, createApiFetcher } from "../api-cache";

function makeFetcher(overrides?: {
	ttlMs?: number;
	maxEntries?: number;
	maxRequests?: number;
	windowMs?: number;
}) {
	return createApiFetcher({
		name: "test",
		cache: {
			ttlMs: overrides?.ttlMs ?? 60_000,
			maxEntries: overrides?.maxEntries ?? 100,
		},
		rateLimit: {
			maxRequests: overrides?.maxRequests ?? 1000,
			windowMs: overrides?.windowMs ?? 1000,
		},
		retry: { maxRetries: 0, baseDelayMs: 100 },
	});
}

describe("createApiFetcher — cache", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});
	afterEach(() => {
		vi.useRealTimers();
	});

	it("returns cached value on second call with same key", async () => {
		const fetcher = makeFetcher();
		const fetchFn = vi.fn().mockResolvedValue({ id: 1 });

		const first = await fetcher.fetch("key1", fetchFn);
		const second = await fetcher.fetch("key1", fetchFn);

		expect(first).toStrictEqual({ id: 1 });
		expect(second).toStrictEqual({ id: 1 });
		expect(fetchFn).toHaveBeenCalledTimes(1);
	});

	it("calls fetchFn again for different keys", async () => {
		const fetcher = makeFetcher();
		const fetchFn = vi
			.fn()
			.mockResolvedValueOnce("a")
			.mockResolvedValueOnce("b");

		await fetcher.fetch("key1", fetchFn);
		await fetcher.fetch("key2", fetchFn);

		expect(fetchFn).toHaveBeenCalledTimes(2);
	});

	it("expires entries after TTL", async () => {
		const fetcher = makeFetcher({ ttlMs: 1000 });
		const fetchFn = vi
			.fn()
			.mockResolvedValueOnce("old")
			.mockResolvedValueOnce("new");

		await fetcher.fetch("key1", fetchFn);
		vi.advanceTimersByTime(1001);
		const result = await fetcher.fetch("key1", fetchFn);

		expect(result).toBe("new");
		expect(fetchFn).toHaveBeenCalledTimes(2);
	});

	it("evicts LRU entry when at max capacity", async () => {
		const fetcher = makeFetcher({ maxEntries: 2 });

		await fetcher.fetch("a", () => Promise.resolve("val-a"));
		await fetcher.fetch("b", () => Promise.resolve("val-b"));
		await fetcher.fetch("c", () => Promise.resolve("val-c"));

		// "a" should have been evicted
		const refetchA = vi.fn().mockResolvedValue("val-a-new");
		const result = await fetcher.fetch("a", refetchA);
		expect(refetchA).toHaveBeenCalledTimes(1);
		expect(result).toBe("val-a-new");
	});

	it("promotes accessed entry in LRU order", async () => {
		const fetcher = makeFetcher({ maxEntries: 3 });

		await fetcher.fetch("a", () => Promise.resolve("val-a")); // [a]
		await fetcher.fetch("b", () => Promise.resolve("val-b")); // [a, b]
		await fetcher.fetch("c", () => Promise.resolve("val-c")); // [a, b, c]
		// Access "a" to promote it to most recent
		await fetcher.fetch("a", () => Promise.resolve("ignored")); // [b, c, a]
		// Insert "d" — should evict "b" (least recent), not "a" (promoted)
		await fetcher.fetch("d", () => Promise.resolve("val-d")); // [c, a, d]

		const refetchB = vi.fn().mockResolvedValue("val-b-new");
		await fetcher.fetch("b", refetchB);
		expect(refetchB).toHaveBeenCalledTimes(1); // "b" was evicted

		const refetchA = vi.fn().mockResolvedValue("val-a-new");
		await fetcher.fetch("a", refetchA);
		expect(refetchA).not.toHaveBeenCalled(); // "a" still cached
	});

	it("periodic sweep clears expired entries", async () => {
		const fetcher = makeFetcher({ ttlMs: 1000 });

		await fetcher.fetch("a", () => Promise.resolve("val"));
		expect(fetcher.size).toBe(1);

		vi.advanceTimersByTime(1001); // Trigger sweep
		expect(fetcher.size).toBe(0);
	});

	it("clear() empties the cache", async () => {
		const fetcher = makeFetcher();
		await fetcher.fetch("a", () => Promise.resolve("val"));
		expect(fetcher.size).toBe(1);

		fetcher.clear();
		expect(fetcher.size).toBe(0);
	});

	it("reports size correctly", async () => {
		const fetcher = makeFetcher();
		expect(fetcher.size).toBe(0);
		await fetcher.fetch("a", () => Promise.resolve(1));
		expect(fetcher.size).toBe(1);
		await fetcher.fetch("b", () => Promise.resolve(2));
		expect(fetcher.size).toBe(2);
	});
});

describe("createApiFetcher — rate limiting", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});
	afterEach(() => {
		vi.useRealTimers();
	});

	it("allows requests within the rate limit window", async () => {
		const fetcher = createApiFetcher({
			name: "test",
			cache: { ttlMs: 60_000, maxEntries: 100 },
			rateLimit: { maxRequests: 3, windowMs: 1000 },
			retry: { maxRetries: 0, baseDelayMs: 100 },
		});

		let callCount = 0;
		const fetchFn = () => {
			callCount += 1;
			return Promise.resolve(callCount);
		};

		await fetcher.fetch("a", fetchFn);
		await fetcher.fetch("b", fetchFn);
		await fetcher.fetch("c", fetchFn);

		expect(callCount).toBe(3);
	});

	it("delays requests when rate limit window is full", async () => {
		const fetcher = createApiFetcher({
			name: "test",
			cache: { ttlMs: 60_000, maxEntries: 100 },
			rateLimit: { maxRequests: 2, windowMs: 1000 },
			retry: { maxRetries: 0, baseDelayMs: 100 },
		});

		let callCount = 0;
		const fetchFn = () => {
			callCount += 1;
			return Promise.resolve(callCount);
		};

		await fetcher.fetch("a", fetchFn);
		await fetcher.fetch("b", fetchFn);

		// Third request should be delayed
		const thirdPromise = fetcher.fetch("c", fetchFn);
		expect(callCount).toBe(2); // Not yet called

		// Advance past the rate limit window
		await vi.advanceTimersByTimeAsync(1100);
		await thirdPromise;
		expect(callCount).toBe(3);
	});
});

describe("createApiFetcher — retry", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});
	afterEach(() => {
		vi.useRealTimers();
	});

	it("retries on ApiRateLimitError", async () => {
		const fetcher = createApiFetcher({
			name: "test",
			cache: { ttlMs: 60_000, maxEntries: 100 },
			rateLimit: { maxRequests: 1000, windowMs: 1000 },
			retry: { maxRetries: 2, baseDelayMs: 100 },
		});

		const fetchFn = vi
			.fn()
			.mockRejectedValueOnce(new ApiRateLimitError())
			.mockResolvedValueOnce("success");

		const resultPromise = fetcher.fetch("key", fetchFn);
		await vi.advanceTimersByTimeAsync(150);
		const result = await resultPromise;

		expect(result).toBe("success");
		expect(fetchFn).toHaveBeenCalledTimes(2);
	});

	it("retries on error with status 429", async () => {
		const fetcher = createApiFetcher({
			name: "test",
			cache: { ttlMs: 60_000, maxEntries: 100 },
			rateLimit: { maxRequests: 1000, windowMs: 1000 },
			retry: { maxRetries: 2, baseDelayMs: 100 },
		});

		const err429 = new Error("rate limited");
		(err429 as unknown as Record<string, number>).status = 429;

		const fetchFn = vi
			.fn()
			.mockRejectedValueOnce(err429)
			.mockResolvedValueOnce("success");

		const resultPromise = fetcher.fetch("key", fetchFn);
		await vi.advanceTimersByTimeAsync(150);
		const result = await resultPromise;

		expect(result).toBe("success");
		expect(fetchFn).toHaveBeenCalledTimes(2);
	});

	it("throws immediately on non-429 errors", async () => {
		const fetcher = createApiFetcher({
			name: "test",
			cache: { ttlMs: 60_000, maxEntries: 100 },
			rateLimit: { maxRequests: 1000, windowMs: 1000 },
			retry: { maxRetries: 3, baseDelayMs: 100 },
		});

		const fetchFn = vi.fn().mockRejectedValue(new Error("network error"));

		await expect(fetcher.fetch("key", fetchFn)).rejects.toThrow(
			"network error",
		);
		expect(fetchFn).toHaveBeenCalledTimes(1);
	});

	it("throws after exhausting all retries", async () => {
		const fetcher = createApiFetcher({
			name: "test",
			cache: { ttlMs: 60_000, maxEntries: 100 },
			rateLimit: { maxRequests: 1000, windowMs: 1000 },
			retry: { maxRetries: 2, baseDelayMs: 100 },
		});

		const fetchFn = vi.fn().mockRejectedValue(new ApiRateLimitError());

		const resultPromise = fetcher.fetch("key", fetchFn).catch((error) => error);
		await vi.advanceTimersByTimeAsync(500);

		const error = await resultPromise;
		expect(error).toBeInstanceOf(ApiRateLimitError);
		expect(fetchFn).toHaveBeenCalledTimes(3); // initial + 2 retries
	});

	it("uses exponential backoff", async () => {
		const fetcher = createApiFetcher({
			name: "test",
			cache: { ttlMs: 60_000, maxEntries: 100 },
			rateLimit: { maxRequests: 1000, windowMs: 1000 },
			retry: { maxRetries: 3, baseDelayMs: 1000 },
		});

		const fetchFn = vi
			.fn()
			.mockRejectedValueOnce(new ApiRateLimitError()) // attempt 0
			.mockRejectedValueOnce(new ApiRateLimitError()) // attempt 1
			.mockResolvedValueOnce("success"); // attempt 2

		const resultPromise = fetcher.fetch("key", fetchFn);

		// After 999ms: only initial attempt should have been called
		await vi.advanceTimersByTimeAsync(999);
		expect(fetchFn).toHaveBeenCalledTimes(1);

		// After 1000ms (base * 2^0): first retry fires
		await vi.advanceTimersByTimeAsync(1);
		expect(fetchFn).toHaveBeenCalledTimes(2);

		// After 2000ms more (base * 2^1): second retry fires
		await vi.advanceTimersByTimeAsync(2000);
		const result = await resultPromise;

		expect(result).toBe("success");
		expect(fetchFn).toHaveBeenCalledTimes(3);
	});
});
