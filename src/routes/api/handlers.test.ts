import { describe, expect, it, vi } from "vitest";

const apiRouteMocks = vi.hoisted(() => ({
	addClient: vi.fn(),
	authHandler: vi.fn(),
	getAuth: vi.fn(),
	getSessionFromRequest: vi.fn(),
	getSystemAbout: vi.fn(),
	removeClient: vi.fn(),
	requireApiKey: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
	createFileRoute: () => (config: unknown) => config,
}));

vi.mock("src/lib/auth", () => ({
	getAuth: (...args: unknown[]) => apiRouteMocks.getAuth(...args),
}));

vi.mock("src/server/api-key-auth", () => ({
	default: (...args: unknown[]) => apiRouteMocks.requireApiKey(...args),
}));

vi.mock("src/server/event-bus", () => ({
	eventBus: {
		addClient: (...args: unknown[]) => apiRouteMocks.addClient(...args),
		removeClient: (...args: unknown[]) => apiRouteMocks.removeClient(...args),
	},
}));

vi.mock("src/server/middleware", () => ({
	getSessionFromRequest: (...args: unknown[]) =>
		apiRouteMocks.getSessionFromRequest(...args),
}));

vi.mock("src/server/system-info", () => ({
	getSystemAbout: (...args: unknown[]) => apiRouteMocks.getSystemAbout(...args),
}));

import { Route as AuthRoute } from "./auth/$";
import { Route as EventsRoute } from "./events";
import { Route as IndexerTestRoute } from "./v1/indexer/test";
import { Route as SystemStatusRoute } from "./v1/system/status";

describe("api route handlers", () => {
	it("forwards auth GET and POST requests to the auth handler", async () => {
		const response = new Response("ok");
		apiRouteMocks.getAuth.mockResolvedValue({
			handler: apiRouteMocks.authHandler,
		});
		apiRouteMocks.authHandler.mockResolvedValue(response);

		const handlers = (
			AuthRoute as unknown as {
				server: {
					handlers: {
						GET: (input: { request: Request }) => Promise<Response>;
						POST: (input: { request: Request }) => Promise<Response>;
					};
				};
			}
		).server.handlers;
		const request = new Request("https://example.com/api/auth/session");

		await expect(handlers.GET({ request })).resolves.toBe(response);
		await expect(handlers.POST({ request })).resolves.toBe(response);
		expect(apiRouteMocks.getAuth).toHaveBeenCalledTimes(2);
		expect(apiRouteMocks.authHandler).toHaveBeenNthCalledWith(1, request);
		expect(apiRouteMocks.authHandler).toHaveBeenNthCalledWith(2, request);
	});

	it("rejects unauthenticated event-stream requests", async () => {
		apiRouteMocks.getSessionFromRequest.mockResolvedValue(null);

		const handler = (
			EventsRoute as unknown as {
				server: {
					handlers: {
						GET: (input: { request: Request }) => Promise<Response>;
					};
				};
			}
		).server.handlers.GET;

		const response = await handler({
			request: new Request("https://example.com/api/events"),
		});

		await expect(response.text()).resolves.toBe("Unauthorized");
		expect(response.status).toBe(401);
	});

	it("opens an event stream for authenticated sessions and unregisters on cancel", async () => {
		apiRouteMocks.getSessionFromRequest.mockResolvedValue({
			user: { id: "1" },
		});

		const handler = (
			EventsRoute as unknown as {
				server: {
					handlers: {
						GET: (input: { request: Request }) => Promise<Response>;
					};
				};
			}
		).server.handlers.GET;

		const response = await handler({
			request: new Request("https://example.com/api/events"),
		});

		expect(response.headers.get("Content-Type")).toBe("text/event-stream");
		expect(response.headers.get("Cache-Control")).toBe("no-cache");
		expect(response.headers.get("Connection")).toBe("keep-alive");
		expect(apiRouteMocks.addClient).toHaveBeenCalledTimes(1);

		const reader = response.body?.getReader();
		if (!reader) {
			throw new Error("expected readable stream");
		}

		const chunk = await reader.read();
		expect(new TextDecoder().decode(chunk.value)).toBe(": connected\n\n");

		await reader.cancel();
		expect(apiRouteMocks.removeClient).toHaveBeenCalledTimes(1);
	});

	it("requires an API key and returns the stub indexer test response", async () => {
		const handler = (
			IndexerTestRoute as unknown as {
				server: {
					handlers: {
						POST: (input: { request: Request }) => Promise<Response>;
					};
				};
			}
		).server.handlers.POST;

		const response = await handler({
			request: new Request("https://example.com/api/v1/indexer/test", {
				method: "POST",
			}),
		});

		expect(apiRouteMocks.requireApiKey).toHaveBeenCalledWith(
			expect.any(Request),
		);
		await expect(response.json()).resolves.toEqual([]);
	});

	it("returns the transformed system status payload", async () => {
		apiRouteMocks.getSystemAbout.mockResolvedValue({
			databasePath: "/var/lib/allstarr/db.sqlite",
			isDocker: true,
			osInfo: "Linux 6.8.0",
			runtimeVersion: "1.2.3",
			sqliteVersion: "3.45.0",
			startTime: "2026-04-08T00:00:00.000Z",
			version: "0.1.0",
		});

		const handler = (
			SystemStatusRoute as unknown as {
				server: {
					handlers: {
						GET: (input: { request: Request }) => Promise<Response>;
					};
				};
			}
		).server.handlers.GET;

		const response = await handler({
			request: new Request("https://example.com/api/v1/system/status"),
		});
		const body = (await response.json()) as Record<string, unknown>;

		expect(apiRouteMocks.requireApiKey).toHaveBeenCalledWith(
			expect.any(Request),
		);
		expect(body).toMatchObject({
			appData: "/var/lib/allstarr/db.sqlite",
			appName: "Allstarr",
			authentication: "apiKey",
			branch: "main",
			buildTime: "2026-04-08T00:00:00.000Z",
			instanceName: "Allstarr",
			isAdmin: true,
			isDebug: true,
			isDocker: true,
			isLinux: true,
			isMono: false,
			isNetCore: true,
			isOsx: false,
			isProduction: false,
			isUserLoggedIn: true,
			isWindows: false,
			migrationVersion: 1,
			mode: "console",
			osName: "Linux",
			osVersion: "6.8.0",
			packageAuthor: "",
			packageUpdateMechanism: "builtIn",
			packageVersion: "0.1.0",
			runtimeName: "Bun",
			runtimeVersion: "1.2.3",
			sqliteVersion: "3.45.0",
			startupPath: process.cwd(),
			urlBase: process.env.BETTER_AUTH_URL || "",
			version: "0.1.0",
		});
	});
});
