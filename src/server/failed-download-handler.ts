// oxlint-disable no-console -- Failed download handler logs are intentional server-side diagnostics
import { db } from "src/db";
import { trackedDownloads, blocklist } from "src/db/schema";
import { eq } from "drizzle-orm";
import { eventBus } from "./event-bus";
import { getMediaSetting } from "./settings-reader";
import { runAutoSearch } from "./auto-search";
import type {
  ConnectionConfig,
  DownloadClientProvider,
} from "./download-clients/types";

export async function handleFailedDownload(
  trackedDownloadId: number,
  provider: DownloadClientProvider,
  config: ConnectionConfig,
): Promise<void> {
  const td = db
    .select()
    .from(trackedDownloads)
    .where(eq(trackedDownloads.id, trackedDownloadId))
    .get();

  if (!td) {
    return;
  }

  eventBus.emit({
    type: "downloadFailed",
    bookId: td.bookId,
    title: td.releaseTitle,
    message: td.message ?? "Download failed",
  });

  const redownloadFailed = getMediaSetting(
    "downloadClient.redownloadFailed",
    true,
  );

  if (redownloadFailed && td.bookId) {
    db.insert(blocklist)
      .values({
        sourceTitle: td.releaseTitle,
        bookId: td.bookId,
        authorId: td.authorId,
        protocol: td.protocol,
        message: `Download failed: ${td.message ?? "Unknown error"}`,
        source: "automatic",
      })
      .run();

    console.log(
      `[failed-download] Blocklisted "${td.releaseTitle}" and searching for alternative`,
    );

    await runAutoSearch({ bookIds: [td.bookId] });
  }

  const removeFailed = getMediaSetting("downloadClient.removeFailed", true);

  if (removeFailed) {
    try {
      await provider.removeDownload(config, td.downloadId, true);
      console.log(
        `[failed-download] Removed failed download "${td.releaseTitle}" from client`,
      );
    } catch (error) {
      console.warn(
        `[failed-download] Failed to remove download from client: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }
}
