function normalizeScope(scope: string): string {
	return scope.startsWith("[") ? scope : `[${scope}]`;
}

export function logInfo(scope: string, message: string): void {
	console.log(`${normalizeScope(scope)} ${message}`);
}

export function logWarn(scope: string, message: string): void {
	console.warn(`${normalizeScope(scope)} ${message}`);
}

export function logError(
	scope: string,
	message: string,
	error?: unknown,
): void {
	const formatted = `${normalizeScope(scope)} ${message}`;
	if (error === undefined) {
		console.error(formatted);
		return;
	}
	console.error(formatted, error);
}
