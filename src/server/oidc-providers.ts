import { createServerFn } from "@tanstack/react-start";
import { eq } from "drizzle-orm";
import { db } from "src/db";
import { oidcProviders } from "src/db/schema";
import {
	createOidcProviderSchema,
	deleteOidcProviderSchema,
	updateOidcProviderSchema,
} from "src/lib/validators";
import { requireAdmin, requireAuth } from "./middleware";

export const listOidcProvidersFn = createServerFn({
	method: "GET",
}).handler(async () => {
	await requireAuth();
	return db.select().from(oidcProviders).all();
});

export const createOidcProviderFn = createServerFn({ method: "POST" })
	.inputValidator((d: unknown) => createOidcProviderSchema.parse(d))
	.handler(async ({ data }) => {
		await requireAdmin();

		const existing = db
			.select()
			.from(oidcProviders)
			.where(eq(oidcProviders.providerId, data.providerId))
			.get();

		if (existing) {
			throw new Error(`Provider with ID "${data.providerId}" already exists`);
		}

		const provider = db.insert(oidcProviders).values(data).returning().get();

		return provider;
	});

export const updateOidcProviderFn = createServerFn({ method: "POST" })
	.inputValidator((d: unknown) => updateOidcProviderSchema.parse(d))
	.handler(async ({ data }) => {
		await requireAdmin();
		const { id, ...updates } = data;

		db.update(oidcProviders).set(updates).where(eq(oidcProviders.id, id)).run();

		return { success: true };
	});

export const deleteOidcProviderFn = createServerFn({ method: "POST" })
	.inputValidator((d: unknown) => deleteOidcProviderSchema.parse(d))
	.handler(async ({ data }) => {
		await requireAdmin();

		db.delete(oidcProviders).where(eq(oidcProviders.id, data.id)).run();

		return { success: true };
	});
