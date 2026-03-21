import { createServerFn } from "@tanstack/react-start";
import { db } from "src/db";
import {
  blocklist,
  downloadClients,
  trackedDownloads,
  books,
  authors,
} from "src/db/schema";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "./middleware";
import getProvider from "./download-clients/registry";
import type { ConnectionConfig, DownloadItem } from "./download-clients/types";
import {
  removeFromQueueSchema,
  pauseDownloadSchema,
  resumeDownloadSchema,
  setDownloadPrioritySchema,
} from "src/lib/validators";

export type QueueItem = DownloadItem & {
  downloadClientId: number;
  downloadClientName: string;
  protocol: string;
  progress: number;
  estimatedTimeLeft: number | null;
  bookId: number | null;
  bookTitle: string | null;
  authorName: string | null;
  trackedState: string | null;
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
    tag: client.tag,
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

  const items: QueueItem[] = [];
  const warnings: string[] = [];

  await Promise.allSettled(
    enabledClients.map(async (client) => {
      try {
        const provider = getProvider(client.implementation);
        const config = toConnectionConfig(client);

        const downloads = await provider.getDownloads(config);
        for (const dl of downloads) {
          // Look up tracked download for book/author info
          const tracked = db
            .select()
            .from(trackedDownloads)
            .where(
              and(
                eq(trackedDownloads.downloadClientId, client.id),
                eq(trackedDownloads.downloadId, dl.id),
              ),
            )
            .get();

          let bookTitle: string | null = null;
          let authorName: string | null = null;

          if (tracked?.bookId) {
            const book = db
              .select({ title: books.title })
              .from(books)
              .where(eq(books.id, tracked.bookId))
              .get();
            bookTitle = book?.title ?? null;
          }
          if (tracked?.authorId) {
            const author = db
              .select({ name: authors.name })
              .from(authors)
              .where(eq(authors.id, tracked.authorId))
              .get();
            authorName = author?.name ?? null;
          }

          items.push(
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
              bookId: tracked?.bookId ?? null,
              bookTitle,
              authorName,
              trackedState: tracked?.state ?? null,
            }),
          );
        }
      } catch (error) {
        warnings.push(
          `Failed to connect to ${client.name}: ${
            error instanceof Error ? error.message : "Unknown error"
          }`,
        );
      }
    }),
  );

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

export const pauseDownloadFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => pauseDownloadSchema.parse(d))
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
    const provider = getProvider(client.implementation);
    if (!provider.pauseDownload) {
      throw new Error("Client does not support pausing");
    }
    const config = toConnectionConfig(client);
    await provider.pauseDownload(config, data.downloadItemId);
    return { success: true };
  });

export const resumeDownloadFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => resumeDownloadSchema.parse(d))
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
    const provider = getProvider(client.implementation);
    if (!provider.resumeDownload) {
      throw new Error("Client does not support resuming");
    }
    const config = toConnectionConfig(client);
    await provider.resumeDownload(config, data.downloadItemId);
    return { success: true };
  });

export const setDownloadPriorityFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => setDownloadPrioritySchema.parse(d))
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
    const provider = getProvider(client.implementation);
    if (!provider.setPriority) {
      throw new Error("Client does not support priority changes");
    }
    const config = toConnectionConfig(client);
    await provider.setPriority(config, data.downloadItemId, data.priority);
    return { success: true };
  });
