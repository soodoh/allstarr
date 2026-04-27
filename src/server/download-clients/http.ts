import { fetchWithExternalTimeout } from "../external-request-policy";

export function buildBaseUrl(
	host: string,
	port: number,
	useSsl: boolean,
	urlBase?: string | null,
): string {
	const scheme = useSsl ? "https" : "http";
	const base = `${scheme}://${host}:${port}`;
	if (urlBase) {
		const normalized = urlBase.startsWith("/") ? urlBase : `/${urlBase}`;
		const trimmed = normalized.endsWith("/")
			? normalized.slice(0, -1)
			: normalized;
		return `${base}${trimmed}`;
	}
	return base;
}

export async function fetchWithTimeout(
	url: string,
	options: RequestInit,
	timeoutMs = 10_000,
): Promise<Response> {
	return fetchWithExternalTimeout(
		url,
		options,
		timeoutMs,
		"Connection timed out.",
	);
}
