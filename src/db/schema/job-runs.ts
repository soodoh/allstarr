import { sql } from "drizzle-orm";
import {
	integer,
	sqliteTable,
	text,
	uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const jobRuns = sqliteTable(
	"job_runs",
	{
		id: integer("id").primaryKey({ autoIncrement: true }),
		sourceType: text("source_type").notNull(),
		jobType: text("job_type").notNull(),
		displayName: text("display_name").notNull(),
		dedupeKey: text("dedupe_key"),
		dedupeValue: text("dedupe_value"),
		status: text("status").notNull().default("queued"),
		progress: text("progress"),
		attempt: integer("attempt").notNull().default(1),
		result: text("result", { mode: "json" }).$type<Record<
			string,
			unknown
		> | null>(),
		error: text("error"),
		metadata: text("metadata", { mode: "json" }).$type<Record<
			string,
			unknown
		> | null>(),
		startedAt: integer("started_at", { mode: "timestamp" }),
		lastHeartbeatAt: integer("last_heartbeat_at", { mode: "timestamp" }),
		finishedAt: integer("finished_at", { mode: "timestamp" }),
		createdAt: integer("created_at", { mode: "timestamp" })
			.notNull()
			.$defaultFn(() => new Date()),
		updatedAt: integer("updated_at", { mode: "timestamp" })
			.notNull()
			.$defaultFn(() => new Date()),
	},
	(table) => [
		uniqueIndex("job_runs_active_dedupe_unique_idx")
			.on(table.sourceType, table.jobType, table.dedupeKey, table.dedupeValue)
			.where(sql`${table.status} IN ('queued', 'running')`),
	],
);
