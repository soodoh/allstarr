import { createFileRoute } from "@tanstack/react-router";

/**
 * Test-only endpoint that resets server-side caches and state.
 * Only available when E2E_TEST_MODE is explicitly enabled.
 */
export const Route = createFileRoute("/api/__test-reset")({
	server: {
		handlers: {
			POST: async () => {
				if (process.env.E2E_TEST_MODE !== "true") {
					return new Response("Not available", { status: 404 });
				}
				// Lazy imports to avoid triggering heavy module compilation on route load
				const { invalidateFormatDefCache } = await import(
					"src/server/indexers/format-parser"
				);
				const { clearRunningTasks } = await import(
					"src/server/scheduler/state"
				);
				const { clearTmdbCache } = await import("src/server/tmdb/client");
				invalidateFormatDefCache();
				clearRunningTasks();
				clearTmdbCache();
				return Response.json({ ok: true });
			},
		},
	},
});
