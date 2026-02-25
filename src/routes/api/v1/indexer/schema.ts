import { createFileRoute } from "@tanstack/react-router";
import requireApiKey from "src/server/api-key-auth";
import getSchemaTemplates from "src/server/synced-indexers/schema-templates";

export const Route = createFileRoute("/api/v1/indexer/schema")({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        await requireApiKey(request);
        return Response.json(getSchemaTemplates());
      },
    },
  },
});
