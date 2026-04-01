import { createFileRoute } from "@tanstack/react-router";
import requireApiKey from "src/server/api-key-auth";
import getSchemaTemplates from "src/server/synced-indexers/schema-templates";

export const Route = createFileRoute("/api/v1/indexer/schema")({
	server: {
		handlers: {
			GET: async ({ request }: { request: Request }) => {
				await requireApiKey(request);
				const templates = getSchemaTemplates();
				console.log(
					`[Sync API] GET /indexer/schema → returning ${templates.length} templates: ${templates.map((t) => t.implementation).join(", ")}`,
				);
				return Response.json(templates);
			},
		},
	},
});
