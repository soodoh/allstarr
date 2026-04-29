export type DiagnosticStatus = "ok" | "error" | "info";

export type DiagnosticEvent = {
	scope: string;
	event: string;
	status: DiagnosticStatus;
	elapsedMs?: number;
	fields?: Record<string, boolean | number | string | null | undefined>;
};

type DiagnosticTimerOptions = {
	log?: (line: string) => void;
	now?: () => number;
};

const SECRET_FIELD_PATTERN = /api[-_]?key|secret|token|password|cookie|authorization/i;

export function redactDiagnosticValue(key: string, value: unknown): string {
	if (value == null) {
		return "";
	}
	if (SECRET_FIELD_PATTERN.test(key)) {
		return "[redacted]";
	}
	return String(value).replaceAll(/\s+/g, " ");
}

export function formatDiagnosticLine(event: DiagnosticEvent): string {
	const parts = [
		"[e2e]",
		`scope=${event.scope}`,
		`event=${event.event}`,
		`status=${event.status}`,
	];

	if (typeof event.elapsedMs === "number") {
		parts.push(`elapsedMs=${Math.round(event.elapsedMs)}`);
	}

	for (const [key, value] of Object.entries(event.fields ?? {})) {
		if (value === undefined) {
			continue;
		}
		parts.push(`${key}=${redactDiagnosticValue(key, value)}`);
	}

	return parts.join(" ");
}

export function createDiagnosticBuffer(limit = 100) {
	const events: DiagnosticEvent[] = [];

	return {
		record(event: DiagnosticEvent): void {
			events.push(event);
			while (events.length > limit) {
				events.shift();
			}
		},
		toJSON(): DiagnosticEvent[] {
			return [...events];
		},
		toText(): string {
			return events.map(formatDiagnosticLine).join("\n");
		},
		clear(): void {
			events.length = 0;
		},
	};
}

export async function timeDiagnosticOperation<T>(
	event: Omit<DiagnosticEvent, "status" | "elapsedMs">,
	operation: () => Promise<T>,
	options: DiagnosticTimerOptions = {},
): Promise<T> {
	const now = options.now ?? Date.now;
	const log = options.log ?? console.info;
	const start = now();

	try {
		const result = await operation();
		log(formatDiagnosticLine({ ...event, status: "ok", elapsedMs: now() - start }));
		return result;
	} catch (error) {
		log(
			formatDiagnosticLine({
				...event,
				status: "error",
				elapsedMs: now() - start,
				fields: {
					...event.fields,
					error: error instanceof Error ? error.message : String(error),
				},
			}),
		);
		throw error;
	}
}
