import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export type CaptureEndpoint = {
	body?: string;
	headers?: Record<string, string>;
	method: string;
	name?: string;
	path: string;
};

export type CaptureConfig = {
	baseUrl: string;
	endpoints: CaptureEndpoint[];
	outputRoot: string;
	service: string;
	stateName: string;
};

export type CaptureFilePayload = {
	body: unknown;
	contentType: string | null;
	headers: Record<string, string>;
	method: string;
	path: string;
	status: number;
};

const SECRET_KEY_PATTERN =
	/api[-_]?key|authorization|cookie|password|token|session[-_]?id/i;
const SESSION_VALUE_PATTERN = /\b(SID|_session_id)=([^;,\s]+)/gi;
const BASIC_AUTH_PATTERN = /(https?:\/\/)([^:/?#@\s]+):([^@/\s]+)@/gi;

function safeJsonParse(value: string): unknown {
	try {
		return JSON.parse(value) as unknown;
	} catch {
		return value;
	}
}

function redactSecretsInString(value: string): string {
	let redacted = value;

	for (const secretKey of ["api[-_]?key", "password", "token", "cookie"]) {
		redacted = redacted.replaceAll(
			new RegExp(`([?&]|&amp;)(${secretKey})=([^&"'<>\\s]+)`, "gi"),
			(_, prefix: string, key: string) => `${prefix}${key}=<redacted>`,
		);
	}

	return redacted
		.replaceAll(SESSION_VALUE_PATTERN, (_, key: string) => `${key}=<redacted>`)
		.replaceAll(
			BASIC_AUTH_PATTERN,
			(_, protocol: string) => `${protocol}<redacted>:<redacted>@`,
		);
}

export function captureFileNameForEndpoint(
	method: string,
	path: string,
	name?: string,
): string {
	const normalizedPath = redactSecretsInString(path)
		.replaceAll(/[^a-zA-Z0-9]+/g, "_")
		.replace(/^_+|_+$/g, "");
	const normalizedName = name
		? name.replaceAll(/[^a-zA-Z0-9]+/g, "_").replace(/^_+|_+$/g, "")
		: "";

	return `${method.toLowerCase()}__${normalizedPath || "root"}${
		normalizedName ? `__${normalizedName}` : ""
	}.json`;
}

export function scrubSecrets(value: unknown, key?: string): unknown {
	if (key && SECRET_KEY_PATTERN.test(key)) {
		return "<redacted>";
	}

	if (Array.isArray(value)) {
		return value.map((entry) => scrubSecrets(entry));
	}

	if (value && typeof value === "object") {
		const redactedEntries = Object.fromEntries(
			Object.entries(value).map(([entryKey, entryValue]) => [
				entryKey,
				scrubSecrets(entryValue, entryKey),
			]),
		);

		const fieldName =
			typeof redactedEntries.name === "string" ? redactedEntries.name : null;
		const privacy =
			typeof redactedEntries.privacy === "string"
				? redactedEntries.privacy
				: null;
		if (
			"value" in redactedEntries &&
			((fieldName && SECRET_KEY_PATTERN.test(fieldName)) ||
				(privacy && SECRET_KEY_PATTERN.test(privacy)))
		) {
			redactedEntries.value = "<redacted>";
		}

		return redactedEntries;
	}

	if (typeof value === "string" && key && SECRET_KEY_PATTERN.test(key)) {
		return "<redacted>";
	}

	if (typeof value === "string") {
		return redactSecretsInString(value);
	}

	return value;
}

export function parseCaptureCliArgs(argv: string[]): { configPath: string } {
	const configIndex = argv.findIndex((arg) => arg === "--config");
	const configPath =
		configIndex >= 0 && configIndex + 1 < argv.length
			? argv[configIndex + 1]
			: null;

	if (!configPath) {
		throw new Error(
			"Usage: bun scripts/capture-golden-fixtures.ts --config <path>",
		);
	}

	return { configPath };
}

export async function captureFixtureSet(config: CaptureConfig): Promise<void> {
	for (const endpoint of config.endpoints) {
		const response = await fetch(new URL(endpoint.path, config.baseUrl), {
			body: endpoint.body,
			headers: endpoint.headers,
			method: endpoint.method,
		});

		const contentType = response.headers.get("content-type");
		const responseText = await response.text();
		const parsedBody =
			contentType?.includes("application/json") === true
				? safeJsonParse(responseText)
				: responseText;

		const payload: CaptureFilePayload = {
			body: scrubSecrets(parsedBody),
			contentType,
			headers: (scrubSecrets(endpoint.headers ?? {}) ?? {}) as Record<
				string,
				string
			>,
			method: endpoint.method.toUpperCase(),
			path: scrubSecrets(endpoint.path) as string,
			status: response.status,
		};

		const outputPath = join(
			config.outputRoot,
			config.service,
			config.stateName,
			captureFileNameForEndpoint(endpoint.method, endpoint.path, endpoint.name),
		);
		mkdirSync(dirname(outputPath), { recursive: true });
		writeFileSync(outputPath, JSON.stringify(payload, null, 2));
	}
}
