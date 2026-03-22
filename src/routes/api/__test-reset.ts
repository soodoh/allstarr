import { createFileRoute } from "@tanstack/react-router";
import { invalidateFormatDefCache } from "src/server/indexers/format-parser";

/**
 * Test-only endpoint that resets server-side caches.
 * Only available when SQLITE_JOURNAL_MODE is set (i.e. during E2E tests).
 */
export const Route = createFileRoute("/api/__test-reset")({
  server: {
    handlers: {
      POST: async () => {
        if (!process.env.SQLITE_JOURNAL_MODE) {
          return new Response("Not available", { status: 404 });
        }
        invalidateFormatDefCache();
        return Response.json({ ok: true });
      },
    },
  },
});
