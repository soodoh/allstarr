import { resolveRetryDelayMs, sleep } from "./external-request-policy";

type CacheEntry = {
	data: unknown;
	expires: number;
};

type ApiFetcherOptions = {
	name: string;
	cache: {
		ttlMs: number;
		maxEntries: number;
	};
	rateLimit: {
		maxRequests: number;
		windowMs: number;
	};
	retry: {
		maxRetries: number;
		baseDelayMs: number;
	};
};

type ApiFetcher = {
	fetch<T>(key: string, fetchFn: () => Promise<T>): Promise<T>;
	clear(): void;
	readonly size: number;
};

export class ApiRateLimitError extends Error {
	readonly status = 429;
	constructor(message = "Rate limit exceeded") {
		super(message);
		this.name = "ApiRateLimitError";
	}
}

export function createApiFetcher(options: ApiFetcherOptions): ApiFetcher {
	const cache = new Map<string, CacheEntry>();
	const requestTimestamps: number[] = [];

	// Periodic sweep to free expired entries
	const sweepInterval = setInterval(() => {
		const now = Date.now();
		for (const [key, entry] of cache) {
			if (now >= entry.expires) {
				cache.delete(key);
			}
		}
	}, options.cache.ttlMs);

	// Don't keep the process alive just for the sweep
	if (typeof sweepInterval === "object" && "unref" in sweepInterval) {
		sweepInterval.unref();
	}

	function getCached<T>(key: string): T | undefined {
		const entry = cache.get(key);
		if (!entry) {
			return undefined;
		}
		if (Date.now() >= entry.expires) {
			cache.delete(key);
			return undefined;
		}
		// LRU promotion: move to end of Map iteration order
		cache.delete(key);
		cache.set(key, entry);
		return entry.data as T;
	}

	function setCache(key: string, data: unknown): void {
		if (cache.size >= options.cache.maxEntries) {
			const firstKey = cache.keys().next().value;
			if (firstKey !== undefined) {
				cache.delete(firstKey);
			}
		}
		cache.set(key, { data, expires: Date.now() + options.cache.ttlMs });
	}

	async function waitForRateLimit(): Promise<void> {
		const now = Date.now();
		while (
			requestTimestamps.length > 0 &&
			now - requestTimestamps[0] >= options.rateLimit.windowMs
		) {
			requestTimestamps.shift();
		}
		if (requestTimestamps.length >= options.rateLimit.maxRequests) {
			const oldest = requestTimestamps[0];
			const waitTime = options.rateLimit.windowMs - (now - oldest) + 100;
			await sleep(waitTime);
		}
		requestTimestamps.push(Date.now());
	}

	async function fetchWithRetry<T>(fetchFn: () => Promise<T>): Promise<T> {
		for (let attempt = 0; attempt <= options.retry.maxRetries; attempt += 1) {
			try {
				return await fetchFn();
			} catch (error: unknown) {
				const isRateLimit =
					error instanceof ApiRateLimitError ||
					(error instanceof Error &&
						"status" in error &&
						(error as { status: number }).status === 429);
				if (isRateLimit && attempt < options.retry.maxRetries) {
					const delay = resolveRetryDelayMs({
						attempt,
						baseDelayMs: options.retry.baseDelayMs,
					});
					await sleep(delay);
					continue;
				}
				throw error;
			}
		}
		throw new Error(`${options.name}: retry limit exhausted`);
	}

	return {
		async fetch<T>(key: string, fetchFn: () => Promise<T>): Promise<T> {
			const cached = getCached<T>(key);
			if (cached !== undefined) {
				return cached;
			}
			await waitForRateLimit();
			const result = await fetchWithRetry(fetchFn);
			setCache(key, result);
			return result;
		},

		clear(): void {
			cache.clear();
			clearInterval(sweepInterval);
		},

		get size(): number {
			return cache.size;
		},
	};
}
