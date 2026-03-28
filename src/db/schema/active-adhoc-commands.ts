import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const activeAdhocCommands = sqliteTable("active_adhoc_commands", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  commandType: text("command_type").notNull(),
  name: text("name").notNull(),
  body: text("body", { mode: "json" })
    .$type<Record<string, unknown>>()
    .notNull(),
  progress: text("progress"),
  startedAt: text("started_at").notNull(),
  createdAt: text("created_at").notNull().default("CURRENT_TIMESTAMP"),
});
