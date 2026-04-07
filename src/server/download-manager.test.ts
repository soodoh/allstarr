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

afterEach(() => {
	vi.resetModules();
	vi.restoreAllMocks();
});

describe("refreshDownloads", () => {
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
});
