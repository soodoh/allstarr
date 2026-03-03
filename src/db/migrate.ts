// oxlint-disable no-console -- Migration script intentionally uses console for output
import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";

const sqlite = new Database(process.env.DATABASE_URL || "data/sqlite.db");
const db = drizzle({ client: sqlite });

migrate(db, { migrationsFolder: "./drizzle" });
console.log("Migrations applied successfully");

sqlite.close();
