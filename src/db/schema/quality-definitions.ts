import { sql } from "drizzle-orm";
import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";

export type QualitySpecification = {
  type: "releaseTitle" | "releaseGroup" | "size" | "indexerFlag";
  value: string;
  min?: number;
  max?: number;
  negate: boolean;
  required: boolean;
};

export const qualityDefinitions = sqliteTable("quality_definitions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  title: text("title").notNull(),
  weight: integer("weight").notNull().default(1),
  minSize: real("min_size").default(0),
  maxSize: real("max_size").default(0),
  preferredSize: real("preferred_size").default(0),
  color: text("color").notNull().default("gray"),
  specifications: text("specifications", { mode: "json" })
    .$type<QualitySpecification[]>()
    .notNull()
    .default(sql`'[]'`),
});
