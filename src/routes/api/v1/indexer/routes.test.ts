import { beforeEach, describe, expect, it, vi } from "vitest";

const syncApiMocks = vi.hoisted(() => {
	const all = vi.fn();
	const get = vi.fn();
	const returningInsert = vi.fn();
	const returningUpdate = vi.fn();
	const runDelete = vi.fn();

	return {
		all,
		db: {
			delete: vi.fn(() => ({
				where: vi.fn(() => ({
					run: runDelete,
				})),
			})),
			insert: vi.fn(() => ({
				values: vi.fn(() => ({
					returning: returningInsert,
				})),
			})),
			select: vi.fn(() => ({
				from: vi.fn(() => ({
					all,
					get,
					where: vi.fn(() => ({
						get,
					})),
				})),
			})),
			update: vi.fn(() => ({
				set: vi.fn(() => ({
					where: vi.fn(() => ({
						returning: returningUpdate,
					})),
				})),
			})),
		},
		eq: vi.fn((left: unknown, right: unknown) => ({ left, right })),
		fromReadarrResource: vi.fn(),
		get,
		requireApiKey: vi.fn(),
		returningInsert,
		returningUpdate,
		runDelete,
		summarizeIndexerResource: vi.fn((_body: unknown) => ({ summary: true })),
		toReadarrResource: vi.fn(),
	};
});

vi.mock("@tanstack/react-router", () => ({
	createFileRoute: () => (config: unknown) => config,
}));

vi.mock("drizzle-orm", () => ({
	eq: syncApiMocks.eq,
}));

vi.mock("src/db", () => ({
	db: syncApiMocks.db,
}));

vi.mock("src/db/schema", () => ({
	syncedIndexers: { id: "syncedIndexers.id" },
}));

vi.mock("src/server/api-key-auth", () => ({
	default: (request: Request) => syncApiMocks.requireApiKey(request),
}));

vi.mock("src/server/synced-indexers/logging", () => ({
	summarizeIndexerResource: (body: unknown) =>
		syncApiMocks.summarizeIndexerResource(body),
}));

vi.mock("src/server/synced-indexers/mapper", () => ({
	fromReadarrResource: (body: unknown) =>
		syncApiMocks.fromReadarrResource(body),
	toReadarrResource: (row: unknown) => syncApiMocks.toReadarrResource(row),
}));

import { Route as IndexerIdRoute } from "./$id";
import { Route as IndexerListRoute } from "./index";

