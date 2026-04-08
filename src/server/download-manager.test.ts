import { afterEach, describe, expect, it, vi } from "vitest";

function column(table: string, name: string) {
	return { table, name };
}

const trackedDownloads = {
	__table: "trackedDownloads",
	id: column("trackedDownloads", "id"),
	downloadClientId: column("trackedDownloads", "downloadClientId"),
	state: column("trackedDownloads", "state"),
} as const;

const downloadClients = {
	__table: "downloadClients",
	id: column("downloadClients", "id"),
} as const;

type Condition =
	| { type: "eq"; column: { name: string }; value: unknown }
	| { type: "inArray"; column: { name: string }; values: unknown[] };

type FakeTrackedDownloadRow = {
	id: number;
	downloadClientId: number;
	downloadId: string;
	bookId: number | null;
	authorId: number | null;
	downloadProfileId: number | null;
	showId: number | null;
	episodeId: number | null;
	movieId: number | null;
	releaseTitle: string;
	protocol: string;
	state: string;
	outputPath: string | null;
	message: string | null;
	createdAt: Date;
	updatedAt: Date;
};

function matches(row: Record<string, unknown>, condition?: Condition) {
	if (!condition) {
		return true;
	}
	if (condition.type === "eq") {
		return row[condition.column.name] === condition.value;
	}
	return condition.values.includes(row[condition.column.name]);
}

function projectRow(
	row: Record<string, unknown>,
	shape?: Record<string, { name: string }>,
) {
	if (!shape) {
		return { ...row };
	}

	return Object.fromEntries(
		Object.entries(shape).map(([key, value]) => [key, row[value.name]]),
	);
}

function createFakeDb({
	trackedRows,
	clientRows,
}: {
	trackedRows: Array<Record<string, unknown>>;
	clientRows: Array<Record<string, unknown>>;
}) {
	const rowsByTable = {
		trackedDownloads: trackedRows,
		downloadClients: clientRows,
	};

	return {
		select(shape?: Record<string, { name: string }>) {
			return {
				from(table: { __table: keyof typeof rowsByTable }) {
					let condition: Condition | undefined;

					return {
						where(nextCondition: Condition) {
							condition = nextCondition;
							return this;
						},
						all() {
							return rowsByTable[table.__table]
								.filter((row) => matches(row, condition))
								.map((row) => projectRow(row, shape));
						},
						get() {
							return rowsByTable[table.__table]
								.filter((row) => matches(row, condition))
								.map((row) => projectRow(row, shape))[0];
						},
					};
				},
			};
		},
		update(table: { __table: keyof typeof rowsByTable }) {
			return {
				set(values: Record<string, unknown>) {
					return {
						where(condition: Condition) {
							return {
								run() {
									for (const row of rowsByTable[table.__table]) {
										if (matches(row, condition)) {
											Object.assign(row, values);
										}
									}
								},
							};
						},
					};
				},
			};
		},
	};
}

