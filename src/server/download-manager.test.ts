import { eq } from "drizzle-orm";
import { downloadClients, trackedDownloads } from "src/db/schema";
import { createSqliteFixture } from "src/test/sqlite-fixture";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	getDownloads: vi.fn(),
	removeDownload: vi.fn(),
	importCompletedDownload: vi.fn(),
	handleFailedDownload: vi.fn(),
	emit: vi.fn(),
	fetchQueueItems: vi.fn(),
	logError: vi.fn(),
	logWarn: vi.fn(),
	clientCount: 0,
	completedHandling: true,
}));
vi.mock("./download-clients/registry", () => ({
	default: async () => ({
		getDownloads: mocks.getDownloads,
		removeDownload: mocks.removeDownload,
	}),
}));
vi.mock("./file-import", () => ({
	importCompletedDownload: mocks.importCompletedDownload,
}));
vi.mock("./failed-download-handler", () => ({
	default: mocks.handleFailedDownload,
}));
vi.mock("./event-bus", () => ({
	eventBus: { emit: mocks.emit, getClientCount: () => mocks.clientCount },
}));
vi.mock("./queue", () => ({ fetchQueueItems: mocks.fetchQueueItems }));
vi.mock("./logger", () => ({
	logError: mocks.logError,
	logWarn: mocks.logWarn,
}));
vi.mock("./settings-reader", () => ({
	default: () => mocks.completedHandling,
}));

let fixture: ReturnType<typeof createSqliteFixture>;
let refreshDownloads: typeof import("./download-manager").refreshDownloads;
let clientId: number;

beforeEach(async () => {
	vi.resetAllMocks();
	vi.resetModules();
	mocks.clientCount = 0;
	mocks.completedHandling = true;
	mocks.getDownloads.mockResolvedValue([]);
	mocks.importCompletedDownload.mockResolvedValue({ status: "imported" });
	mocks.handleFailedDownload.mockResolvedValue(undefined);
	mocks.removeDownload.mockResolvedValue(undefined);
	mocks.fetchQueueItems.mockResolvedValue({ items: [], warnings: [] });
	fixture = createSqliteFixture();
	clientId = fixture.db
		.insert(downloadClients)
		.values({
			name: "Test client",
			implementation: "qBittorrent",
			protocol: "torrent",
			port: 8080,
		})
		.returning()
		.get().id;
	vi.doMock("src/db", () => ({ db: fixture.db }));
	({ refreshDownloads } = await import("./download-manager"));
});
afterEach(() => {
	vi.doUnmock("src/db");
	vi.restoreAllMocks();
	fixture.close();
});

function track(state = "completed") {
	return fixture.db
		.insert(trackedDownloads)
		.values({
			downloadClientId: clientId,
			downloadId: "download-1",
			releaseTitle: "A Book",
			protocol: "torrent",
			state,
			outputPath: "/downloads/book",
		})
		.returning()
		.get();
}
function state(id: number) {
	return fixture.db
		.select()
		.from(trackedDownloads)
		.where(eq(trackedDownloads.id, id))
		.get()?.state;
}
function deleteClient() {
	// Historical orphan rows must remain recoverable even without their client.
	fixture.sqlite.pragma("foreign_keys = OFF");
	fixture.db
		.delete(downloadClients)
		.where(eq(downloadClients.id, clientId))
		.run();
}

