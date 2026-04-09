import { beforeEach, describe, expect, it, vi } from "vitest";

const schemaMocks = vi.hoisted(() => {
	const requireApiKey = vi.fn();
	const getSchemaTemplates = vi.fn();

	return {
		getSchemaTemplates,
		requireApiKey,
	};
});

vi.mock("@tanstack/react-router", () => ({
	createFileRoute: () => (config: unknown) => config,
}));

vi.mock("src/server/api-key-auth", () => ({
	default: (request: Request) => schemaMocks.requireApiKey(request),
}));

vi.mock("src/server/synced-indexers/schema-templates", () => ({
	default: () => schemaMocks.getSchemaTemplates(),
}));

import { Route as SchemaRoute } from "./schema";

type SchemaHandlers = {
	server: {
		handlers: {
			GET: (input: { request: Request }) => Promise<Response>;
		};
	};
};

describe("GET /api/v1/indexer/schema", () => {
	beforeEach(() => {
		vi.resetAllMocks();
	});

	it("requires an API key", async () => {
		schemaMocks.getSchemaTemplates.mockReturnValue([]);

		const handler = (SchemaRoute as unknown as SchemaHandlers).server.handlers
			.GET;

		await handler({
			request: new Request("https://example.com/api/v1/indexer/schema"),
		});

		expect(schemaMocks.requireApiKey).toHaveBeenCalledWith(expect.any(Request));
	});

	it("rejects requests without a valid API key", async () => {
		schemaMocks.requireApiKey.mockRejectedValue(
			new Response(JSON.stringify({ message: "Unauthorized" }), {
				status: 401,
			}),
		);

		const handler = (SchemaRoute as unknown as SchemaHandlers).server.handlers
			.GET;

		await expect(
			handler({
				request: new Request("https://example.com/api/v1/indexer/schema"),
			}),
		).rejects.toBeDefined();

		expect(schemaMocks.getSchemaTemplates).not.toHaveBeenCalled();
	});

	it("returns schema templates as JSON", async () => {
		const templates = [
			{
				id: 0,
				name: "",
				implementation: "Newznab",
				implementationName: "Newznab",
				configContract: "NewznabSettings",
				protocol: "usenet",
			},
			{
				id: 0,
				name: "",
				implementation: "Torznab",
				implementationName: "Torznab",
				configContract: "TorznabSettings",
				protocol: "torrent",
			},
		];
		schemaMocks.getSchemaTemplates.mockReturnValue(templates);

		const handler = (SchemaRoute as unknown as SchemaHandlers).server.handlers
			.GET;

		const response = await handler({
			request: new Request("https://example.com/api/v1/indexer/schema"),
		});

		expect(schemaMocks.getSchemaTemplates).toHaveBeenCalledOnce();
		await expect(response.json()).resolves.toEqual(templates);
	});

	it("returns an empty array when no templates exist", async () => {
		schemaMocks.getSchemaTemplates.mockReturnValue([]);

		const handler = (SchemaRoute as unknown as SchemaHandlers).server.handlers
			.GET;

		const response = await handler({
			request: new Request("https://example.com/api/v1/indexer/schema"),
		});

		await expect(response.json()).resolves.toEqual([]);
	});
});
