import {
	downloadClients,
	downloadProfiles,
	importProvenance,
	importReviewItems,
	importSources,
	settings,
} from "src/db/schema";
import { createSqliteFixture } from "src/test/sqlite-fixture";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ApplyImportPlanRow } from "./apply";

let fixture: ReturnType<typeof createSqliteFixture>;
let applyImportPlan: typeof import("./apply").applyImportPlan;
let sourceId: number;
beforeEach(async () => {
	vi.resetModules();
	fixture = createSqliteFixture();
	fixture.db.delete(downloadProfiles).run();
	sourceId = fixture.db
		.insert(importSources)
		.values({
			kind: "radarr",
			label: "Test",
			baseUrl: "http://source.test",
			apiKey: "test",
		})
		.returning()
		.get().id;
	vi.doMock("src/db", () => ({ db: fixture.db }));
	({ applyImportPlan } = await import("./apply"));
});
afterEach(() => {
	vi.doUnmock("src/db");
	vi.restoreAllMocks();
	fixture.close();
});
function apply(selectedRows: ApplyImportPlanRow[]) {
	return applyImportPlan({ sourceId, selectedRows });
}
function clientRow(name = "Client", action = "create"): ApplyImportPlanRow {
	return {
		action,
		sourceKey: "client",
		resourceType: "setting",
		payload: {
			group: "download-client",
			raw: {
				id: 999,
				name,
				implementation: "qBittorrent",
				protocol: "torrent",
				port: 8080,
				settings: { ratio: 2 },
			},
		},
	};
}
function profileRow(name = "Profile", action = "create"): ApplyImportPlanRow {
	return {
		action,
		sourceKey: "profile",
		resourceType: "profile",
		payload: {
			profileKind: "quality",
			raw: { id: 999, name, contentType: "movie", items: [[1]], cutoff: 1 },
		},
	};
}
function provenance(sourceKey: string, targetType: string, targetId: string) {
	fixture.db
		.insert(importProvenance)
		.values({ sourceId, sourceKey, targetType, targetId })
		.run();
}

