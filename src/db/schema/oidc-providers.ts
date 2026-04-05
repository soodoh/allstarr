import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const oidcProviders = sqliteTable("oidc_providers", {
	id: text("id")
		.primaryKey()
		.$defaultFn(() => crypto.randomUUID()),
	providerId: text("provider_id").notNull().unique(),
	displayName: text("display_name").notNull(),
	clientId: text("client_id").notNull(),
	clientSecret: text("client_secret").notNull(),
	discoveryUrl: text("discovery_url").notNull(),
	scopes: text("scopes", { mode: "json" })
		.$type<string[]>()
		.notNull()
		.default(["openid", "profile", "email"]),
	trusted: integer("trusted", { mode: "boolean" }).notNull().default(false),
	enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
	createdAt: integer("created_at", { mode: "timestamp" })
		.notNull()
		.$defaultFn(() => new Date()),
});
