import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const scheduledTasks = sqliteTable("scheduled_tasks", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  interval: integer("interval").notNull(), // seconds between runs
  lastExecution: integer("last_execution", { mode: "timestamp" }),
  lastDuration: integer("last_duration"), // ms
  lastResult: text("last_result"), // "success" | "error"
  lastMessage: text("last_message"),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  progress: text("progress"),
  group: text("group").notNull().default("maintenance"),
});
