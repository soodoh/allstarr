import { createServerFn } from "@tanstack/react-start";
import { eq } from "drizzle-orm";
import { db } from "src/db";
import { downloadClients } from "src/db/schema";
import type { DownloadClientSettings } from "src/db/schema/download-clients";
import {
	createDownloadClientSchema,
	testDownloadClientSchema,
	updateDownloadClientSchema,
} from "src/lib/validators";
import getProvider from "./download-clients/registry";
import type { ConnectionConfig } from "./download-clients/types";
import { requireAdmin } from "./middleware";

export const getDownloadClientsFn = createServerFn({ method: "GET" }).handler(
	async () => {
		await requireAdmin();
		return db.select().from(downloadClients).all();
	},
);

export const createDownloadClientFn = createServerFn({ method: "POST" })
	.inputValidator((d: unknown) => createDownloadClientSchema.parse(d))
	.handler(async ({ data }) => {
		await requireAdmin();
		return db
			.insert(downloadClients)
			.values({
				...data,
				settings: data.settings as DownloadClientSettings | null,
				createdAt: Date.now(),
				updatedAt: Date.now(),
			})
			.returning()
			.get();
	});

export const updateDownloadClientFn = createServerFn({ method: "POST" })
	.inputValidator((d: unknown) => updateDownloadClientSchema.parse(d))
	.handler(async ({ data }) => {
		await requireAdmin();
		const { id, ...values } = data;
		return db
			.update(downloadClients)
			.set({
				...values,
				settings: values.settings as DownloadClientSettings | null,
				updatedAt: Date.now(),
			})
			.where(eq(downloadClients.id, id))
			.returning()
			.get();
	});

export const deleteDownloadClientFn = createServerFn({ method: "POST" })
	.inputValidator((d: { id: number }) => d)
	.handler(async ({ data }) => {
		await requireAdmin();
		db.delete(downloadClients).where(eq(downloadClients.id, data.id)).run();
		return { success: true };
	});

export const testDownloadClientFn = createServerFn({ method: "POST" })
	.inputValidator((d: unknown) => testDownloadClientSchema.parse(d))
	.handler(async ({ data }) => {
		await requireAdmin();
		const provider = await getProvider(data.implementation);
		const config: ConnectionConfig = {
			implementation: data.implementation,
			host: data.host,
			port: data.port,
			useSsl: data.useSsl,
			urlBase: data.urlBase,
			username: data.username,
			password: data.password,
			apiKey: data.apiKey,
			category: null,
			tag: null,
			settings: null,
		};
		return provider.testConnection(config);
	});
