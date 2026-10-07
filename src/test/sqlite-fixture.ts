import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import * as schema from "src/db/schema";

export function createSqliteFixture() {
	const sqlite = new Database(":memory:");
	const db = drizzle({ client: sqlite, schema });
	try {
		migrate(db, {
			migrationsFolder: fileURLToPath(
				new URL("../../drizzle", import.meta.url),
			),
		});
	} catch (error) {
		sqlite.close();
		throw error;
	}
	return { db, sqlite, close: () => sqlite.close() };
}
