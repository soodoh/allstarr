import { createFileRoute } from "@tanstack/react-router";
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

export const Route = createFileRoute("/api/v1/indexer/")({
	server: {
		handlers: {
			GET: async ({ request }: { request: Request }) => {
				await requireApiKey(request);

				const rows = await db.select().from(syncedIndexers).all();
				console.info(
					`[Sync API] GET /indexer → returning ${rows.length} synced indexers: ${rows.map((r) => `${r.name} (${r.implementation})`).join(", ") || "none"}`,
				);
				return Response.json(rows.map(toReadarrResource));
			},

			POST: async ({ request }: { request: Request }) => {
				await requireApiKey(request);

				const parsed = await parseReadarrIndexerResourceRequest(request);
				if (!parsed.success) {
					return parsed.response;
				}

				const body = parsed.data;
				console.info(
					`[Sync API] POST /indexer → creating "${body.name}" (${body.implementation}, protocol=${body.protocol})`,
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

				const now = Date.now();
				const [row] = await db
					.insert(syncedIndexers)
					.values({ ...data, createdAt: now, updatedAt: now })
					.returning();

				console.info(`[Sync API] POST /indexer → created id=${row.id}`);
				return Response.json(toReadarrResource(row), { status: 201 });
			},
		},
	},
});
