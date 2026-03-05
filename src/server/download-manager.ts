// oxlint-disable no-console -- Download manager logs are intentional server-side diagnostics
// oxlint-disable import/prefer-default-export -- named export used by task registration
import { db } from "src/db";
import { trackedDownloads, downloadClients } from "src/db/schema";
import { eq, inArray } from "drizzle-orm";
import getProvider from "./download-clients/registry";
import type { ConnectionConfig, DownloadItem } from "./download-clients/types";
import { importCompletedDownload } from "./file-import";
import { eventBus } from "./event-bus";
import type { TaskResult } from "./scheduler/registry";

const ACTIVE_STATES = ["queued", "downloading", "completed", "importPending"];

type TrackedDownload = typeof trackedDownloads.$inferSelect;
type Stats = {
  updated: number;
  completed: number;
  removed: number;
  failed: number;
};

function reconcileTrackedDownload(
  td: TrackedDownload,
  item: DownloadItem | undefined,
  stats: Stats,
): "import" | null {
  if (item) {
    if (
      item.isCompleted &&
      (td.state === "queued" || td.state === "downloading")
    ) {
      db.update(trackedDownloads)
        .set({
          state: "completed",
          outputPath: item.outputPath,
          updatedAt: new Date(),
        })
        .where(eq(trackedDownloads.id, td.id))
        .run();
      stats.completed += 1;
      eventBus.emit({
        type: "downloadCompleted",
        bookId: td.bookId,
        title: td.releaseTitle,
      });
      return "import";
    }
    if (!item.isCompleted && td.state === "queued") {
      db.update(trackedDownloads)
        .set({ state: "downloading", updatedAt: new Date() })
        .where(eq(trackedDownloads.id, td.id))
        .run();
      stats.updated += 1;
    }
  } else if (td.state === "queued" || td.state === "downloading") {
    db.update(trackedDownloads)
      .set({
        state: "removed",
        message: "Disappeared from download client",
        updatedAt: new Date(),
      })
      .where(eq(trackedDownloads.id, td.id))
      .run();
    stats.removed += 1;
  }
  return null;
}

export async function refreshDownloads(): Promise<TaskResult> {
  const tracked = db
    .select()
    .from(trackedDownloads)
    .where(inArray(trackedDownloads.state, ACTIVE_STATES))
    .all();

  if (tracked.length === 0) {
    return { success: true, message: "No active tracked downloads" };
  }

  // Group by download client
  const byClient = new Map<number, TrackedDownload[]>();
  for (const td of tracked) {
    const existing = byClient.get(td.downloadClientId) ?? [];
    existing.push(td);
    byClient.set(td.downloadClientId, existing);
  }

  const stats: Stats = { updated: 0, completed: 0, removed: 0, failed: 0 };

  for (const [clientId, downloads] of byClient) {
    const client = db
      .select()
      .from(downloadClients)
      .where(eq(downloadClients.id, clientId))
      .get();

    if (!client) {
      for (const td of downloads) {
        db.update(trackedDownloads)
          .set({
            state: "removed",
            message: "Download client deleted",
            updatedAt: new Date(),
          })
          .where(eq(trackedDownloads.id, td.id))
          .run();
        stats.removed += 1;
      }
      continue;
    }

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

    let clientItems: DownloadItem[];
    try {
      clientItems = await provider.getDownloads(config);
    } catch (error) {
      console.warn(
        `[download-manager] Failed to fetch downloads from ${client.name}: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
      continue;
    }

    const itemMap = new Map(clientItems.map((item) => [item.id, item]));

    for (const td of downloads) {
      const action = reconcileTrackedDownload(
        td,
        itemMap.get(td.downloadId),
        stats,
      );
      if (action === "import") {
        try {
          await importCompletedDownload(td.id);
        } catch (error) {
          console.error(
            `[download-manager] Import failed for "${td.releaseTitle}": ${error instanceof Error ? error.message : "Unknown error"}`,
          );
          stats.failed += 1;
        }
      }
    }
  }

  eventBus.emit({ type: "queueUpdated" });

  const parts: string[] = [];
  if (stats.updated > 0) {
    parts.push(`${stats.updated} downloading`);
  }
  if (stats.completed > 0) {
    parts.push(`${stats.completed} completed`);
  }
  if (stats.removed > 0) {
    parts.push(`${stats.removed} removed`);
  }
  if (stats.failed > 0) {
    parts.push(`${stats.failed} import failures`);
  }

  return {
    success: stats.failed === 0,
    message:
      parts.length > 0
        ? `Processed ${tracked.length} downloads: ${parts.join(", ")}`
        : `Checked ${tracked.length} downloads, no changes`,
  };
}
