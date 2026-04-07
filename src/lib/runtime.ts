export type RuntimeEnvLike =
	| {
			SSR?: boolean;
	  }
	| undefined;

export function detectServerRuntime(
	env: RuntimeEnvLike = import.meta.env,
	hasWindow = typeof globalThis.window !== "undefined",
): boolean {
	return Boolean(env?.SSR) || !hasWindow;
}

export const isServerRuntime = detectServerRuntime();
