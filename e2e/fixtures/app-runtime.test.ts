import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createAppServerSpawnConfig } from "./app-runtime";

describe("createAppServerSpawnConfig", () => {
	it("builds a production app server spawn config for a worker", () => {
		const config = createAppServerSpawnConfig({
			workerIndex: 2,
			dbPath: "/tmp/allstarr-worker-2.db",
			servers: {
				HARDCOVER: "http://localhost:19009",
				TMDB: "http://localhost:19010",
			},
		});

		expect(config.command).toBe("bun");
		expect(config.args).toEqual([".output/server/index.mjs"]);
		expect(config.url).toBe("http://localhost:19102");
		expect(config.cwd).toBe(join(import.meta.dirname, "..", ".."));
		expect(config.env.DATABASE_URL).toBe("/tmp/allstarr-worker-2.db");
		expect(config.env.HARDCOVER_GRAPHQL_URL).toBe(
			"http://localhost:19009/v1/graphql",
		);
		expect(config.env.TMDB_API_BASE_URL).toBe("http://localhost:19010/3");
		expect(config.env.TMDB_TOKEN).toBe("test-tmdb-token");
		expect(config.env.BETTER_AUTH_URL).toBe("http://localhost:19102");
		expect(config.env.PORT).toBe("19102");
		expect(config.env.E2E_TEST_MODE).toBe("true");
	});
});
