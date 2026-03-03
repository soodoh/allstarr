import { createServerFn } from "@tanstack/react-start";
import { db } from "src/db";
import { downloadClients } from "src/db/schema";
import { eq } from "drizzle-orm";
import { requireAuth } from "./middleware";
import getProvider from "./download-clients/registry";
import type { ConnectionConfig, DownloadItem } from "./download-clients/types";

export type QueueItem = DownloadItem & {
  downloadClientId: number;
  downloadClientName: string;
  protocol: string;
  progress: number;
  estimatedTimeLeft: number | null;
};

export const getQueueFn = createServerFn({ method: "GET" }).handler(
  async () => {
    await requireAuth();

    const enabledClients = db
      .select()
      .from(downloadClients)
      .where(eq(downloadClients.enabled, true))
      .all();

    if (enabledClients.length === 0) {
      return { items: [] as QueueItem[], warnings: [] as string[] };
    }

    const results = await Promise.allSettled(
      enabledClients.map(async (client) => {
        const provider = getProvider(client.implementation);
        const config: ConnectionConfig = {
          implementation:
            client.implementation as ConnectionConfig["implementation"],
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
  },
);
