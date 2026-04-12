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

function substituteConsoleMessage(template: string, args: unknown[]): string {
	let index = 0;

	const message = template.replace(/%[sdifoOc]/g, (token) => {
		const value = args[index];
		index += 1;

		if (token === "%c") {
			return "";
		}
		if (typeof value === "string") {
			return value;
		}
		if (typeof value === "number" || typeof value === "boolean") {
			return String(value);
		}
		if (value instanceof Error) {
			return value.message;
		}
		return formatConsoleError([value]);
	});

	if (index >= args.length) {
		return message;
	}

	const rest = args.slice(index).map((arg) => formatConsoleError([arg]));
	return [message, ...rest].filter(Boolean).join(" ");
}

function isDomNestingWarning(args: unknown[]): boolean {
	const [firstArg, ...rest] = args;
	const messages = [formatConsoleError(args)];

	if (typeof firstArg === "string") {
		messages.push(substituteConsoleMessage(firstArg, rest));
	}

	return messages.some(
		(message) =>
			message.includes("validateDOMNesting") ||
			/<button>\s+cannot be a descendant of\s+<button>/i.test(message),
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