describe("Import plan canonical application", () => {
	it("creates then updates supported targets without copying external IDs or duplicating provenance", async () => {
		expect(await apply([profileRow(), clientRow()])).toEqual({
			appliedCount: 2,
			reviewCount: 0,
		});
		const before = fixture.db.select().from(downloadClients).get();
		expect(before?.id).not.toBe(999);
		expect(
			await apply([
				clientRow("Updated", "update"),
				profileRow("Updated profile", "update"),
			]),
		).toEqual({ appliedCount: 2, reviewCount: 0 });
		expect(fixture.db.select().from(downloadClients).all()).toEqual([
			expect.objectContaining({
				id: before?.id,
				name: "Updated",
				settings: { ratio: 2 },
				createdAt: before?.createdAt,
			}),
		]);
		expect(fixture.db.select().from(downloadProfiles).all()).toEqual([
			expect.objectContaining({ name: "Updated profile" }),
		]);
		expect(fixture.db.select().from(importProvenance).all()).toHaveLength(2);
	});
	it("orders clients before quality profiles before metadata profiles regardless of selection order", async () => {
		fixture.sqlite.exec(
			"CREATE TRIGGER require_client BEFORE INSERT ON download_profiles WHEN (SELECT COUNT(*) FROM download_clients) = 0 BEGIN SELECT RAISE(ABORT, 'missing client'); END;",
		);
		fixture.sqlite.exec(
			"CREATE TRIGGER require_profile BEFORE INSERT ON settings WHEN NEW.key = 'metadata.hardcover.profile' AND (SELECT COUNT(*) FROM download_profiles) = 0 BEGIN SELECT RAISE(ABORT, 'missing profile'); END;",
		);
		const metadata: ApplyImportPlanRow = {
			action: "create",
			resourceType: "profile",
			sourceKey: "metadata",
			payload: { profileKind: "metadata", raw: { minimumPopularity: 10 } },
		};
		expect(await apply([metadata, profileRow(), clientRow()])).toEqual({
			appliedCount: 3,
			reviewCount: 0,
		});
		await apply([
			{
				...metadata,
				payload: { profileKind: "metadata", mapped: { minimumPopularity: 20 } },
			},
		]);
		expect(fixture.db.select().from(settings).all()).toContainEqual(
			expect.objectContaining({
				key: "metadata.hardcover.profile",
				value: '{"minimumPopularity":20}',
			}),
		);
		expect(fixture.db.select().from(importProvenance).all()).toContainEqual(
			expect.objectContaining({
				sourceKey: "metadata",
				targetId: "metadata.hardcover.profile",
			}),
		);
	});
	it("uses mapped, raw and top-level payloads and normalizes absent client settings", async () => {
		const base = clientRow();
		expect(
			await apply([
				{
					...base,
					sourceKey: "mapped",
					payload: {
						group: "download-client",
						raw: {},
						mapped: {
							name: "Mapped",
							implementation: "qBittorrent",
							protocol: "torrent",
							port: 8080,
							settings: { ratio: 1 },
						},
					},
				},
				{
					...base,
					sourceKey: "top",
					payload: {
						group: "download-client",
						name: "Top",
						implementation: "Nzbget",
						protocol: "usenet",
						port: 6789,
						settings: [],
					},
				},
				{
					...profileRow(),
					sourceKey: "mapped-profile",
					payload: {
						profileKind: "quality",
						mapped: { name: "Mapped profile" },
					},
				},
			]),
		).toEqual({ appliedCount: 3, reviewCount: 0 });
		expect(fixture.db.select().from(downloadClients).all()).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ name: "Mapped", settings: { ratio: 1 } }),
				expect.objectContaining({ name: "Top", settings: null }),
			]),
		);
	});
	it.each(["download-client", "download-profile"])(
		"reviews a missing %s update instead of creating a replacement",
		async (targetType) => {
			const row =
				targetType === "download-client"
					? clientRow("Missing", "update")
					: profileRow("Missing", "update");
			provenance(row.sourceKey, targetType, "999");
			expect(await apply([row])).toEqual({ appliedCount: 0, reviewCount: 1 });
			expect(fixture.db.select().from(downloadClients).all()).toEqual([]);
			expect(fixture.db.select().from(downloadProfiles).all()).toEqual([]);
			expect(fixture.db.select().from(importReviewItems).get()?.sourceKey).toBe(
				row.sourceKey,
			);
		},
	);
	it.each(["download-client", "download-profile"])(
		"ignores nonnumeric or mismatched %s provenance",
		async (targetType) => {
			const row = targetType === "download-client" ? clientRow() : profileRow();
			provenance(row.sourceKey, targetType, "invalid");
			expect(await apply([row])).toEqual({ appliedCount: 1, reviewCount: 0 });
			const wrong = { ...row, sourceKey: "wrong-type" };
			provenance(wrong.sourceKey, "book", "1");
			expect(await apply([wrong])).toEqual({ appliedCount: 1, reviewCount: 0 });
		},
	);
	it("records explicit numeric and string library targets and reviews absent targets", async () => {
		const rows: ApplyImportPlanRow[] = ["movie", "show", "book"].flatMap(
			(resourceType) => [
				{
					resourceType,
					sourceKey: `${resourceType}-numeric`,
					action: "update",
					payload: { targetId: 10 },
				},
				{
					resourceType,
					sourceKey: `${resourceType}-string`,
					action: "create",
					payload: { targetId: " external-id " },
				},
				{
					resourceType,
					sourceKey: `${resourceType}-missing`,
					action: "create",
					payload: { targetId: " " },
				},
			],
		);
		expect(await apply(rows)).toEqual({ appliedCount: 6, reviewCount: 3 });
		expect(
			fixture.db
				.select()
				.from(importProvenance)
				.all()
				.map((row) => row.targetId),
		).toEqual(["10", "external-id", "10", "external-id", "10", "external-id"]);
	});
	it("updates review payloads without changing row identity and skips already imported rows", async () => {
		const row: ApplyImportPlanRow = {
			sourceKey: "review",
			resourceType: "show",
			action: "unresolved",
			payload: { title: "Old" },
		};
		await apply([row]);
		const before = fixture.db.select().from(importReviewItems).get();
		expect(
			await apply([
				{ ...row, payload: { title: "Updated" } },
				{ ...clientRow(), action: "skip" },
			]),
		).toEqual({ appliedCount: 0, reviewCount: 1 });
		expect(fixture.db.select().from(importReviewItems).all()).toEqual([
			expect.objectContaining({
				id: before?.id,
				payload: { title: "Updated" },
			}),
		]);
		expect(fixture.db.select().from(downloadClients).all()).toEqual([]);
	});
	it("reviews unsupported settings, profiles, resources and actions without applying them", async () => {
		const rows: ApplyImportPlanRow[] = [
			{
				sourceKey: "same",
				resourceType: "setting",
				action: "create",
				payload: { group: "notifications" },
			},
			{
				sourceKey: "same",
				resourceType: "profile",
				action: "create",
				payload: { profileKind: "unknown" },
			},
			{
				sourceKey: "queue",
				resourceType: "queue",
				action: "unsupported",
				payload: {},
			},
			{
				sourceKey: "unknown",
				resourceType: "unknown",
				action: "create",
				payload: {},
			},
			{ ...profileRow(), action: "link" },
		];
		expect(await apply(rows)).toEqual({ appliedCount: 0, reviewCount: 5 });
		expect(fixture.db.select().from(importReviewItems).all()).toHaveLength(4);
		expect(fixture.db.select().from(downloadProfiles).all()).toEqual([]);
	});
	it("rolls back target and provenance writes when a later write fails", async () => {
		fixture.sqlite.exec(
			"CREATE TRIGGER fail_profile BEFORE INSERT ON download_profiles BEGIN SELECT RAISE(ABORT, 'failed profile'); END;",
		);
		await expect(apply([clientRow(), profileRow()])).rejects.toThrow(
			"failed profile",
		);
		expect(fixture.db.select().from(downloadClients).all()).toEqual([]);
		expect(fixture.db.select().from(importProvenance).all()).toEqual([]);
	});
});
