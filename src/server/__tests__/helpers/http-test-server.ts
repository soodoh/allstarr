import {
	createServer,
	type IncomingMessage,
	type ServerResponse,
} from "node:http";

export type CapturedHttpRequest = {
	method: string;
	pathname: string;
	search: string;
	searchParams: URLSearchParams;
	headers: Record<string, string | string[] | undefined>;
	body: string;
};

async function readBody(req: IncomingMessage): Promise<string> {
	const chunks: Buffer[] = [];
	for await (const chunk of req) {
		chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
	}
	return Buffer.concat(chunks).toString("utf8");
}

export async function startHttpTestServer(
	handler: (
		request: CapturedHttpRequest,
		response: ServerResponse,
		requests: CapturedHttpRequest[],
	) => Promise<void> | void,
) {
	const requests: CapturedHttpRequest[] = [];
	const server = createServer((req, res) => {
		void (async () => {
			const url = new URL(req.url ?? "/", "http://127.0.0.1");
			const request: CapturedHttpRequest = {
				method: req.method ?? "GET",
				pathname: url.pathname,
				search: url.search,
				searchParams: url.searchParams,
				headers: req.headers,
				body: await readBody(req),
			};
			requests.push(request);
			await handler(request, res, requests);
		})().catch((error) => {
			res.statusCode = 500;
			res.end(error instanceof Error ? error.message : String(error));
		});
	});

	await new Promise<void>((resolve) => {
		server.listen(0, "127.0.0.1", resolve);
	});

	const address = server.address();
	if (!address || typeof address === "string") {
		throw new Error("Expected the test server to listen on a port");
	}

	return {
		baseUrl: `http://127.0.0.1:${address.port}`,
		requests,
		async stop() {
			await new Promise<void>((resolve, reject) => {
				server.close((error) => {
					if (error) {
						reject(error);
						return;
					}
					resolve();
				});
			});
		},
	};
}
