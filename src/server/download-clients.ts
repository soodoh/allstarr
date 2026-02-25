import { createServerFn } from "@tanstack/react-start";
import { db } from "src/db";
import { downloadClients } from "src/db/schema";
import { eq } from "drizzle-orm";
import { requireAuth } from "./middleware";
import {
  createDownloadClientSchema,
  updateDownloadClientSchema,
  testDownloadClientSchema,
} from "src/lib/validators";
import getProvider from "./download-clients/registry";
import type { ConnectionConfig } from "./download-clients/types";

export const getDownloadClientsFn = createServerFn({ method: "GET" }).handler(
  async () => {
    await requireAuth();
    return db.select().from(downloadClients).all();
  },
);

export const getDownloadClientFn = createServerFn({ method: "GET" })
  .inputValidator((d: { id: number }) => d)
  .handler(async ({ data }) => {
    await requireAuth();
    const result = db
      .select()
      .from(downloadClients)
      .where(eq(downloadClients.id, data.id))
      .get();
    if (!result) {
      throw new Error("Download client not found");
    }
    return result;
  });

export const createDownloadClientFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => createDownloadClientSchema.parse(d))
  .handler(async ({ data }) => {
    await requireAuth();
    return db
      .insert(downloadClients)
      .values({
        ...data,
        settings: data.settings as Record<string, unknown> | undefined,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
      .returning()
      .get();
  });

export const updateDownloadClientFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => updateDownloadClientSchema.parse(d))
  .handler(async ({ data }) => {
    await requireAuth();
    const { id, ...values } = data;
    return db
      .update(downloadClients)
      .set({
        ...values,
        settings: values.settings as Record<string, unknown> | undefined,
        updatedAt: Date.now(),
      })
      .where(eq(downloadClients.id, id))
      .returning()
      .get();
  });

export const deleteDownloadClientFn = createServerFn({ method: "POST" })
  .inputValidator((d: { id: number }) => d)
  .handler(async ({ data }) => {
    await requireAuth();
    db.delete(downloadClients).where(eq(downloadClients.id, data.id)).run();
    return { success: true };
  });

export const testDownloadClientFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => testDownloadClientSchema.parse(d))
  .handler(async ({ data }) => {
    await requireAuth();
    const provider = getProvider(data.implementation);
    const config: ConnectionConfig = {
      implementation: data.implementation,
      host: data.host,
      port: data.port,
      useSsl: data.useSsl,
      urlBase: data.urlBase,
      username: data.username,
      password: data.password,
      apiKey: data.apiKey,
    };
    return provider.testConnection(config);
  });
