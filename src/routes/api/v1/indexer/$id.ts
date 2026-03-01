import { createFileRoute } from "@tanstack/react-router";
import { db } from "src/db";
import { syncedIndexers } from "src/db/schema";
import { eq } from "drizzle-orm";
import requireApiKey from "src/server/api-key-auth";
import {
  toReadarrResource,
  fromReadarrResource,
} from "src/server/synced-indexers/mapper";
import type { ReadarrIndexerResource } from "src/server/synced-indexers/mapper";

export const Route = createFileRoute("/api/v1/indexer/$id")({
  server: {
    handlers: {
      GET: async ({
        request,
        params,
      }: {
        request: Request;
        params: { id: string };
      }) => {
        await requireApiKey(request);

        const id = Number.parseInt(params.id, 10);
        if (Number.isNaN(id)) {
          return Response.json({ message: "Invalid ID" }, { status: 400 });
        }

        const row = await db
          .select()
          .from(syncedIndexers)
          .where(eq(syncedIndexers.id, id))
          .get();

        if (!row) {
          return Response.json({ message: "Not Found" }, { status: 404 });
        }

        return Response.json(toReadarrResource(row));
      },

      PUT: async ({
        request,
        params,
      }: {
        request: Request;
        params: { id: string };
      }) => {
        await requireApiKey(request);

        const id = Number.parseInt(params.id, 10);
        if (Number.isNaN(id)) {
          return Response.json({ message: "Invalid ID" }, { status: 400 });
        }

        const existing = await db
          .select()
          .from(syncedIndexers)
          .where(eq(syncedIndexers.id, id))
          .get();

        if (!existing) {
          console.log(`[Sync API] PUT /indexer/${id} → not found`);
          return Response.json({ message: "Not Found" }, { status: 404 });
        }

        const body = (await request.json()) as ReadarrIndexerResource;
        console.log(
          `[Sync API] PUT /indexer/${id} → updating "${body.name}" (${body.implementation}, protocol=${body.protocol})`,
        );
        const data = fromReadarrResource(body);

        const [updated] = await db
          .update(syncedIndexers)
          .set({ ...data, updatedAt: Date.now() })
          .where(eq(syncedIndexers.id, id))
          .returning();

        return Response.json(toReadarrResource(updated));
      },

      DELETE: async ({
        request,
        params,
      }: {
        request: Request;
        params: { id: string };
      }) => {
        await requireApiKey(request);

        const id = Number.parseInt(params.id, 10);
        if (Number.isNaN(id)) {
          return Response.json({ message: "Invalid ID" }, { status: 400 });
        }

        console.log(`[Sync API] DELETE /indexer/${id}`);
        await db.delete(syncedIndexers).where(eq(syncedIndexers.id, id)).run();

        return new Response(null, { status: 200 });
      },
    },
  },
});
