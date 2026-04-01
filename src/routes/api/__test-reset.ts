import { createFileRoute } from "@tanstack/react-router";

/**
 * Test-only endpoint that resets server-side caches and state.
 * Only available when SQLITE_JOURNAL_MODE is set (i.e. during E2E tests).
 */
export const Route = createFileRoute("/api/__test-reset")({
	server: {
		handlers: {
			POST: async () => {
				if (!process.env.SQLITE_JOURNAL_MODE) {
					return new Response("Not available", { status: 404 });
				}
				// Lazy imports to avoid triggering heavy module compilation on route load
				const { invalidateFormatDefCache } = await import(
					"src/server/indexers/format-parser"
				);
				const { clearRunningTasks } = await import("src/server/scheduler");
				invalidateFormatDefCache();
				clearRunningTasks();
				return Response.json({ ok: true });
			},
		},
	},
});
