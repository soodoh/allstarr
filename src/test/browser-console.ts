import { expect } from "vitest";

type ConsoleErrorCall = {
	args: unknown[];
};

type BrowserConsoleGuard = {
	assertNoDomNestingWarnings: () => void;
	restore: () => void;
};

function formatConsoleError(args: unknown[]): string {
	return args
		.map((arg) => {
			if (typeof arg === "string") {
				return arg;
			}
			if (arg instanceof Error) {
				return arg.message;
			}
			try {
				return JSON.stringify(arg);
			} catch {
				return String(arg);
			}
		})
		.join(" ");
}

function isDomNestingWarning(args: unknown[]): boolean {
	const message = formatConsoleError(args);
	return (
		message.includes("validateDOMNesting") ||
		/<button>.*descendant.*<button>/i.test(message)
	);
}

export function trapBrowserConsoleError(): BrowserConsoleGuard {
	const originalConsoleError = console.error;
	const errorCalls: ConsoleErrorCall[] = [];

	console.error = ((...args: unknown[]) => {
		errorCalls.push({ args });
	}) as typeof console.error;

	return {
		assertNoDomNestingWarnings: () => {
			const domNestingWarnings = errorCalls.filter((call) =>
				isDomNestingWarning(call.args),
			);
			expect(domNestingWarnings).toHaveLength(0);
		},
		restore: () => {
			console.error = originalConsoleError;
		},
	};
}
