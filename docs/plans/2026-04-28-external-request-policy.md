# External Request Policy Implementation Plan

> **REQUIRED SUB-SKILL:** Use the executing-plans skill to implement this plan task-by-task.

**Goal:** Centralize external HTTP timeout, retry, and rate-limit behavior so integrations fail, retry, and report transient failures consistently.

**Architecture:** Extend the existing `src/server/external-request-policy.ts` from timeout/retry-delay helpers into a small shared request policy. Keep integration-specific parsing and domain error messages in each client, but route HTTP execution, timeout handling, retryable statuses, and `Retry-After` delays through one tested function.

**Tech Stack:** TypeScript, Bun, Vitest, native `fetch`, `Response`, `AbortController`, existing `ApiRateLimitError` from `src/server/api-cache.ts`.

---

### Task 1: Add shared retrying fetch policy tests

**Files:**
- Modify: `src/server/external-request-policy.test.ts`
- Modify later: `src/server/external-request-policy.ts`

**Step 1: Write the failing tests**

Add tests for a new exported function named `fetchWithExternalPolicy`:

```ts
import {
	fetchWithExternalPolicy,
	// existing imports...
} from "./external-request-policy";

it("returns a successful response without retrying", async () => {
	const response = new Response("ok", { status: 200 });
	const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(response);

	await expect(
		fetchWithExternalPolicy("http://example.test", {}, {
			timeoutMs: 1000,
			timeoutMessage: "Request timed out.",
		}),
	).resolves.toBe(response);
	expect(fetchMock).toHaveBeenCalledTimes(1);
});

it("retries 429 responses using Retry-After before returning success", async () => {
	vi.useFakeTimers();
	vi.spyOn(globalThis, "fetch")
		.mockResolvedValueOnce(
			new Response("rate limited", {
				status: 429,
				headers: { "Retry-After": "2" },
			}),
		)
		.mockResolvedValueOnce(new Response("ok", { status: 200 }));

	const promise = fetchWithExternalPolicy("http://example.test", {}, {
		timeoutMs: 1000,
		timeoutMessage: "Request timed out.",
		retry: { maxRetries: 1, baseDelayMs: 50, retryStatuses: [429] },
	});

	await vi.advanceTimersByTimeAsync(2000);
	const response = await promise;
	expect(response.status).toBe(200);
	expect(globalThis.fetch).toHaveBeenCalledTimes(2);
});

it("returns the final retryable response after retry exhaustion", async () => {
	vi.useFakeTimers();
	vi.spyOn(globalThis, "fetch")
		.mockResolvedValueOnce(new Response("limited", { status: 429 }))
		.mockResolvedValueOnce(new Response("still limited", { status: 429 }));

	const promise = fetchWithExternalPolicy("http://example.test", {}, {
		timeoutMs: 1000,
		timeoutMessage: "Request timed out.",
		retry: { maxRetries: 1, baseDelayMs: 50, retryStatuses: [429] },
	});

	await vi.advanceTimersByTimeAsync(50);
	const response = await promise;
	expect(response.status).toBe(429);
	expect(globalThis.fetch).toHaveBeenCalledTimes(2);
});

it("calls retry hooks for rate-limit and recovery", async () => {
	vi.useFakeTimers();
	const onRetry = vi.fn();
	const onSuccess = vi.fn();
	vi.spyOn(globalThis, "fetch")
		.mockResolvedValueOnce(new Response("limited", { status: 429 }))
		.mockResolvedValueOnce(new Response("ok", { status: 200 }));

	const promise = fetchWithExternalPolicy("http://example.test", {}, {
		timeoutMs: 1000,
		timeoutMessage: "Request timed out.",
		retry: { maxRetries: 1, baseDelayMs: 50, retryStatuses: [429] },
		onRetry,
		onSuccess,
	});

	await vi.advanceTimersByTimeAsync(50);
	await promise;
	expect(onRetry).toHaveBeenCalledWith(
		expect.objectContaining({ attempt: 0, status: 429, delayMs: 50 }),
	);
	expect(onSuccess).toHaveBeenCalledWith(expect.objectContaining({ attempt: 1 }));
});
```

**Step 2: Run test to verify it fails**

Run:

```bash
bun run test -- src/server/external-request-policy.test.ts
```

Expected: FAIL because `fetchWithExternalPolicy` is not exported.

**Step 3: Implement the minimal shared policy**

In `src/server/external-request-policy.ts`, add types and implementation:

