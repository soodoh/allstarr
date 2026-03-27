import {
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { user } from "./auth";

export const userSettings = sqliteTable(
  "user_settings",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    tableId: text("table_id").notNull(),
    columnOrder: text("column_order", { mode: "json" })
      .$type<string[]>()
      .notNull(),
    hiddenColumns: text("hidden_columns", { mode: "json" })
      .$type<string[]>()
      .notNull(),
    viewMode: text("view_mode").$type<"table" | "grid">(),
  },
  (table) => [
    uniqueIndex("user_settings_user_table_idx").on(table.userId, table.tableId),
  ],
);