function setupRefreshDownloadsTest({
	trackedRows,
	clientRows,
	queueClientCount = 0,
	queueItems = { items: [], warnings: [] },
	completedHandling = true,
	provider = {
		getDownloads: vi.fn().mockResolvedValue([]),
		removeDownload: vi.fn(),
	},
}: {
	trackedRows: FakeTrackedDownloadRow[];
	clientRows: Array<Record<string, unknown>>;
	queueClientCount?: number;
	queueItems?: { items: Array<Record<string, unknown>>; warnings: string[] };
	completedHandling?: boolean;
	provider?: {
		getDownloads: ReturnType<typeof vi.fn>;
		removeDownload: ReturnType<typeof vi.fn>;
	};
}) {
	const db = createFakeDb({ trackedRows, clientRows });
	const eventEmit = vi.fn();
	const fetchQueueItems = vi.fn().mockResolvedValue(queueItems);
	const getProvider = vi.fn().mockResolvedValue(provider);
	const importCompletedDownload = vi.fn().mockResolvedValue(undefined);
	const handleFailedDownload = vi.fn().mockResolvedValue(undefined);
	const logError = vi.fn();
	const logWarn = vi.fn();

	vi.doMock("drizzle-orm", () => ({
		eq: (dbColumn: { name: string }, value: unknown) => ({
			type: "eq",
			column: dbColumn,
			value,
		}),
		inArray: (dbColumn: { name: string }, values: unknown[]) => ({
			type: "inArray",
			column: dbColumn,
			values,
		}),
	}));
	vi.doMock("src/db", () => ({ db }));
	vi.doMock("src/db/schema", () => ({
		downloadClients,
		trackedDownloads,
	}));
	vi.doMock("./download-clients/registry", () => ({
		default: getProvider,
	}));
	vi.doMock("./file-import", () => ({
		importCompletedDownload,
	}));
	vi.doMock("./failed-download-handler", () => ({
		default: handleFailedDownload,
	}));
	vi.doMock("./event-bus", () => ({
		eventBus: {
			emit: eventEmit,
			getClientCount: () => queueClientCount,
		},
	}));
	vi.doMock("./settings-reader", () => ({
		default: (_key: string, fallback: boolean) => completedHandling ?? fallback,
	}));
	vi.doMock("./queue", () => ({
		fetchQueueItems,
	}));
	vi.doMock("./logger", () => ({
		logError,
		logWarn,
	}));

	return {
		db,
		eventEmit,
		fetchQueueItems,
		getProvider,
		importCompletedDownload,
		handleFailedDownload,
		logError,
		logWarn,
		provider,
	};
}

afterEach(() => {
	vi.resetModules();
	vi.restoreAllMocks();
});

