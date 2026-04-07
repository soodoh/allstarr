import { createServerFn } from "@tanstack/react-start";
import { and, eq } from "drizzle-orm";
import { db } from "src/db";
import {
	authors,
	blocklist,
	books,
	downloadClients,
	trackedDownloads,
} from "src/db/schema";
import {
	pauseDownloadSchema,
	removeFromQueueSchema,
	resumeDownloadSchema,
	setDownloadPrioritySchema,
} from "src/lib/validators";
import getProvider from "./download-clients/registry";
import type { ConnectionConfig, DownloadItem } from "./download-clients/types";
import { requireAdmin, requireAuth } from "./middleware";

export type QueueItem = DownloadItem & {
	downloadClientId: number;
	downloadClientName: string;
	protocol: string;
	progress: number;
	estimatedTimeLeft: number | null;
	bookId: number | null;
	bookTitle: string | null;
	authorName: string | null;
	showId: number | null;
	episodeId: number | null;
	movieId: number | null;
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

type TrackedRow = typeof trackedDownloads.$inferSelect;

function resolveTrackedMeta(tracked: TrackedRow | undefined): {
	bookTitle: string | null;
	authorName: string | null;
} {
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

	return { bookTitle, authorName };
}

async function fetchClientItems(
	client: DownloadClientRow,
	items: QueueItem[],
	warnings: string[],
): Promise<void> {
	try {
		const provider = await getProvider(client.implementation);
		const config = toConnectionConfig(client);

		const downloads = await provider.getDownloads(config);
		for (const dl of downloads) {
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

			const { bookTitle, authorName } = resolveTrackedMeta(tracked);

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
					showId: tracked?.showId ?? null,
					episodeId: tracked?.episodeId ?? null,
					movieId: tracked?.movieId ?? null,
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
		enabledClients.map((client) => fetchClientItems(client, items, warnings)),
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
		await requireAdmin();

		const client = db
			.select()
			.from(downloadClients)
			.where(eq(downloadClients.id, data.downloadClientId))
			.get();

		if (!client) {
			throw new Error("Download client not found");
		}

		if (data.removeFromClient) {
			const provider = await getProvider(client.implementation);
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
		await requireAdmin();
		const client = db
			.select()
			.from(downloadClients)
			.where(eq(downloadClients.id, data.downloadClientId))
			.get();
		if (!client) {
			throw new Error("Download client not found");
		}
		const provider = await getProvider(client.implementation);
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
		await requireAdmin();
		const client = db
			.select()
			.from(downloadClients)
			.where(eq(downloadClients.id, data.downloadClientId))
			.get();
		if (!client) {
			throw new Error("Download client not found");
		}
		const provider = await getProvider(client.implementation);
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
		await requireAdmin();
		const client = db
			.select()
			.from(downloadClients)
			.where(eq(downloadClients.id, data.downloadClientId))
			.get();
		if (!client) {
			throw new Error("Download client not found");
		}
		const provider = await getProvider(client.implementation);
		if (!provider.setPriority) {
			throw new Error("Client does not support priority changes");
		}
		const config = toConnectionConfig(client);
		await provider.setPriority(config, data.downloadItemId, data.priority);
		return { success: true };
	});
