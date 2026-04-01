import { createFileRoute } from "@tanstack/react-router";
import requireApiKey from "src/server/api-key-auth";

export const Route = createFileRoute("/api/v1/indexer/test")({
	server: {
		handlers: {
			POST: async ({ request }: { request: Request }) => {
				await requireApiKey(request);
				// Prowlarr calls this after creating an indexer to verify it works.
				// We return success since Prowlarr already validated its own indexer.
				return Response.json([]);
			},
		},
	},
});
