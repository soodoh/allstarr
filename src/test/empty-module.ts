/**
 * Stub module for server-only packages in browser test mode.
 *
 * TanStack Start's server-runtime packages use virtual-module subpath imports
 * (`#tanstack-start-entry`, `#tanstack-router-entry`) that only resolve when
 * the `tanstackStart()` Vite plugin is active. Vitest browser mode doesn't
 * load those virtual modules, so importing these packages during test
 * dependency scanning crashes with "Missing specifier" errors.
 *
 * Component/route tests always mock their server-fn imports via `vi.mock()`,
 * so they never need the real implementations. This stub lets Vite resolve
 * the import chain without blowing up.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const getRequest = (): any => {
	throw new Error(
		"getRequest from @tanstack/react-start/server should not be called in browser test mode",
	);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const createServerFn = (): any => {
	throw new Error(
		"createServerFn should not be called in browser test mode — mock the containing module",
	);
};

export default {};
