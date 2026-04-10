import { join } from "node:path";
import PORTS from "../ports";

type SpawnConfigInput = {
	workerIndex: number;
	dbPath: string;
	servers: Record<string, string>;
};

export type AppServerSpawnConfig = {
	command: string;
	args: string[];
	cwd: string;
	url: string;
	env: NodeJS.ProcessEnv;
};

export function createAppServerSpawnConfig({
	workerIndex,
	dbPath,
	servers,
}: SpawnConfigInput): AppServerSpawnConfig {
	const port = PORTS.APP_BASE + workerIndex;
	const url = `http://localhost:${port}`;

	return {
		command: "bun",
		args: [".output/server/index.mjs"],
		cwd: join(import.meta.dirname, "..", ".."),
		url,
		env: {
			...process.env,
			DATABASE_URL: dbPath,
			HARDCOVER_GRAPHQL_URL: `${servers.HARDCOVER}/v1/graphql`,
			BETTER_AUTH_SECRET: "test-secret-for-e2e",
			BETTER_AUTH_URL: url,
			HARDCOVER_TOKEN: "Bearer test-hardcover-token",
			SQLITE_JOURNAL_MODE: "DELETE",
			E2E_TEST_MODE: "true",
			PORT: String(port),
			INSTRUMENT_COVERAGE: process.env.INSTRUMENT_COVERAGE || "",
		},
	};
}