describe("refreshDownloads", () => {
	it("returns early with no active downloads", async () => {
		track("imported");
		expect(await refreshDownloads()).toEqual({
			success: true,
			message: "No active tracked downloads",
		});
		expect(mocks.getDownloads).not.toHaveBeenCalled();
		expect(mocks.emit).not.toHaveBeenCalled();
	});

	it.each(["queued", "downloading"])(
		"removes a %s download whose client was deleted",
		async (initial) => {
			const row = track(initial);
			deleteClient();
			expect(await refreshDownloads()).toMatchObject({
				success: true,
				message: expect.stringContaining("1 removed"),
			});
			expect(state(row.id)).toBe("removed");
			expect(mocks.importCompletedDownload).not.toHaveBeenCalled();
		},
	);

	it.each(["completed", "importPending"])(
		"delegates missing-client %s recovery to import",
		async (initial) => {
			const row = track(initial);
			deleteClient();
			expect(await refreshDownloads()).toMatchObject({ success: true });
			expect(mocks.importCompletedDownload).toHaveBeenCalledExactlyOnceWith(
				row.id,
			);
			expect(state(row.id)).toBe(initial);
			expect(mocks.removeDownload).not.toHaveBeenCalled();
		},
	);

	it("counts a missing-client failed import from its outcome alone", async () => {
		track();
		deleteClient();
		mocks.importCompletedDownload.mockResolvedValue({
			status: "failed",
			message: "No files",
		});
		expect(await refreshDownloads()).toMatchObject({
			success: false,
			message: expect.stringContaining("1 import failures"),
		});
		expect(mocks.handleFailedDownload).not.toHaveBeenCalled();
	});

	it("keeps a missing-client rejected admission retryable", async () => {
		const row = track();
		deleteClient();
		mocks.importCompletedDownload.mockResolvedValue({
			status: "skipped",
			message: "Claim unavailable",
		});
		expect(await refreshDownloads()).toMatchObject({ success: true });
		expect(state(row.id)).toBe("completed");
	});

	it("removes queued downloads missing from an existing client", async () => {
		const row = track("queued");
		expect(await refreshDownloads()).toMatchObject({
			message: expect.stringContaining("1 removed"),
		});
		expect(state(row.id)).toBe("removed");
	});

	it("updates an active queued download and publishes a queue snapshot to connected clients", async () => {
		const row = track("queued");
		mocks.getDownloads.mockResolvedValue([
			{ id: row.downloadId, isCompleted: false },
		]);
		mocks.clientCount = 1;
		const snapshot = { items: [{ title: "A Book" }], warnings: [] };
		mocks.fetchQueueItems.mockResolvedValue(snapshot);
		expect(await refreshDownloads()).toMatchObject({
			message: expect.stringContaining("1 downloading"),
		});
		expect(state(row.id)).toBe("downloading");
		expect(mocks.emit).toHaveBeenCalledWith({
			type: "queueProgress",
			data: snapshot,
		});
	});

	it("leaves already-downloading work alone", async () => {
		const row = track("downloading");
		mocks.getDownloads.mockResolvedValue([
			{ id: row.downloadId, isCompleted: false },
		]);
		expect(await refreshDownloads()).toMatchObject({
			message: "Checked 1 downloads, no changes",
		});
		expect(state(row.id)).toBe("downloading");
		expect(mocks.importCompletedDownload).not.toHaveBeenCalled();
	});

	it.each(["queued", "downloading"])(
		"recognizes completed %s work before invoking import",
		async (initial) => {
			const row = track(initial);
			mocks.getDownloads.mockResolvedValue([
				{ id: row.downloadId, isCompleted: true, outputPath: "/finished/book" },
			]);
			mocks.importCompletedDownload.mockImplementation(async () => {
				expect(state(row.id)).toBe("completed");
				return { status: "imported" };
			});
			expect(await refreshDownloads()).toMatchObject({
				message: expect.stringContaining("1 completed"),
			});
			expect(mocks.importCompletedDownload).toHaveBeenCalledExactlyOnceWith(
				row.id,
			);
			expect(mocks.emit).toHaveBeenCalledWith({
				type: "downloadCompleted",
				bookId: null,
				title: "A Book",
			});
			expect(mocks.removeDownload).toHaveBeenCalledWith(
				expect.objectContaining({
					implementation: "qBittorrent",
					host: "localhost",
					port: 8080,
				}),
				row.downloadId,
				false,
			);
		},
	);

	it.each(["completed", "importPending"])(
		"uses the import outcome without a %s state reread or caller claim",
		async (initial) => {
			const row = track(initial);
			await refreshDownloads();
			expect(mocks.importCompletedDownload).toHaveBeenCalledExactlyOnceWith(
				row.id,
			);
			expect(mocks.removeDownload).toHaveBeenCalledTimes(1);
			expect(state(row.id)).toBe(initial);
			expect(mocks.emit).toHaveBeenCalledWith({ type: "queueUpdated" });
		},
	);

	it("does not remove imported work when client cleanup is disabled", async () => {
		track();
		fixture.db
			.update(downloadClients)
			.set({ removeCompletedDownloads: false })
			.where(eq(downloadClients.id, clientId))
			.run();
		await refreshDownloads();
		expect(mocks.importCompletedDownload).toHaveBeenCalledTimes(1);
		expect(mocks.removeDownload).not.toHaveBeenCalled();
	});

	it.each([false, true])(
		"leaves recovery untouched when completed handling is disabled (deleted client: %s)",
		async (missingClient) => {
			track();
			if (missingClient) deleteClient();
			mocks.completedHandling = false;
			await refreshDownloads();
			expect(mocks.importCompletedDownload).not.toHaveBeenCalled();
		},
	);

	it("skips client actions after rejected import admission", async () => {
		const row = track();
		mocks.importCompletedDownload.mockResolvedValue({
			status: "skipped",
			message: "Admission unavailable",
		});
		expect(await refreshDownloads()).toMatchObject({ success: true });
		expect(state(row.id)).toBe("completed");
		expect(mocks.removeDownload).not.toHaveBeenCalled();
		expect(mocks.handleFailedDownload).not.toHaveBeenCalled();
	});

	it("uses failure outcomes without recording failure again", async () => {
		const row = track();
		mocks.importCompletedDownload.mockResolvedValue({
			status: "failed",
			message: "No files",
		});
		expect(await refreshDownloads()).toMatchObject({
			success: false,
			message: expect.stringContaining("1 import failures"),
		});
		expect(mocks.handleFailedDownload).toHaveBeenCalledExactlyOnceWith(
			row.id,
			expect.any(Object),
			expect.any(Object),
		);
		expect(state(row.id)).toBe("completed");
		expect(mocks.removeDownload).not.toHaveBeenCalled();
	});

	it.each([new Error("import failed"), "import failed"])(
		"isolates unexpected import failures (%s)",
		async (error) => {
			const row = track();
			mocks.importCompletedDownload.mockRejectedValue(error);
			mocks.handleFailedDownload.mockRejectedValue(error);
			expect(await refreshDownloads()).toMatchObject({ success: false });
			expect(mocks.handleFailedDownload).toHaveBeenCalledTimes(1);
			expect(state(row.id)).toBe("completed");
			expect(mocks.logError).toHaveBeenCalledTimes(2);
			expect(mocks.removeDownload).not.toHaveBeenCalled();
		},
	);

	it.each([new Error("offline"), "offline"])(
		"isolates provider polling errors (%s)",
		async (error) => {
			track();
			mocks.getDownloads.mockRejectedValue(error);
			expect(await refreshDownloads()).toMatchObject({ success: true });
			expect(mocks.logWarn).toHaveBeenCalledWith(
				"download-manager",
				expect.stringContaining(
					error instanceof Error ? "offline" : "Unknown error",
				),
			);
			expect(mocks.importCompletedDownload).not.toHaveBeenCalled();
		},
	);

	it.each([new Error("offline"), "offline"])(
		"isolates provider cleanup errors (%s)",
		async (error) => {
			track();
			mocks.removeDownload.mockRejectedValue(error);
			expect(await refreshDownloads()).toMatchObject({ success: true });
			expect(mocks.logWarn).toHaveBeenCalledWith(
				"download-manager",
				expect.stringContaining(
					error instanceof Error ? "offline" : "Unknown error",
				),
			);
		},
	);
});
