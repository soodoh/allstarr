import { createServerFn } from "@tanstack/react-start";
import { db } from "src/db";
import { blocklist, downloadClients } from "src/db/schema";
import { eq } from "drizzle-orm";
import { requireAuth } from "./middleware";
import getProvider from "./download-clients/registry";
import type { ConnectionConfig, DownloadItem } from "./download-clients/types";
import { removeFromQueueSchema } from "src/lib/validators";

export type QueueItem = DownloadItem & {
  downloadClientId: number;
  downloadClientName: string;
  protocol: string;
  progress: number;
  estimatedTimeLeft: number | null;
};

type DownloadClientRow = typeof downloadClients.$inferSelect;

function toConnectionConfig(client: DownloadClientRow): ConnectionConfig {
  return {
    implementation: client.implementation as ConnectionConfig["implementation"],
    host: client.host,
    port: client.port,
    useSsl: client.useSsl,
    urlBase: client.urlBase,
    username: client.username,
    password: client.password,
    apiKey: client.apiKey,
    category: client.category,
    settings: client.settings as Record<string, unknown> | null,
  };
}

export async function fetchQueueItems(): Promise<{
  items: QueueItem[];
  warnings: string[];
}> {
  const enabledClients = db
    .select()
    .from(downloadClients)
    .where(eq(downloadClients.enabled, true))
    .all();

  if (enabledClients.length === 0) {
    return { items: [], warnings: [] };
  }

  const results = await Promise.allSettled(
    enabledClients.map(async (client) => {
      const provider = getProvider(client.implementation);
      const config = toConnectionConfig(client);

      const downloads = await provider.getDownloads(config);
      return downloads.map(
        (dl): QueueItem =>
          Object.assign(dl as QueueItem, {
            downloadClientId: client.id,
            downloadClientName: client.name,
            protocol: client.protocol,
            progress:
              dl.size > 0 ? Math.round((dl.downloaded / dl.size) * 100) : 0,
            estimatedTimeLeft:
              dl.downloadSpeed > 0
                ? Math.round((dl.size - dl.downloaded) / dl.downloadSpeed)
                : null,
          }),
      );
    }),
  );

  const items: QueueItem[] = [];
  const warnings: string[] = [];

  for (const result of results) {
    if (result.status === "fulfilled") {
      items.push(...result.value);
    } else {
      warnings.push(
        result.reason instanceof Error
          ? result.reason.message
          : "Failed to connect to download client",
      );
    }
  }

  return { items, warnings };
}

export const getQueueFn = createServerFn({ method: "GET" }).handler(
  async () => {
    await requireAuth();
    return fetchQueueItems();
  },
);

export const removeFromQueueFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => removeFromQueueSchema.parse(d))
  .handler(async ({ data }) => {
    await requireAuth();

    const client = db
      .select()
      .from(downloadClients)
      .where(eq(downloadClients.id, data.downloadClientId))
      .get();

    if (!client) {
      throw new Error("Download client not found");
    }

    if (data.removeFromClient) {
      const provider = getProvider(client.implementation);
      const config = toConnectionConfig(client);
      await provider.removeDownload(config, data.downloadItemId, true);
    }

    if (data.addToBlocklist && data.sourceTitle) {
      db.insert(blocklist)
        .values({
          bookId: null,
          authorId: null,
          sourceTitle: data.sourceTitle,
          protocol: data.protocol ?? null,
          indexer: null,
          message: "Manually removed from queue",
          source: "manual",
        })
        .run();
    }

    return { success: true };
  });
