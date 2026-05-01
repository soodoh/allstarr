import type { HandlerResult } from "./base";

export type CapturedResponse = {
	body: unknown;
	contentType: string | null;
	status: number;
};

export type CapturedReplayState = {
	capturedResponses?: Record<string, CapturedResponse>;
};

export function buildCapturedPathKey(method: string, path: string): string {
	return `${method.toUpperCase()} ${path}`;
}

export function buildCapturedNamedKey(family: string, name: string): string {
	return `${family}:${name}`;
}

export function getCapturedResponse(
	state: CapturedReplayState,
	key: string,
): HandlerResult {
	const captured = state.capturedResponses?.[key];
	if (!captured) {
		return null;
	}

	return {
		status: captured.status,
		...(captured.contentType
			? {
					headers: {
						"Content-Type": captured.contentType,
					},
				}
			: {}),
		body:
			typeof captured.body === "string"
				? captured.body
				: JSON.stringify(captured.body),
	};
}