```ts
export type ExternalRequestRetryOptions = {
	maxRetries: number;
	baseDelayMs: number;
	maxDelayMs?: number;
	retryStatuses?: number[];
};

export type ExternalRequestAttemptInfo = {
	attempt: number;
	status?: number;
	delayMs?: number;
	response?: Response;
};

export type ExternalRequestPolicyOptions = {
	timeoutMs: number;
	timeoutMessage: string;
	retry?: ExternalRequestRetryOptions;
	onRetry?: (info: ExternalRequestAttemptInfo) => void;
	onSuccess?: (info: ExternalRequestAttemptInfo) => void;
};

function shouldRetryResponse(
	response: Response,
	attempt: number,
	retry?: ExternalRequestRetryOptions,
): boolean {
	if (!retry || attempt >= retry.maxRetries) return false;
	return (retry.retryStatuses ?? [429, 502, 503, 504]).includes(response.status);
}

export async function fetchWithExternalPolicy(
	url: string,
	options: RequestInit,
	policy: ExternalRequestPolicyOptions,
): Promise<Response> {
	for (let attempt = 0; ; attempt += 1) {
		const response = await fetchWithExternalTimeout(
			url,
			options,
			policy.timeoutMs,
			policy.timeoutMessage,
		);

		if (!shouldRetryResponse(response, attempt, policy.retry)) {
			if (response.ok) policy.onSuccess?.({ attempt, status: response.status, response });
			return response;
		}

		const retryAfterMs = parseRetryAfterHeader(response);
		const delayMs = resolveRetryDelayMs({
			attempt,
			baseDelayMs: policy.retry?.baseDelayMs ?? 0,
			retryAfterMs,
			maxDelayMs: policy.retry?.maxDelayMs,
		});
		policy.onRetry?.({ attempt, status: response.status, delayMs, response });
		await sleep(delayMs);
	}
}
```

**Step 4: Run test to verify it passes**

Run:

```bash
bun run test -- src/server/external-request-policy.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add src/server/external-request-policy.ts src/server/external-request-policy.test.ts
git commit -m "feat(reliability): add shared external request policy"
```

---

### Task 2: Migrate TMDB to the shared policy

**Files:**
- Modify: `src/server/tmdb/client.ts`
- Test: `src/server/tmdb/client.test.ts`

**Step 1: Write or update failing tests**

In `src/server/tmdb/client.test.ts`, add coverage that proves TMDB uses the shared timeout/retry path:

```ts
it("retries TMDB 429 responses before returning data", async () => {
	vi.useFakeTimers();
	process.env.TMDB_TOKEN = "token";
	vi.spyOn(globalThis, "fetch")
		.mockResolvedValueOnce(new Response("limited", { status: 429 }))
		.mockResolvedValueOnce(
			new Response(JSON.stringify({ results: [] }), {
				status: 200,
				headers: { "Content-Type": "application/json" },
			}),
		);

	const promise = tmdbFetch<{ results: unknown[] }>("/search/movie", { query: "Alien" });
	await vi.advanceTimersByTimeAsync(2000);
	await expect(promise).resolves.toEqual({ results: [] });
	expect(globalThis.fetch).toHaveBeenCalledTimes(2);
});
```

Adjust setup names to match the existing test file conventions.

**Step 2: Run test to verify it fails**

Run:

```bash
bun run test -- src/server/tmdb/client.test.ts
```

Expected: FAIL because current TMDB code converts `429` directly into `ApiRateLimitError` for `createApiFetcher` instead of using the new policy-level retry.

**Step 3: Update TMDB implementation**

Change import in `src/server/tmdb/client.ts`:

```ts
import { ApiRateLimitError, createApiFetcher } from "../api-cache";
import { fetchWithExternalPolicy } from "../external-request-policy";
```

Replace the call to `fetchWithExternalTimeout` with:

```ts
const response = await fetchWithExternalPolicy(cacheKey, {}, {
	timeoutMs: REQUEST_TIMEOUT_MS,
	timeoutMessage: "TMDB API request timed out.",
	retry: { maxRetries: 3, baseDelayMs: 2000, retryStatuses: [429, 502, 503, 504] },
});
```

Keep the existing post-response checks:

```ts
if (response.status === 429) {
	throw new ApiRateLimitError("TMDB rate limit");
}
if (!response.ok) {
	throw new Error(`TMDB API error: ${response.status} ${response.statusText}`);
}
```

**Step 4: Run test to verify it passes**

Run:

```bash
bun run test -- src/server/tmdb/client.test.ts src/server/external-request-policy.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add src/server/tmdb/client.ts src/server/tmdb/client.test.ts
git commit -m "fix(reliability): route tmdb requests through shared policy"
```

---

### Task 3: Migrate Hardcover to the shared policy

**Files:**
- Modify: `src/server/hardcover/client.ts`
- Test: `src/server/hardcover/client.test.ts`

**Step 1: Write or update failing tests**

Add a test for retrying transient `429` before parsing GraphQL JSON:

```ts
it("retries Hardcover 429 responses before parsing data", async () => {
	vi.useFakeTimers();
	process.env.HARDCOVER_TOKEN = "token";
	vi.spyOn(globalThis, "fetch")
		.mockResolvedValueOnce(new Response("limited", { status: 429 }))
		.mockResolvedValueOnce(
			new Response(JSON.stringify({ data: { books: [] } }), {
				status: 200,
				headers: { "Content-Type": "application/json" },
			}),
		);

	const promise = hardcoverFetch<{ books: unknown[] }>("query Test { books { id } }", {});
	await vi.advanceTimersByTimeAsync(2000);
	await expect(promise).resolves.toEqual({ books: [] });
	expect(globalThis.fetch).toHaveBeenCalledTimes(2);
});
```

**Step 2: Run test to verify it fails**

Run:

```bash
bun run test -- src/server/hardcover/client.test.ts
```

Expected: FAIL under current direct timeout fetch behavior.

**Step 3: Update Hardcover implementation**

Change import in `src/server/hardcover/client.ts`:

```ts
import { fetchWithExternalPolicy } from "../external-request-policy";
```

Replace `fetchWithExternalTimeout(...)` with:

```ts
const response = await fetchWithExternalPolicy(
	HARDCOVER_GRAPHQL_URL,
	{
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: authorization,
		},
		body: JSON.stringify({ query, variables }),
		cache: "no-store",
	},
	{
		timeoutMs: REQUEST_TIMEOUT_MS,
		timeoutMessage: "Hardcover API request timed out.",
		retry: { maxRetries: 3, baseDelayMs: 2000, retryStatuses: [429, 502, 503, 504] },
	},
);
```

Keep the existing final `429` conversion to `ApiRateLimitError` after retries are exhausted.

**Step 4: Run test to verify it passes**

Run:

```bash
bun run test -- src/server/hardcover/client.test.ts src/server/external-request-policy.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add src/server/hardcover/client.ts src/server/hardcover/client.test.ts
git commit -m "fix(reliability): route hardcover requests through shared policy"
```

---

### Task 4: Migrate indexer HTTP retry logic

**Files:**
- Modify: `src/server/indexers/http.ts`
- Test: `src/server/indexers/http.test.ts` or existing indexer HTTP-related test file

**Step 1: Write or update failing tests**

Find the existing indexer HTTP retry tests. If no focused file exists, create `src/server/indexers/http.test.ts`. Add coverage for:

- `429` calls `reportRateLimited`
- successful retry calls `reportSuccess`
- `Retry-After` controls delay
- exhausted `429` returns the final response and preserves existing thrown `Newznab search returned HTTP 429...` behavior from caller

Example target behavior:

```ts
it("reports rate limit and success around a retried indexer request", async () => {
	vi.useFakeTimers();
	// Mock fetch: 429 then XML success.
	// Mock indexer-rate-limiter reportRateLimited/reportSuccess.
	// Call searchNewznab(..., { indexerType: "manual", indexerId: 7 }).
	// Advance timers.
	// Assert reportRateLimited("manual", 7, 2000) and reportSuccess("manual", 7).
});
```

**Step 2: Run test to verify it fails if behavior is not yet policy-owned**

Run:

```bash
bun run test -- src/server/indexers/http.test.ts
```

Expected: FAIL if the new assertions depend on policy hook behavior not yet wired.

**Step 3: Replace local `fetchWithRetry` internals**

In `src/server/indexers/http.ts`:

- Import `fetchWithExternalPolicy` instead of `parseRetryAfterHeader`, `resolveRetryDelayMs`, and `sleep`.
- Keep `recordQuery`, `reportRateLimited`, `reportSuccess`, and `logInfo` in this module because they are indexer-domain side effects.
- Rewrite local `fetchWithRetry` to call:

```ts
const res = await fetchWithExternalPolicy(url, options, {
	timeoutMs,
	timeoutMessage: "Connection timed out.",
	retry: {
		maxRetries: MAX_RETRIES,
		baseDelayMs: BASE_BACKOFF_MS,
		maxDelayMs: 30_000,
		retryStatuses: [429],
	},
	onRetry: ({ attempt, delayMs }) => {
		if (indexerIdentity) {
			reportRateLimited(
				indexerIdentity.indexerType,
				indexerIdentity.indexerId,
				delayMs && delayMs > 0 ? delayMs : undefined,
			);
		}
		logInfo(
			"indexer",
			`429 rate-limited, retrying in ${Math.round((delayMs ?? 0) / 1000)}s (attempt ${attempt + 1}/${MAX_RETRIES})`,
		);
	},
	onSuccess: () => {
		if (indexerIdentity) {
			reportSuccess(indexerIdentity.indexerType, indexerIdentity.indexerId);
		}
	},
});
```

Return `res` as before.

**Step 4: Run test to verify it passes**

Run:

```bash
bun run test -- src/server/indexers/http.test.ts src/server/external-request-policy.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add src/server/indexers/http.ts src/server/indexers/http.test.ts
git commit -m "fix(reliability): route indexer retries through shared policy"
```

---

### Task 5: Keep download-client timeout helper as a thin wrapper

**Files:**
- Modify: `src/server/download-clients/http.ts`
- Test: `src/server/download-clients/http.test.ts`

**Step 1: Write or update tests**

Add or confirm tests for:

```ts
it("uses the shared policy timeout message", async () => {
	vi.useFakeTimers();
	vi.spyOn(globalThis, "fetch").mockImplementation((_url, init) => {
		return new Promise<Response>((_resolve, reject) => {
			init?.signal?.addEventListener("abort", () => {
				reject(new DOMException("aborted", "AbortError"));
			});
		});
	});

	const promise = expect(
		fetchWithTimeout("http://example.test", {}, 100),
	).rejects.toThrow("Connection timed out.");

	await vi.advanceTimersByTimeAsync(100);
	await promise;
});
```

**Step 2: Run test**

Run:

```bash
bun run test -- src/server/download-clients/http.test.ts
```

Expected: PASS already, because this file is already a thin wrapper around `fetchWithExternalTimeout`.

**Step 3: Decide whether to change implementation**

If Task 1 keeps `fetchWithExternalTimeout` as the lower-level primitive, no production change is required here. If the team wants every integration to call `fetchWithExternalPolicy`, update wrapper to:

```ts
return fetchWithExternalPolicy(url, options, {
	timeoutMs,
	timeoutMessage: "Connection timed out.",
});
```

Prefer no change unless tests or lint suggest the wrapper should use the new public API.

**Step 4: Commit only if files changed**

```bash
git add src/server/download-clients/http.ts src/server/download-clients/http.test.ts
git commit -m "test(reliability): cover download client timeout policy"
```

---

### Task 6: Full verification and documentation note

**Files:**
- Optional modify: `docs/superpowers/backlogs/2026-04-27-reliability-code-quality-backlog.md` only if marking progress is desired.

**Step 1: Run focused tests**

```bash
bun run test -- \
  src/server/external-request-policy.test.ts \
  src/server/__tests__/api-cache.test.ts \
  src/server/indexers/http.test.ts \
  src/server/hardcover/client.test.ts \
  src/server/tmdb/client.test.ts \
  src/server/download-clients/http.test.ts
```

Expected: PASS.

**Step 2: Run typecheck**

```bash
bun run typecheck
```

Expected: PASS.

**Step 3: Run lint**

```bash
bun run lint
```

Expected: PASS. If formatting fails, run `bun run lint:fix`, inspect changes, then rerun `bun run lint`.

**Step 4: Commit final docs/checklist update if needed**

```bash
git add docs/superpowers/backlogs/2026-04-27-reliability-code-quality-backlog.md
git commit -m "docs(reliability): note external request policy progress"
```

Only do this if the backlog is intentionally updated; otherwise skip.

---

## Final Review Checklist

- `fetchWithExternalPolicy` is the only place that owns retryable status handling and `Retry-After` delay calculation.
- Integration modules still own domain-specific behavior: XML/JSON parsing, final error messages, indexer rate-limiter reporting, and `ApiRateLimitError` conversion after retries are exhausted.
- Existing cache semantics in `createApiFetcher` are preserved.
- Existing timeout messages remain stable.
- No generated files are edited.
- All focused tests, `bun run typecheck`, and `bun run lint` pass.
