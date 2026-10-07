import { eq } from "drizzle-orm";
import {
	downloadClients,
	importReviewItems,
	importSnapshots,
	importSources,
} from "src/db/schema";
import { createSqliteFixture } from "src/test/sqlite-fixture";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ImportSourceKind, RawImportSnapshot } from "./imports/types";

const mocks = vi.hoisted(() => ({
	requireAdmin: vi.fn(),
	sonarr: vi.fn(),
	radarr: vi.fn(),
	readarr: vi.fn(),
	bookshelf: vi.fn(),
}));
vi.mock("@tanstack/react-start", () => ({
	createServerFn: () => ({
		handler: (handler: () => unknown) => handler,
		inputValidator: (validator: (input: unknown) => unknown) => ({
			handler:
				(handler: (input: { data: unknown }) => unknown) =>
				(input: { data: unknown }) =>
					handler({ data: validator(input.data) }),
		}),
	}),
}));
vi.mock("./middleware", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("./imports/connectors/sonarr", () => ({
	fetchSonarrSnapshot: mocks.sonarr,
}));
vi.mock("./imports/connectors/radarr", () => ({
	fetchRadarrSnapshot: mocks.radarr,
}));
vi.mock("./imports/connectors/readarr", () => ({
	fetchReadarrSnapshot: mocks.readarr,
}));
vi.mock("./imports/connectors/bookshelf", () => ({
	fetchBookshelfSnapshot: mocks.bookshelf,
}));
let fixture: ReturnType<typeof createSqliteFixture>;
let source: typeof import("./import-sources");
beforeEach(async () => {
	vi.resetModules();
	vi.resetAllMocks();
	fixture = createSqliteFixture();
	vi.doMock("src/db", () => ({ db: fixture.db }));
	source = await import("./import-sources");
});
afterEach(() => {
	vi.doUnmock("src/db");
	vi.restoreAllMocks();
	fixture.close();
});
async function create(kind: ImportSourceKind = "readarr") {
	return source.createImportSourceFn({
		data: {
			kind,
			label: "Source",
			baseUrl: "http://source.test",
			apiKey: "secret",
		},
	});
}
function snapshot(kind: ImportSourceKind = "readarr"): RawImportSnapshot {
	return {
		kind,
		fetchedAt: "2026-10-01T12:00:00.000Z",
		settings: {
			downloadClients: [
				{ id: 1, name: "Trusted", implementation: "QBittorrent", port: 8080 },
			],
		},
		profiles: [],
		rootFolders: [],
		library: {},
		activity: { history: [], queue: [], blocklist: [] },
	};
}

describe("authenticated Import source callers", () => {
	it("persists CRUD changes while redacting credentials from returned data", async () => {
		const row = await create();
		expect(row).toMatchObject({ hasApiKey: true, lastSyncStatus: "idle" });
		expect(row).not.toHaveProperty("apiKey");
		expect(fixture.db.select().from(importSources).get()?.apiKey).toBe(
			"secret",
		);
		const updated = await source.updateImportSourceFn({
			data: {
				id: row.id,
				kind: "readarr",
				label: "Updated",
				baseUrl: "http://source.test",
				apiKey: "new",
			},
		});
		expect(updated).toMatchObject({ label: "Updated", hasApiKey: true });
		expect(updated).not.toHaveProperty("apiKey");
		const listed = await source.getImportSourcesFn();
		expect(listed[0]).not.toHaveProperty("apiKey");
		await source.deleteImportSourceFn({ data: { id: row.id } });
		expect(await source.getImportSourcesFn()).toEqual([]);
	});
	it.each(["sonarr", "radarr", "readarr", "bookshelf"] as const)(
		"refreshes %s through its existing connector adapter",
		async (kind) => {
			const row = await create(kind);
			mocks[kind].mockResolvedValueOnce(snapshot(kind));
			const refreshed = await source.refreshImportSourceFn({
				data: { id: row.id },
			});
			expect(mocks[kind]).toHaveBeenCalledWith({
				baseUrl: "http://source.test",
				apiKey: "secret",
			});
			expect(fixture.db.select().from(importSnapshots).get()?.payload).toEqual(
				refreshed,
			);
			expect(fixture.db.select().from(importSources).get()).toMatchObject({
				lastSyncStatus: "synced",
				lastSyncError: null,
				lastSyncedAt: new Date("2026-10-01T12:00:00Z"),
			});
		},
	);
	it("records connector errors and preserves the previous snapshot", async () => {
		const row = await create();
		mocks.readarr.mockResolvedValueOnce(snapshot());
		await source.refreshImportSourceFn({ data: { id: row.id } });
		mocks.readarr.mockRejectedValueOnce(new Error("Unavailable"));
		await expect(
			source.refreshImportSourceFn({ data: { id: row.id } }),
		).rejects.toThrow("Unavailable");
		expect(fixture.db.select().from(importSources).get()).toMatchObject({
			lastSyncStatus: "error",
			lastSyncError: "Unavailable",
		});
		expect(fixture.db.select().from(importSnapshots).all()).toHaveLength(1);
		mocks.readarr.mockRejectedValueOnce("non-Error failure");
		await expect(
			source.refreshImportSourceFn({ data: { id: row.id } }),
		).rejects.toBe("non-Error failure");
		expect(fixture.db.select().from(importSources).get()?.lastSyncError).toBe(
			"non-Error failure",
		);
	});
	it("rejects stored unsupported source kinds with a recorded error", async () => {
		const row = await create();
		fixture.db
			.update(importSources)
			.set({ kind: "unknown" })
			.where(eq(importSources.id, row.id))
			.run();
		await expect(
			source.refreshImportSourceFn({ data: { id: row.id } }),
		).rejects.toThrow("Unsupported import source kind");
		expect(fixture.db.select().from(importSources).get()?.lastSyncStatus).toBe(
			"error",
		);
	});
	it("ignores submitted row payloads and applies only the persisted canonical plan", async () => {
		const row = await create();
		mocks.readarr.mockResolvedValueOnce(snapshot());
		await source.refreshImportSourceFn({ data: { id: row.id } });
		const rows = await source.getImportPlanFn({ data: { sourceId: row.id } });
		const first = rows[0];
		if (!first) throw new Error("Missing plan row");
		await source.applyImportPlanFn({
			data: {
				sourceId: row.id,
				selectedRows: [
					{
						sourceKey: first.sourceKey,
						resourceType: "book",
						action: "unsupported",
						payload: { name: "Injected", targetId: 999 },
					},
				],
			},
		});
		expect(fixture.db.select().from(downloadClients).all()).toEqual([
			expect.objectContaining({ name: "Trusted" }),
		]);
		expect(
			await source.getImportReviewFn({ data: { sourceId: row.id } }),
		).toEqual([expect.objectContaining({ action: "skip" })]);
	});
	it("distinguishes absent snapshots from absent sources at the authenticated interface", async () => {
		const row = await create();
		expect(
			await source.getImportPlanFn({ data: { sourceId: row.id } }),
		).toEqual([]);
		expect(
			await source.getImportReviewFn({ data: { sourceId: row.id } }),
		).toEqual([]);
		await expect(
			source.applyImportPlanFn({
				data: { sourceId: row.id, selectedRows: [] },
			}),
		).rejects.toThrow("Import snapshot not found");
		await expect(
			source.refreshImportSourceFn({ data: { id: 999 } }),
		).rejects.toThrow("Import source not found");
	});
	it("resolves review items while preserving payloads unless explicitly replaced", async () => {
		const row = await create();
		const item = fixture.db
			.insert(importReviewItems)
			.values({
				sourceId: row.id,
				sourceKey: "review",
				resourceType: "book",
				payload: { title: "Original" },
			})
			.returning()
			.get();
		await source.resolveImportReviewItemFn({
			data: { id: item.id, status: "resolved" },
		});
		expect(fixture.db.select().from(importReviewItems).get()).toMatchObject({
			status: "resolved",
			payload: { title: "Original" },
		});
		await source.resolveImportReviewItemFn({
			data: {
				id: item.id,
				status: "unresolved",
				payload: { title: "Replacement" },
			},
		});
		expect(fixture.db.select().from(importReviewItems).get()?.payload).toEqual({
			title: "Replacement",
		});
	});
	it("requires admin authorization before every persisted read and mutation", async () => {
		mocks.requireAdmin.mockRejectedValue(new Error("Forbidden"));
		const calls = [
			() => create(),
			() => source.getImportSourcesFn(),
			() =>
				source.updateImportSourceFn({
					data: {
						id: 1,
						kind: "readarr",
						label: "Source",
						baseUrl: "http://source.test",
						apiKey: "secret",
					},
				}),
			() => source.deleteImportSourceFn({ data: { id: 1 } }),
			() => source.refreshImportSourceFn({ data: { id: 1 } }),
			() => source.getImportPlanFn({ data: { sourceId: 1 } }),
			() => source.getImportReviewFn({ data: { sourceId: 1 } }),
			() =>
				source.applyImportPlanFn({ data: { sourceId: 1, selectedRows: [] } }),
			() =>
				source.resolveImportReviewItemFn({
					data: { id: 1, status: "resolved" },
				}),
		];
		for (const call of calls) await expect(call()).rejects.toThrow("Forbidden");
		expect(fixture.db.select().from(importSources).all()).toEqual([]);
	});
});
