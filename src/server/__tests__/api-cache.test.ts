import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createApiFetcher } from "../api-cache";

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
    const fetcher = makeFetcher({ maxEntries: 2 });

    await fetcher.fetch("a", () => Promise.resolve("val-a"));
    await fetcher.fetch("b", () => Promise.resolve("val-b"));
    // Access "a" again to promote it
    await fetcher.fetch("a", () => Promise.resolve("should-not-call"));
    // Insert "c" — should evict "b" (least recent), not "a"
    await fetcher.fetch("c", () => Promise.resolve("val-c"));

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
