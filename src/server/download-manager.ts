import { eq, inArray } from "drizzle-orm";
import { db } from "src/db";
import { downloadClients, trackedDownloads } from "src/db/schema";
import getProvider from "./download-clients/registry";
import type {
	ConnectionConfig,
	DownloadClientProvider,
	DownloadItem,
} from "./download-clients/types";
import { eventBus } from "./event-bus";
import handleFailedDownload from "./failed-download-handler";
import { importCompletedDownload } from "./file-import";
import { logError, logWarn } from "./logger";
import { fetchQueueItems } from "./queue";
import type { TaskResult } from "./scheduler/registry";
import getMediaSetting from "./settings-reader";
import {
	markTrackedDownloadCompleted,
	markTrackedDownloadDownloading,
	markTrackedDownloadFailed,
	markTrackedDownloadImportPending,
	markTrackedDownloadRemoved,
} from "./tracked-download-state";

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
			markTrackedDownloadCompleted(td.id, item.outputPath);
			stats.completed += 1;
			eventBus.emit({
				type: "downloadCompleted",
				bookId: td.bookId,
				title: td.releaseTitle,
			});
			return "import";
		}
		if (!item.isCompleted && td.state === "queued") {
			markTrackedDownloadDownloading(td.id);
			stats.updated += 1;
		}
	} else if (td.state === "queued" || td.state === "downloading") {
		markTrackedDownloadRemoved(td.id, "Disappeared from download client");
		stats.removed += 1;
	}

	// Retry import for downloads stuck in completed/importPending (e.g. server crashed mid-import)
	if (td.state === "completed" || td.state === "importPending") {
		return "import";
	}

	return null;
}

async function removeFromClient(
	provider: DownloadClientProvider,
	config: ConnectionConfig,
	downloadId: string,
): Promise<void> {
	try {
		await provider.removeDownload(config, downloadId, false);
	} catch (error) {
		logWarn(
			"download-manager",
			`Failed to remove completed download from client: ${error instanceof Error ? error.message : "Unknown error"}`,
		);
	}
}

async function runFailedDownloadHandler(
	trackedDownloadId: number,
	provider: DownloadClientProvider,
	config: ConnectionConfig,
): Promise<void> {
	try {
		await handleFailedDownload(trackedDownloadId, provider, config);
	} catch (handlerError) {
		logError(
			"download-manager",
			`Failed download handler error: ${handlerError instanceof Error ? handlerError.message : "Unknown error"}`,
			handlerError,
		);
	}
}

function claimImport(td: TrackedDownload): boolean {
	if (td.state === "importPending") {
		return true;
	}

	try {
		markTrackedDownloadImportPending(td.id);
		return true;
	} catch (error) {
		logWarn(
			"download-manager",
			`Failed to claim import for "${td.releaseTitle}": ${error instanceof Error ? error.message : "Unknown error"}`,
		);
		return false;
	}
}

function getTrackedDownloadState(id: number): string | null {
	const refreshed = db
		.select({ state: trackedDownloads.state })
		.from(trackedDownloads)
		.where(eq(trackedDownloads.id, id))
		.get();

	return refreshed?.state ?? null;
}

async function importTrackedDownload(td: TrackedDownload): Promise<boolean> {
	try {
		await importCompletedDownload(td.id);
		return true;
	} catch (error) {
		const message = error instanceof Error ? error.message : "Unknown error";
		logError(
			"download-manager",
			`Import failed for "${td.releaseTitle}": ${message}`,
			error,
		);
		if (getTrackedDownloadState(td.id) !== "failed") {
			markTrackedDownloadFailed(td.id, message);
		}
		return false;
	}
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
	const enableCompletedHandling = getMediaSetting(
		"downloadClient.enableCompletedDownloadHandling",
		true,
	);

	for (const [clientId, downloads] of byClient) {
		const client = db
			.select()
			.from(downloadClients)
			.where(eq(downloadClients.id, clientId))
			.get();

		if (!client) {
			for (const td of downloads) {
				if (td.state === "queued" || td.state === "downloading") {
					markTrackedDownloadRemoved(td.id, "Download client deleted");
					stats.removed += 1;
				} else if (
					enableCompletedHandling &&
					(td.state === "completed" || td.state === "importPending")
				) {
					if (!claimImport(td)) {
						continue;
					}
					if (!(await importTrackedDownload(td))) {
						stats.failed += 1;
						continue;
					}
					if (getTrackedDownloadState(td.id) === "failed") {
						stats.failed += 1;
					}
				}
			}
			continue;
		}

		const provider = await getProvider(client.implementation);
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
			tag: client.tag,
			settings: client.settings as Record<string, unknown> | null,
		};

		let clientItems: DownloadItem[];
		try {
			clientItems = await provider.getDownloads(config);
		} catch (error) {
			logWarn(
				"download-manager",
				`Failed to fetch downloads from ${client.name}: ${error instanceof Error ? error.message : "Unknown error"}`,
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
			if (action === "import" && enableCompletedHandling) {
				if (!claimImport(td)) {
					continue;
				}
				if (!(await importTrackedDownload(td))) {
					stats.failed += 1;
					await runFailedDownloadHandler(td.id, provider, config);
					continue;
				}

				const refreshed = db
					.select({ state: trackedDownloads.state })
					.from(trackedDownloads)
					.where(eq(trackedDownloads.id, td.id))
					.get();

				if (refreshed?.state === "failed") {
					stats.failed += 1;
					await runFailedDownloadHandler(td.id, provider, config);
					continue;
				}

				if (
					refreshed?.state === "imported" &&
					client.removeCompletedDownloads
				) {
					await removeFromClient(provider, config, td.downloadId);
				}
			}
		}
	}

	if (eventBus.getClientCount() > 0) {
		const queueSnapshot = await fetchQueueItems();
		eventBus.emit({ type: "queueProgress", data: queueSnapshot });
	} else {
		eventBus.emit({ type: "queueUpdated" });
	}

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
