import { createFileRoute } from "@tanstack/react-router";
import { eventBus } from "src/server/event-bus";
import { getSessionFromRequest } from "src/server/middleware";

export const Route = createFileRoute("/api/events")({
	server: {
		handlers: {
			GET: async ({ request }: { request: Request }) => {
				const session = await getSessionFromRequest(request);
				if (!session) {
					return new Response("Unauthorized", { status: 401 });
				}

				let controller: ReadableStreamDefaultController;
				const stream = new ReadableStream({
					start(c) {
						controller = c;
						eventBus.addClient(controller);
						// Send initial keepalive
						controller.enqueue(new TextEncoder().encode(": connected\n\n"));
					},
					cancel() {
						eventBus.removeClient(controller);
					},
				});

				return new Response(stream, {
					headers: {
						"Content-Type": "text/event-stream",
						"Cache-Control": "no-cache",
						Connection: "keep-alive",
					},
				});
			},
		},
	},
});
