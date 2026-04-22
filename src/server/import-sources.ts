import { createServerFn } from "@tanstack/react-start";
import { eq } from "drizzle-orm";
import { db } from "src/db";
import { importSources } from "src/db/schema";
import {
	createImportSourceSchema,
	deleteImportSourceSchema,
	updateImportSourceSchema,
} from "src/lib/validators";
import { requireAdmin } from "./middleware";

export const getImportSourcesFn = createServerFn({ method: "GET" }).handler(
	async () => {
		await requireAdmin();
		return db.select().from(importSources).orderBy(importSources.label).all();
	},
);

export const createImportSourceFn = createServerFn({ method: "POST" })
	.inputValidator((data: unknown) => createImportSourceSchema.parse(data))
	.handler(async ({ data }) => {
		await requireAdmin();
		return db
			.insert(importSources)
			.values({
				...data,
				lastSyncStatus: "idle",
				createdAt: new Date(),
				updatedAt: new Date(),
			})
			.returning()
			.get();
	});

export const updateImportSourceFn = createServerFn({ method: "POST" })
	.inputValidator((data: unknown) => updateImportSourceSchema.parse(data))
	.handler(async ({ data }) => {
		await requireAdmin();
		const { id, ...values } = data;
		return db
			.update(importSources)
			.set({
				...values,
				updatedAt: new Date(),
			})
			.where(eq(importSources.id, id))
			.returning()
			.get();
	});

export const deleteImportSourceFn = createServerFn({ method: "POST" })
	.inputValidator((data: unknown) => deleteImportSourceSchema.parse(data))
	.handler(async ({ data }) => {
		await requireAdmin();
		db.delete(importSources).where(eq(importSources.id, data.id)).run();
		return { success: true };
	});
