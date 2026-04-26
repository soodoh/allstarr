import { createFileRoute } from "@tanstack/react-router";
import { eq } from "drizzle-orm";
import { db } from "src/db";
import { syncedIndexers } from "src/db/schema";
import requireApiKey from "src/server/api-key-auth";
import { summarizeIndexerResource } from "src/server/synced-indexers/logging";
import {
	fromReadarrResource,
	toReadarrResource,
} from "src/server/synced-indexers/mapper";
import {
	invalidIndexerPayloadResponse,
	parseReadarrIndexerResourceRequest,
} from "src/server/synced-indexers/resource-schema";

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
					console.info(`[Sync API] PUT /indexer/${id} → not found`);
					return Response.json({ message: "Not Found" }, { status: 404 });
				}

				const parsed = await parseReadarrIndexerResourceRequest(request);
				if (!parsed.success) {
					return parsed.response;
				}

				const body = parsed.data;
				console.info(
					`[Sync API] PUT /indexer/${id} → updating "${body.name}" (${body.implementation}, protocol=${body.protocol})`,
					summarizeIndexerResource(body),
				);
				let data: ReturnType<typeof fromReadarrResource>;
				try {
					data = fromReadarrResource(body);
				} catch (error) {
					const message =
						error instanceof Error
							? error.message
							: "Unable to map indexer payload";
					return invalidIndexerPayloadResponse([message]);
				}

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

				console.info(`[Sync API] DELETE /indexer/${id}`);
				await db.delete(syncedIndexers).where(eq(syncedIndexers.id, id)).run();

				return new Response(null, { status: 200 });
			},
		},
	},
});
