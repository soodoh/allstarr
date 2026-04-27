import { afterEach, describe, expect, it, vi } from "vitest";
import {
	createAbortTimeoutError,
	fetchWithExternalTimeout,
	parseRetryAfterHeader,
	resolveRetryDelayMs,
	sleep,
} from "./external-request-policy";

describe("external request policy", () => {
	afterEach(() => {
		vi.useRealTimers();
		vi.restoreAllMocks();
	});

	it("parses Retry-After seconds", () => {
		const response = new Response(null, {
			headers: { "Retry-After": "3" },
		});

		expect(parseRetryAfterHeader(response)).toBe(3000);
	});

	it("parses Retry-After dates", () => {
		vi.setSystemTime(new Date("2026-04-27T00:00:00.000Z"));
		const response = new Response(null, {
			headers: { "Retry-After": "Mon, 27 Apr 2026 00:00:05 GMT" },
		});

		expect(parseRetryAfterHeader(response)).toBe(5000);
	});

	it("falls back to exponential retry delays", () => {
		expect(resolveRetryDelayMs({ attempt: 2, baseDelayMs: 1000 })).toBe(4000);
		expect(
			resolveRetryDelayMs({
				attempt: 2,
				baseDelayMs: 1000,
				retryAfterMs: 10_000,
				maxDelayMs: 30_000,
			}),
		).toBe(10_000);
	});

	it("wraps abort errors with a stable timeout message", async () => {
		const abortError = new DOMException("aborted", "AbortError");
		const error = createAbortTimeoutError(
			"TMDB API request timed out.",
			abortError,
		);

		expect(error.message).toBe("TMDB API request timed out.");
		expect(error.cause).toBe(abortError);
	});

	it("sleeps using timers", async () => {
		vi.useFakeTimers();
		const promise = sleep(250);
		await vi.advanceTimersByTimeAsync(250);
		await expect(promise).resolves.toBeUndefined();
	});

	it("wraps fetch aborts from the timeout signal", async () => {
		vi.useFakeTimers();
		const abortError = new DOMException("aborted", "AbortError");
		vi.spyOn(globalThis, "fetch").mockImplementation((_url, init) => {
			return new Promise<Response>((_resolve, reject) => {
				init?.signal?.addEventListener(
					"abort",
					() => {
						reject(abortError);
					},
					{ once: true },
				);
			});
		});

		const promise = expect(
			fetchWithExternalTimeout(
				"http://example.com",
				{},
				250,
				"Request timed out.",
			),
		).rejects.toThrow("Request timed out.");
		await vi.advanceTimersByTimeAsync(250);
		await promise;
	});

	it("preserves an already-aborted caller signal instead of wrapping it as a timeout", async () => {
		const callerAbortError = new DOMException("caller aborted", "AbortError");
		const callerController = new AbortController();
		callerController.abort(callerAbortError);
		vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null));

		await expect(
			fetchWithExternalTimeout(
				"http://example.com",
				{ signal: callerController.signal },
				250,
				"Request timed out.",
			),
		).rejects.toBe(callerAbortError);
	});

	it("preserves caller aborts during fetch instead of wrapping them as timeouts", async () => {
		vi.useFakeTimers();
		const callerAbortError = new DOMException("caller aborted", "AbortError");
		const callerController = new AbortController();
		vi.spyOn(globalThis, "fetch").mockImplementation((_url, init) => {
			return new Promise<Response>((_resolve, reject) => {
				init?.signal?.addEventListener(
					"abort",
					() => {
						reject(init.signal?.reason);
					},
					{ once: true },
				);
			});
		});

		const promise = expect(
			fetchWithExternalTimeout(
				"http://example.com",
				{ signal: callerController.signal },
				1000,
				"Request timed out.",
			),
		).rejects.toBe(callerAbortError);
		callerController.abort(callerAbortError);
		await vi.advanceTimersByTimeAsync(1000);
		await promise;
	});
});