describe("synced indexer api routes", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		syncApiMocks.toReadarrResource.mockImplementation((row) => ({
			id: row.id,
			name: row.name,
		}));
		syncApiMocks.fromReadarrResource.mockImplementation((body) => ({
			implementation: body.implementation,
			name: body.name,
			protocol: body.protocol,
		}));
	});

	it("lists synced indexers", async () => {
		syncApiMocks.all.mockResolvedValue([
			{ id: 1, implementation: "Torznab", name: "One" },
			{ id: 2, implementation: "Newznab", name: "Two" },
		]);

		const handler = (
			IndexerListRoute as unknown as {
				server: {
					handlers: {
						GET: (input: { request: Request }) => Promise<Response>;
					};
				};
			}
		).server.handlers.GET;

		const response = await handler({
			request: new Request("https://example.com/api/v1/indexer"),
		});

		expect(syncApiMocks.requireApiKey).toHaveBeenCalledWith(
			expect.any(Request),
		);
		await expect(response.json()).resolves.toEqual([
			{ id: 1, name: "One" },
			{ id: 2, name: "Two" },
		]);
		expect(syncApiMocks.toReadarrResource).toHaveBeenCalledTimes(2);
	});

	it("creates a synced indexer", async () => {
		const body = {
			configContract: "TorznabSettings",
			enableAutomaticSearch: true,
			enableInteractiveSearch: true,
			enableRss: true,
			fields: [{ name: "baseUrl", value: "https://example.com" }],
			implementation: "Torznab",
			name: "Created Indexer",
			priority: 25,
			protocol: "torrent",
		};
		syncApiMocks.returningInsert.mockResolvedValue([
			{ id: 7, implementation: "Torznab", name: "Created Indexer" },
		]);

		const handler = (
			IndexerListRoute as unknown as {
				server: {
					handlers: {
						POST: (input: { request: Request }) => Promise<Response>;
					};
				};
			}
		).server.handlers.POST;

		const response = await handler({
			request: new Request("https://example.com/api/v1/indexer", {
				body: JSON.stringify(body),
				headers: { "content-type": "application/json" },
				method: "POST",
			}),
		});

		expect(syncApiMocks.summarizeIndexerResource).toHaveBeenCalledWith(body);
		expect(syncApiMocks.fromReadarrResource).toHaveBeenCalledWith(body);
		expect(syncApiMocks.db.insert).toHaveBeenCalled();
		expect(response.status).toBe(201);
		await expect(response.json()).resolves.toEqual({
			id: 7,
			name: "Created Indexer",
		});
	});

	it("rejects malformed JSON when creating a synced indexer", async () => {
		const handler = (
			IndexerListRoute as unknown as {
				server: {
					handlers: {
						POST: (input: { request: Request }) => Promise<Response>;
					};
				};
			}
		).server.handlers.POST;

		const response = await handler({
			request: new Request("https://example.com/api/v1/indexer", {
				body: "{",
				headers: { "content-type": "application/json" },
				method: "POST",
			}),
		});

		expect(response.status).toBe(400);
		const json = await response.json();
		expect(json).toMatchObject({
			message: "Invalid indexer payload",
		});
		expect(json.errors).toEqual([expect.any(String)]);
		expect(syncApiMocks.fromReadarrResource).not.toHaveBeenCalled();
		expect(syncApiMocks.db.insert).not.toHaveBeenCalled();
	});

	it("rejects invalid synced indexer create payloads before persistence", async () => {
		const handler = (
			IndexerListRoute as unknown as {
				server: {
					handlers: {
						POST: (input: { request: Request }) => Promise<Response>;
					};
				};
			}
		).server.handlers.POST;

		const response = await handler({
			request: new Request("https://example.com/api/v1/indexer", {
				body: JSON.stringify({
					implementation: "Bogus",
					name: "",
					protocol: "invalid",
					fields: "not-fields",
				}),
				headers: { "content-type": "application/json" },
				method: "POST",
			}),
		});

		expect(response.status).toBe(400);
		const json = await response.json();
		expect(json).toMatchObject({
			message: "Invalid indexer payload",
		});
		expect(json.errors).toEqual(expect.arrayContaining([expect.any(String)]));
		expect(syncApiMocks.fromReadarrResource).not.toHaveBeenCalled();
		expect(syncApiMocks.db.insert).not.toHaveBeenCalled();
	});

	it("handles get-by-id validation and not-found branches", async () => {
		const handler = (
			IndexerIdRoute as unknown as {
				server: {
					handlers: {
						GET: (input: {
							params: { id: string };
							request: Request;
						}) => Promise<Response>;
					};
				};
			}
		).server.handlers.GET;

		const invalidResponse = await handler({
			params: { id: "abc" },
			request: new Request("https://example.com/api/v1/indexer/abc"),
		});
		expect(invalidResponse.status).toBe(400);
		await expect(invalidResponse.json()).resolves.toEqual({
			message: "Invalid ID",
		});

		syncApiMocks.get.mockResolvedValue(undefined);
		const missingResponse = await handler({
			params: { id: "9" },
			request: new Request("https://example.com/api/v1/indexer/9"),
		});
		expect(missingResponse.status).toBe(404);
		await expect(missingResponse.json()).resolves.toEqual({
			message: "Not Found",
		});
	});

	it("gets, updates, and deletes a synced indexer", async () => {
		const existingRow = {
			id: 4,
			implementation: "Newznab",
			name: "Existing",
			protocol: "usenet",
		};
		syncApiMocks.get.mockResolvedValue(existingRow);
		syncApiMocks.returningUpdate.mockResolvedValue([
			{ ...existingRow, name: "Updated" },
		]);

		const handlers = (
			IndexerIdRoute as unknown as {
				server: {
					handlers: {
						DELETE: (input: {
							params: { id: string };
							request: Request;
						}) => Promise<Response>;
						GET: (input: {
							params: { id: string };
							request: Request;
						}) => Promise<Response>;
						PUT: (input: {
							params: { id: string };
							request: Request;
						}) => Promise<Response>;
					};
				};
			}
		).server.handlers;

		const getResponse = await handlers.GET({
			params: { id: "4" },
			request: new Request("https://example.com/api/v1/indexer/4"),
		});
		await expect(getResponse.json()).resolves.toEqual({
			id: 4,
			name: "Existing",
		});

		const putBody = {
			configContract: "NewznabSettings",
			enableAutomaticSearch: true,
			enableInteractiveSearch: true,
			enableRss: true,
			fields: [{ name: "baseUrl", value: "https://example.com" }],
			implementation: "Newznab",
			name: "Updated",
			priority: 25,
			protocol: "usenet",
		};
		const putResponse = await handlers.PUT({
			params: { id: "4" },
			request: new Request("https://example.com/api/v1/indexer/4", {
				body: JSON.stringify(putBody),
				headers: { "content-type": "application/json" },
				method: "PUT",
			}),
		});
		expect(syncApiMocks.summarizeIndexerResource).toHaveBeenCalledWith(putBody);
		expect(syncApiMocks.fromReadarrResource).toHaveBeenCalledWith(putBody);
		await expect(putResponse.json()).resolves.toEqual({
			id: 4,
			name: "Updated",
		});

		const deleteResponse = await handlers.DELETE({
			params: { id: "4" },
			request: new Request("https://example.com/api/v1/indexer/4", {
				method: "DELETE",
			}),
		});
		expect(syncApiMocks.runDelete).toHaveBeenCalledTimes(1);
		expect(deleteResponse.status).toBe(200);
	});

	it("rejects invalid synced indexer update payloads before persistence", async () => {
		syncApiMocks.get.mockResolvedValue({
			id: 4,
			implementation: "Newznab",
			name: "Existing",
			protocol: "usenet",
		});

		const handler = (
			IndexerIdRoute as unknown as {
				server: {
					handlers: {
						PUT: (input: {
							params: { id: string };
							request: Request;
						}) => Promise<Response>;
					};
				};
			}
		).server.handlers.PUT;

		const response = await handler({
			params: { id: "4" },
			request: new Request("https://example.com/api/v1/indexer/4", {
				body: JSON.stringify({
					configContract: "NewznabSettings",
					enableAutomaticSearch: true,
					enableInteractiveSearch: true,
					enableRss: true,
					fields: [{ name: "baseUrl", value: "https://example.com" }],
					implementation: "Newznab",
					name: 123,
					priority: 25,
					protocol: "usenet",
				}),
				headers: { "content-type": "application/json" },
				method: "PUT",
			}),
		});

		expect(response.status).toBe(400);
		const json = await response.json();
		expect(json).toMatchObject({
			message: "Invalid indexer payload",
		});
		expect(json.errors).toEqual(expect.arrayContaining([expect.any(String)]));
		expect(syncApiMocks.fromReadarrResource).not.toHaveBeenCalled();
		expect(syncApiMocks.db.update).not.toHaveBeenCalled();
	});

	it("returns 400 when validated payload cannot be mapped", async () => {
		syncApiMocks.fromReadarrResource.mockImplementation(() => {
			throw new Error("baseUrl is required");
		});

		const handler = (
			IndexerListRoute as unknown as {
				server: {
					handlers: {
						POST: (input: { request: Request }) => Promise<Response>;
					};
				};
			}
		).server.handlers.POST;

		const response = await handler({
			request: new Request("https://example.com/api/v1/indexer", {
				body: JSON.stringify({
					configContract: "NewznabSettings",
					enableAutomaticSearch: true,
					enableInteractiveSearch: true,
					enableRss: true,
					fields: [{ name: "baseUrl", value: "https://example.com" }],
					implementation: "Newznab",
					name: "Broken Indexer",
					priority: 25,
					protocol: "usenet",
				}),
				headers: { "content-type": "application/json" },
				method: "POST",
			}),
		});

		expect(response.status).toBe(400);
		await expect(response.json()).resolves.toEqual({
			message: "Invalid indexer payload",
			errors: ["baseUrl is required"],
		});
		expect(syncApiMocks.fromReadarrResource).toHaveBeenCalledOnce();
		expect(syncApiMocks.db.insert).not.toHaveBeenCalled();
	});
});