describe("refreshDownloads", () => {
	it("returns early when there are no active tracked downloads", async () => {
		setupRefreshDownloadsTest({
			trackedRows: [
				{
					id: 1,
					downloadClientId: 7,
					downloadId: "download-1",
					bookId: 42,
					authorId: 9,
					downloadProfileId: 5,
					showId: null,
					episodeId: null,
					movieId: null,
					releaseTitle: "Inactive Book [EPUB]",
					protocol: "torrent",
					state: "failed",
					outputPath: "/downloads/inactive-book",
					message: "Something went wrong",
					createdAt: new Date(),
					updatedAt: new Date(),
				},
				{
					id: 2,
					downloadClientId: 7,
					downloadId: "download-2",
					bookId: 43,
					authorId: 10,
					downloadProfileId: 6,
					showId: null,
					episodeId: null,
					movieId: null,
					releaseTitle: "Imported Book [EPUB]",
					protocol: "torrent",
					state: "imported",
					outputPath: "/downloads/imported-book",
					message: null,
					createdAt: new Date(),
					updatedAt: new Date(),
				},
			],
			clientRows: [],
		});

		const { refreshDownloads } = await import("./download-manager");
		await expect(refreshDownloads()).resolves.toEqual({
			success: true,
			message: "No active tracked downloads",
		});
	});

	it("marks downloads removed when the tracked client is missing", async () => {
		const trackedRows: FakeTrackedDownloadRow[] = [
			{
				id: 1,
				downloadClientId: 7,
				downloadId: "download-1",
				bookId: 42,
				authorId: 9,
				downloadProfileId: 5,
				showId: null,
				episodeId: null,
				movieId: null,
				releaseTitle: "Missing Client - Book [EPUB]",
				protocol: "torrent",
				state: "queued",
				outputPath: "/downloads/missing-client",
				message: null,
				createdAt: new Date(),
				updatedAt: new Date(),
			},
		];
		const { eventEmit, getProvider, fetchQueueItems } =
			setupRefreshDownloadsTest({
				trackedRows,
				clientRows: [],
			});

		const { refreshDownloads } = await import("./download-manager");
		await expect(refreshDownloads()).resolves.toEqual({
			success: true,
			message: "Processed 1 downloads: 1 removed",
		});

		expect(trackedRows[0].state).toBe("removed");
		expect(trackedRows[0].message).toBe("Download client deleted");
		expect(getProvider).not.toHaveBeenCalled();
		expect(fetchQueueItems).not.toHaveBeenCalled();
		expect(eventEmit).toHaveBeenCalledWith({ type: "queueUpdated" });
	});

	it("marks queued downloads removed when they disappear from an existing client", async () => {
		const trackedRows: FakeTrackedDownloadRow[] = [
			{
				id: 1,
				downloadClientId: 7,
				downloadId: "download-1",
				bookId: 42,
				authorId: 9,
				downloadProfileId: 5,
				showId: null,
				episodeId: null,
				movieId: null,
				releaseTitle: "Disappeared Book [EPUB]",
				protocol: "torrent",
				state: "queued",
				outputPath: "/downloads/disappeared-book",
				message: null,
				createdAt: new Date(),
				updatedAt: new Date(),
			},
		];
		const { eventEmit, fetchQueueItems, getProvider } =
			setupRefreshDownloadsTest({
				trackedRows,
				clientRows: [
					{
						id: 7,
						name: "Test qBittorrent",
						implementation: "qBittorrent",
						host: "localhost",
						port: 8080,
						useSsl: false,
						urlBase: null,
						username: null,
						password: null,
						apiKey: null,
						category: "allstarr",
						tag: null,
						settings: null,
						removeCompletedDownloads: true,
					},
				],
				provider: {
					getDownloads: vi.fn().mockResolvedValue([]),
					removeDownload: vi.fn(),
				},
			});

		const { refreshDownloads } = await import("./download-manager");
		await expect(refreshDownloads()).resolves.toEqual({
			success: true,
			message: "Processed 1 downloads: 1 removed",
		});

		expect(trackedRows[0].state).toBe("removed");
		expect(trackedRows[0].message).toBe("Disappeared from download client");
		expect(getProvider).toHaveBeenCalledWith("qBittorrent");
		expect(fetchQueueItems).not.toHaveBeenCalled();
		expect(eventEmit).toHaveBeenCalledWith({ type: "queueUpdated" });
	});

	it("marks queued downloads as downloading when the provider reports an active item", async () => {
		const trackedRows: FakeTrackedDownloadRow[] = [
			{
				id: 1,
				downloadClientId: 7,
				downloadId: "download-1",
				bookId: 42,
				authorId: 9,
				downloadProfileId: 5,
				showId: null,
				episodeId: null,
				movieId: null,
				releaseTitle: "Downloading Book [EPUB]",
				protocol: "torrent",
				state: "queued",
				outputPath: "/downloads/downloading-book",
				message: null,
				createdAt: new Date(),
				updatedAt: new Date(),
			},
		];
		const provider = {
			getDownloads: vi.fn().mockResolvedValue([
				{
					id: "download-1",
					name: "Downloading Book [EPUB]",
					status: "downloading",
					size: 100,
					downloaded: 25,
					uploadSpeed: 0,
					downloadSpeed: 10,
					category: null,
					outputPath: "/downloads/downloading-book",
					isCompleted: false,
				},
			]),
			removeDownload: vi.fn(),
		};
		const { eventEmit, importCompletedDownload, getProvider } =
			setupRefreshDownloadsTest({
				trackedRows,
				clientRows: [
					{
						id: 7,
						name: "Test qBittorrent",
						implementation: "qBittorrent",
						host: "localhost",
						port: 8080,
						useSsl: false,
						urlBase: null,
						username: null,
						password: null,
						apiKey: null,
						category: "allstarr",
						tag: null,
						settings: null,
						removeCompletedDownloads: true,
					},
				],
				provider,
			});

		const { refreshDownloads } = await import("./download-manager");
		await expect(refreshDownloads()).resolves.toEqual({
			success: true,
			message: "Processed 1 downloads: 1 downloading",
		});

		expect(trackedRows[0].state).toBe("downloading");
		expect(getProvider).toHaveBeenCalledWith("qBittorrent");
		expect(importCompletedDownload).not.toHaveBeenCalled();
		expect(eventEmit).toHaveBeenCalledWith({ type: "queueUpdated" });
	});

	it("imports a completed download from the downloading state without removing it when cleanup is disabled", async () => {
		const trackedRows: FakeTrackedDownloadRow[] = [
			{
				id: 1,
				downloadClientId: 7,
				downloadId: "download-1",
				bookId: 42,
				authorId: 9,
				downloadProfileId: 5,
				showId: null,
				episodeId: null,
				movieId: null,
				releaseTitle: "Completed Downloading Book [EPUB]",
				protocol: "torrent",
				state: "downloading",
				outputPath: "/downloads/completed-downloading-book",
				message: null,
				createdAt: new Date(),
				updatedAt: new Date(),
			},
		];
		const provider = {
			getDownloads: vi.fn().mockResolvedValue([
				{
					id: "download-1",
					name: "Completed Downloading Book [EPUB]",
					status: "completed",
					size: 100,
					downloaded: 100,
					uploadSpeed: 0,
					downloadSpeed: 0,
					category: null,
					outputPath: "/downloads/completed-downloading-book",
					isCompleted: true,
				},
			]),
			removeDownload: vi.fn(),
		};
		const { eventEmit, importCompletedDownload } = setupRefreshDownloadsTest({
			trackedRows,
			clientRows: [
				{
					id: 7,
					name: "Test qBittorrent",
					implementation: "qBittorrent",
					host: "localhost",
					port: 8080,
					useSsl: false,
					urlBase: null,
					username: null,
					password: null,
					apiKey: null,
					category: "allstarr",
					tag: null,
					settings: null,
					removeCompletedDownloads: false,
				},
			],
			provider,
		});

		importCompletedDownload.mockImplementation(async () => {
			trackedRows[0].state = "imported";
		});

		const { refreshDownloads } = await import("./download-manager");
		await expect(refreshDownloads()).resolves.toEqual({
			success: true,
			message: "Processed 1 downloads: 1 completed",
		});

		expect(trackedRows[0].state).toBe("imported");
		expect(importCompletedDownload).toHaveBeenCalledWith(1);
		expect(provider.removeDownload).not.toHaveBeenCalled();
		expect(eventEmit).toHaveBeenCalledWith({
			type: "downloadCompleted",
			bookId: 42,
			title: "Completed Downloading Book [EPUB]",
		});
	});

	it("imports completed downloads and removes them from the client when requested", async () => {
		const trackedRows: FakeTrackedDownloadRow[] = [
			{
				id: 1,
				downloadClientId: 7,
				downloadId: "download-1",
				bookId: 42,
				authorId: 9,
				downloadProfileId: 5,
				showId: null,
				episodeId: null,
				movieId: null,
				releaseTitle: "Completed Book [EPUB]",
				protocol: "torrent",
				state: "queued",
				outputPath: "/downloads/completed-book",
				message: null,
				createdAt: new Date(),
				updatedAt: new Date(),
			},
		];
		const provider = {
			getDownloads: vi.fn().mockResolvedValue([
				{
					id: "download-1",
					name: "Completed Book [EPUB]",
					status: "completed",
					size: 100,
					downloaded: 100,
					uploadSpeed: 0,
					downloadSpeed: 0,
					category: null,
					outputPath: "/downloads/completed-book",
					isCompleted: true,
				},
			]),
			removeDownload: vi.fn(),
		};
		const {
			eventEmit,
			fetchQueueItems,
			importCompletedDownload,
			provider: providerMock,
		} = setupRefreshDownloadsTest({
			trackedRows,
			clientRows: [
				{
					id: 7,
					name: "Test qBittorrent",
					implementation: "qBittorrent",
					host: "localhost",
					port: 8080,
					useSsl: false,
					urlBase: null,
					username: null,
					password: null,
					apiKey: null,
					category: "allstarr",
					tag: null,
					settings: null,
					removeCompletedDownloads: true,
				},
			],
			queueClientCount: 1,
			queueItems: {
				items: [{ id: "queue-1", status: "downloading" }],
				warnings: [],
			},
			provider,
		});

		importCompletedDownload.mockImplementation(async () => {
			trackedRows[0].state = "imported";
		});

		const { refreshDownloads } = await import("./download-manager");
		await expect(refreshDownloads()).resolves.toEqual({
			success: true,
			message: "Processed 1 downloads: 1 completed",
		});

		expect(trackedRows[0].state).toBe("imported");
		expect(importCompletedDownload).toHaveBeenCalledWith(1);
		expect(eventEmit).toHaveBeenCalledWith({
			type: "downloadCompleted",
			bookId: 42,
			title: "Completed Book [EPUB]",
		});
		expect(providerMock.removeDownload).toHaveBeenCalledWith(
			{
				implementation: "qBittorrent",
				host: "localhost",
				port: 8080,
				useSsl: false,
				urlBase: null,
				username: null,
				password: null,
				apiKey: null,
				category: "allstarr",
				tag: null,
				settings: null,
			},
			"download-1",
			false,
		);
		expect(fetchQueueItems).toHaveBeenCalledTimes(1);
		expect(eventEmit).toHaveBeenCalledWith({
			type: "queueProgress",
			data: {
				items: [{ id: "queue-1", status: "downloading" }],
				warnings: [],
			},
		});
	});

	it("warns when removing an imported download from the client fails", async () => {
		const trackedRows: FakeTrackedDownloadRow[] = [
			{
				id: 1,
				downloadClientId: 7,
				downloadId: "download-1",
				bookId: 42,
				authorId: 9,
				downloadProfileId: 5,
				showId: null,
				episodeId: null,
				movieId: null,
				releaseTitle: "Removal Failure Book [EPUB]",
				protocol: "torrent",
				state: "queued",
				outputPath: "/downloads/removal-failure",
				message: null,
				createdAt: new Date(),
				updatedAt: new Date(),
			},
		];
		const provider = {
			getDownloads: vi.fn().mockResolvedValue([
				{
					id: "download-1",
					name: "Removal Failure Book [EPUB]",
					status: "completed",
					size: 100,
					downloaded: 100,
					uploadSpeed: 0,
					downloadSpeed: 0,
					category: null,
					outputPath: "/downloads/removal-failure",
					isCompleted: true,
				},
			]),
			removeDownload: vi.fn().mockRejectedValue(new Error("client refused")),
		};
		const { logWarn, importCompletedDownload } = setupRefreshDownloadsTest({
			trackedRows,
			clientRows: [
				{
					id: 7,
					name: "Test qBittorrent",
					implementation: "qBittorrent",
					host: "localhost",
					port: 8080,
					useSsl: false,
					urlBase: null,
					username: null,
					password: null,
					apiKey: null,
					category: "allstarr",
					tag: null,
					settings: null,
					removeCompletedDownloads: true,
				},
			],
			provider,
		});

		importCompletedDownload.mockImplementation(async () => {
			trackedRows[0].state = "imported";
		});

		const { refreshDownloads } = await import("./download-manager");
		await expect(refreshDownloads()).resolves.toEqual({
			success: true,
			message: "Processed 1 downloads: 1 completed",
		});

		expect(logWarn).toHaveBeenCalledWith(
			"download-manager",
			"Failed to remove completed download from client: client refused",
		);
	});

	it("logs a non-Error when removing an imported download from the client fails", async () => {
		const trackedRows: FakeTrackedDownloadRow[] = [
			{
				id: 1,
				downloadClientId: 7,
				downloadId: "download-1",
				bookId: 42,
				authorId: 9,
				downloadProfileId: 5,
				showId: null,
				episodeId: null,
				movieId: null,
				releaseTitle: "Removal Failure Book [EPUB]",
				protocol: "torrent",
				state: "downloading",
				outputPath: "/downloads/removal-failure",
				message: null,
				createdAt: new Date(),
				updatedAt: new Date(),
			},
		];
		const provider = {
			getDownloads: vi.fn().mockResolvedValue([
				{
					id: "download-1",
					name: "Removal Failure Book [EPUB]",
					status: "completed",
					size: 100,
					downloaded: 100,
					uploadSpeed: 0,
					downloadSpeed: 0,
					category: null,
					outputPath: "/downloads/removal-failure",
					isCompleted: true,
				},
			]),
			removeDownload: vi.fn().mockRejectedValue("client refused"),
		};
		const { logWarn, importCompletedDownload } = setupRefreshDownloadsTest({
			trackedRows,
			clientRows: [
				{
					id: 7,
					name: "Test qBittorrent",
					implementation: "qBittorrent",
					host: "localhost",
					port: 8080,
					useSsl: false,
					urlBase: null,
					username: null,
					password: null,
					apiKey: null,
					category: "allstarr",
					tag: null,
					settings: null,
					removeCompletedDownloads: true,
				},
			],
			provider,
		});

		importCompletedDownload.mockImplementation(async () => {
			trackedRows[0].state = "imported";
		});

		const { refreshDownloads } = await import("./download-manager");
		await expect(refreshDownloads()).resolves.toEqual({
			success: true,
			message: "Processed 1 downloads: 1 completed",
		});

		expect(logWarn).toHaveBeenCalledWith(
			"download-manager",
			"Failed to remove completed download from client: Unknown error",
		);
	});

	it("skips a client when fetching its downloads fails", async () => {
		const trackedRows: FakeTrackedDownloadRow[] = [
			{
				id: 1,
				downloadClientId: 7,
				downloadId: "download-1",
				bookId: 42,
				authorId: 9,
				downloadProfileId: 5,
				showId: null,
				episodeId: null,
				movieId: null,
				releaseTitle: "Fetch Failure Book [EPUB]",
				protocol: "torrent",
				state: "queued",
				outputPath: "/downloads/fetch-failure",
				message: null,
				createdAt: new Date(),
				updatedAt: new Date(),
			},
		];
		const provider = {
			getDownloads: vi.fn().mockRejectedValue(new Error("client offline")),
			removeDownload: vi.fn(),
		};
		const { eventEmit, getProvider, importCompletedDownload } =
			setupRefreshDownloadsTest({
				trackedRows,
				clientRows: [
					{
						id: 7,
						name: "Test qBittorrent",
						implementation: "qBittorrent",
						host: "localhost",
						port: 8080,
						useSsl: false,
						urlBase: null,
						username: null,
						password: null,
						apiKey: null,
						category: "allstarr",
						tag: null,
						settings: null,
						removeCompletedDownloads: true,
					},
				],
				provider,
			});

		const { refreshDownloads } = await import("./download-manager");
		await expect(refreshDownloads()).resolves.toEqual({
			success: true,
			message: "Checked 1 downloads, no changes",
		});

		expect(getProvider).toHaveBeenCalledWith("qBittorrent");
		expect(importCompletedDownload).not.toHaveBeenCalled();
		expect(eventEmit).toHaveBeenCalledWith({ type: "queueUpdated" });
	});

	it("logs a non-Error when fetching downloads fails", async () => {
		const trackedRows: FakeTrackedDownloadRow[] = [
			{
				id: 1,
				downloadClientId: 7,
				downloadId: "download-1",
				bookId: 42,
				authorId: 9,
				downloadProfileId: 5,
				showId: null,
				episodeId: null,
				movieId: null,
				releaseTitle: "Fetch Failure Book [EPUB]",
				protocol: "torrent",
				state: "queued",
				outputPath: "/downloads/fetch-failure",
				message: null,
				createdAt: new Date(),
				updatedAt: new Date(),
			},
		];
		const provider = {
			getDownloads: vi.fn().mockRejectedValue("client offline"),
			removeDownload: vi.fn(),
		};
		const { logWarn, getProvider } = setupRefreshDownloadsTest({
			trackedRows,
			clientRows: [
				{
					id: 7,
					name: "Test qBittorrent",
					implementation: "qBittorrent",
					host: "localhost",
					port: 8080,
					useSsl: false,
					urlBase: null,
					username: null,
					password: null,
					apiKey: null,
					category: "allstarr",
					tag: null,
					settings: null,
					removeCompletedDownloads: true,
				},
			],
			provider,
		});

		const { refreshDownloads } = await import("./download-manager");
		await expect(refreshDownloads()).resolves.toEqual({
			success: true,
			message: "Checked 1 downloads, no changes",
		});

		expect(getProvider).toHaveBeenCalledWith("qBittorrent");
		expect(logWarn).toHaveBeenCalledWith(
			"download-manager",
			"Failed to fetch downloads from Test qBittorrent: Unknown error",
		);
	});

	it("records an import failure when importing a completed download throws", async () => {
		const trackedRows: FakeTrackedDownloadRow[] = [
			{
				id: 1,
				downloadClientId: 7,
				downloadId: "download-1",
				bookId: 42,
				authorId: 9,
				downloadProfileId: 5,
				showId: null,
				episodeId: null,
				movieId: null,
				releaseTitle: "Import Failure Book [EPUB]",
				protocol: "torrent",
				state: "queued",
				outputPath: "/downloads/import-failure",
				message: null,
				createdAt: new Date(),
				updatedAt: new Date(),
			},
		];
		const provider = {
			getDownloads: vi.fn().mockResolvedValue([
				{
					id: "download-1",
					name: "Import Failure Book [EPUB]",
					status: "completed",
					size: 100,
					downloaded: 100,
					uploadSpeed: 0,
					downloadSpeed: 0,
					category: null,
					outputPath: "/downloads/import-failure",
					isCompleted: true,
				},
			]),
			removeDownload: vi.fn(),
		};
		const { eventEmit, handleFailedDownload, importCompletedDownload } =
			setupRefreshDownloadsTest({
				trackedRows,
				clientRows: [
					{
						id: 7,
						name: "Test qBittorrent",
						implementation: "qBittorrent",
						host: "localhost",
						port: 8080,
						useSsl: false,
						urlBase: null,
						username: null,
						password: null,
						apiKey: null,
						category: "allstarr",
						tag: null,
						settings: null,
						removeCompletedDownloads: true,
					},
				],
				provider,
			});

		importCompletedDownload.mockRejectedValue(new Error("import exploded"));

		const { refreshDownloads } = await import("./download-manager");
		await expect(refreshDownloads()).resolves.toEqual({
			success: false,
			message: "Processed 1 downloads: 1 completed, 1 import failures",
		});

		expect(importCompletedDownload).toHaveBeenCalledWith(1);
		expect(handleFailedDownload).toHaveBeenCalledTimes(1);
		expect(eventEmit).toHaveBeenCalledWith({ type: "queueUpdated" });
	});

	it("runs failed-download handling once when handler throws after a state-based import failure", async () => {
		const trackedRows: FakeTrackedDownloadRow[] = [
			{
				id: 1,
				downloadClientId: 7,
				downloadId: "download-1",
				bookId: 42,
				authorId: 9,
				downloadProfileId: 5,
				showId: null,
				episodeId: null,
				movieId: null,
				releaseTitle: "Failure Author - Failure Book [EPUB]",
				protocol: "torrent",
				state: "completed",
				outputPath: "/downloads/failure-book",
				message: null,
				createdAt: new Date(),
				updatedAt: new Date(),
			},
		];
		const clientRows = [
			{
				id: 7,
				name: "Test qBittorrent",
				implementation: "qBittorrent",
				host: "localhost",
				port: 8080,
				useSsl: false,
				urlBase: null,
				username: null,
				password: null,
				apiKey: null,
				category: "allstarr",
				tag: null,
				settings: null,
				removeCompletedDownloads: true,
			},
		];
		const db = createFakeDb({ trackedRows, clientRows });
		const provider = {
			getDownloads: vi.fn().mockResolvedValue([]),
			removeDownload: vi.fn(),
		};
		const importCompletedDownload = vi.fn().mockImplementation(async () => {
			trackedRows[0].state = "failed";
			trackedRows[0].message = "Download output path not set";
		});
		const handleFailedDownload = vi.fn().mockImplementation(async () => {
			throw new Error("auto-search blew up");
		});

		vi.doMock("drizzle-orm", () => ({
			eq: (dbColumn: { name: string }, value: unknown) => ({
				type: "eq",
				column: dbColumn,
				value,
			}),
			inArray: (dbColumn: { name: string }, values: unknown[]) => ({
				type: "inArray",
				column: dbColumn,
				values,
			}),
		}));
		vi.doMock("src/db", () => ({ db }));
		vi.doMock("src/db/schema", () => ({
			downloadClients,
			trackedDownloads,
		}));
		vi.doMock("./download-clients/registry", () => ({
			default: vi.fn().mockResolvedValue(provider),
		}));
		vi.doMock("./file-import", () => ({
			importCompletedDownload,
		}));
		vi.doMock("./failed-download-handler", () => ({
			default: handleFailedDownload,
		}));
		vi.doMock("./event-bus", () => ({
			eventBus: {
				emit: vi.fn(),
				getClientCount: () => 0,
			},
		}));
		vi.doMock("./settings-reader", () => ({
			default: (_key: string, fallback: boolean) => fallback,
		}));
		vi.doMock("./queue", () => ({
			fetchQueueItems: vi.fn().mockResolvedValue([]),
		}));
		vi.doMock("./logger", () => ({
			logError: vi.fn(),
			logWarn: vi.fn(),
		}));

		const { refreshDownloads } = await import("./download-manager");
		await refreshDownloads();

		expect(importCompletedDownload).toHaveBeenCalledWith(1);
		expect(handleFailedDownload).toHaveBeenCalledTimes(1);
	});

	it("logs non-Error messages when import and failed-download handling both throw", async () => {
		const trackedRows: FakeTrackedDownloadRow[] = [
			{
				id: 1,
				downloadClientId: 7,
				downloadId: "download-1",
				bookId: 42,
				authorId: 9,
				downloadProfileId: 5,
				showId: null,
				episodeId: null,
				movieId: null,
				releaseTitle: "Import Failure Book [EPUB]",
				protocol: "torrent",
				state: "queued",
				outputPath: "/downloads/import-failure",
				message: null,
				createdAt: new Date(),
				updatedAt: new Date(),
			},
		];
		const provider = {
			getDownloads: vi.fn().mockResolvedValue([
				{
					id: "download-1",
					name: "Import Failure Book [EPUB]",
					status: "completed",
					size: 100,
					downloaded: 100,
					uploadSpeed: 0,
					downloadSpeed: 0,
					category: null,
					outputPath: "/downloads/import-failure",
					isCompleted: true,
				},
			]),
			removeDownload: vi.fn(),
		};
		const {
			eventEmit,
			handleFailedDownload,
			importCompletedDownload,
			logError,
		} = setupRefreshDownloadsTest({
			trackedRows,
			clientRows: [
				{
					id: 7,
					name: "Test qBittorrent",
					implementation: "qBittorrent",
					host: "localhost",
					port: 8080,
					useSsl: false,
					urlBase: null,
					username: null,
					password: null,
					apiKey: null,
					category: "allstarr",
					tag: null,
					settings: null,
					removeCompletedDownloads: true,
				},
			],
			provider,
		});

		importCompletedDownload.mockRejectedValue("import exploded");
		handleFailedDownload.mockRejectedValue("handler exploded");

		const { refreshDownloads } = await import("./download-manager");
		await expect(refreshDownloads()).resolves.toEqual({
			success: false,
			message: "Processed 1 downloads: 1 completed, 1 import failures",
		});

		expect(importCompletedDownload).toHaveBeenCalledWith(1);
		expect(handleFailedDownload).toHaveBeenCalledTimes(1);
		expect(logError).toHaveBeenNthCalledWith(
			1,
			"download-manager",
			'Import failed for "Import Failure Book [EPUB]": Unknown error',
			"import exploded",
		);
		expect(logError).toHaveBeenNthCalledWith(
			2,
			"download-manager",
			"Failed download handler error: Unknown error",
			"handler exploded",
		);
		expect(eventEmit).toHaveBeenCalledWith({ type: "queueUpdated" });
	});
});
