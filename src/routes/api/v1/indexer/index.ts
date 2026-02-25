import { createFileRoute } from "@tanstack/react-router";
import { db } from "src/db";
import { syncedIndexers } from "src/db/schema";
import requireApiKey from "src/server/api-key-auth";
import {
  toReadarrResource,
  fromReadarrResource,
} from "src/server/synced-indexers/mapper";
import type { ReadarrIndexerResource } from "src/server/synced-indexers/mapper";

export const Route = createFileRoute("/api/v1/indexer/")({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        await requireApiKey(request);

        const rows = await db.select().from(syncedIndexers).all();
        return Response.json(rows.map(toReadarrResource));
      },

      POST: async ({ request }: { request: Request }) => {
        await requireApiKey(request);

        const body = (await request.json()) as ReadarrIndexerResource;
        const data = fromReadarrResource(body);

        const now = Date.now();
        const [row] = await db
          .insert(syncedIndexers)
          .values({ ...data, createdAt: now, updatedAt: now })
          .returning();

        return Response.json(toReadarrResource(row), { status: 201 });
      },
    },
  },
});
