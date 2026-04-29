import { ApiRateLimitError, createApiFetcher } from "../api-cache";
import { fetchWithExternalPolicy } from "../external-request-policy";

const HARDCOVER_GRAPHQL_URL =
	process.env.HARDCOVER_GRAPHQL_URL || "https://api.hardcover.app/v1/graphql";
const REQUEST_TIMEOUT_MS = 30_000;

const hardcover = createApiFetcher({
	name: "hardcover",
	cache: { ttlMs: 5 * 60 * 1000, maxEntries: 1000 },
	rateLimit: { maxRequests: 60, windowMs: 60_000 },
	retry: { maxRetries: 0, baseDelayMs: 2000 },
});

function getAuthorizationHeader(): string {
	const rawToken = process.env.HARDCOVER_TOKEN?.trim();
	if (!rawToken) {
		throw new Error("HARDCOVER_TOKEN is not configured.");
	}
	return rawToken.startsWith("Bearer ") ? rawToken : `Bearer ${rawToken}`;
}

export async function hardcoverFetch<T>(
	query: string,
	variables: Record<string, unknown>,
): Promise<T> {
	const authorization = getAuthorizationHeader();
	const cacheKey = query + JSON.stringify(variables);

	return hardcover.fetch<T>(cacheKey, async () => {
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
				retry: {
					maxRetries: 3,
					baseDelayMs: 2000,
					retryStatuses: [429, 502, 503, 504],
				},
			},
		);
		if (response.status === 429) {
			throw new ApiRateLimitError("Hardcover rate limit");
		}
		const rawText = await response.text();
		let body: { data?: T; errors?: Array<{ message: string }> };
		try {
			body = JSON.parse(rawText);
		} catch {
			throw new Error(
				`Hardcover API returned non-JSON (status ${response.status})`,
			);
		}
		if (!response.ok) {
			throw new Error(
				`Hardcover API request failed (status ${response.status}).`,
			);
		}
		if (body.errors && body.errors.length > 0) {
			throw new Error(body.errors[0]?.message || "Hardcover API error.");
		}
		if (!body.data) {
			throw new Error("No data in Hardcover API response.");
		}
		return body.data;
	});
}
