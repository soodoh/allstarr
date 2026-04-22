import { beforeEach, describe, expect, it, vi } from "vitest";

const schemaMocks = vi.hoisted(() => ({
	downloadClients: { name: "downloadClients" },
	downloadProfiles: { name: "downloadProfiles" },
	importProvenance: {
		lastImportedAt: "importProvenance.lastImportedAt",
		sourceId: "importProvenance.sourceId",
		sourceKey: "importProvenance.sourceKey",
		targetId: "importProvenance.targetId",
		targetType: "importProvenance.targetType",
	},
	importReviewItems: {
		createdAt: "importReviewItems.createdAt",
		id: "importReviewItems.id",
		payload: "importReviewItems.payload",
		resourceType: "importReviewItems.resourceType",
		sourceId: "importReviewItems.sourceId",
		sourceKey: "importReviewItems.sourceKey",
		status: "importReviewItems.status",
		updatedAt: "importReviewItems.updatedAt",
	},
}));

const mocks = vi.hoisted(() => {
	const provenanceRows: Array<{
		lastImportedAt: Date;
		sourceId: number;
		sourceKey: string;
		targetId: string;
		targetType: string;
	}> = [];
	const reviewRows: Array<{
		createdAt: Date;
		id: number;
		payload: Record<string, unknown>;
		resourceType: string;
		sourceId: number;
		sourceKey: string;
		status: string;
		updatedAt: Date;
	}> = [];
	const upsertSettingValue = vi.fn();
	let nextReviewId = 1;
	let nextDownloadClientId = 101;
	let nextDownloadProfileId = 201;

	const eq = vi.fn((left: unknown, right: unknown) => ({ left, right }));
	const and = vi.fn((...args: unknown[]) => ({ args, type: "and" }));

	const db = {
		insert: vi.fn(),
		select: vi.fn(),
		update: vi.fn(),
	};

	return {
		and,
		db,
		eq,
		nextDownloadClientIdRef: {
			get value() {
				return nextDownloadClientId;
			},
			set value(value: number) {
				nextDownloadClientId = value;
			},
		},
		nextDownloadProfileIdRef: {
			get value() {
				return nextDownloadProfileId;
			},
			set value(value: number) {
				nextDownloadProfileId = value;
			},
		},
		nextReviewIdRef: {
			get value() {
				return nextReviewId;
			},
			set value(value: number) {
				nextReviewId = value;
			},
		},
		provenanceRows,
		reviewRows,
		upsertSettingValue,
	};
});

vi.mock("drizzle-orm", () => ({
	and: mocks.and,
	eq: mocks.eq,
}));

vi.mock("src/db", () => ({
	db: mocks.db,
}));

vi.mock("src/db/schema", () => schemaMocks);

vi.mock("../settings-store", () => ({
	upsertSettingValue: mocks.upsertSettingValue,
}));

import { applyImportPlan } from "./apply";

function installDbMocks() {
	mocks.db.insert.mockImplementation((table: unknown) => {
		return {
			values: vi.fn((values: Record<string, unknown>) => {
				if (table === schemaMocks.downloadClients) {
					return {
						returning: vi.fn(() => ({
							get: vi.fn(() => ({
								...values,
								id: mocks.nextDownloadClientIdRef.value,
							})),
						})),
					};
				}

				if (table === schemaMocks.downloadProfiles) {
					return {
						returning: vi.fn(() => ({
							get: vi.fn(() => ({
								...values,
								id: mocks.nextDownloadProfileIdRef.value,
							})),
						})),
					};
				}

				if (table === schemaMocks.importProvenance) {
					mocks.provenanceRows.push({
						lastImportedAt: values.lastImportedAt as Date,
						sourceId: values.sourceId as number,
						sourceKey: values.sourceKey as string,
						targetId: values.targetId as string,
						targetType: values.targetType as string,
					});
					return {
						onConflictDoUpdate: vi.fn(() => ({
							run: vi.fn(() => undefined),
						})),
					};
				}

				if (table === schemaMocks.importReviewItems) {
					const row = {
						createdAt: values.createdAt as Date,
						id: mocks.nextReviewIdRef.value,
						payload: values.payload as Record<string, unknown>,
						resourceType: values.resourceType as string,
						sourceId: values.sourceId as number,
						sourceKey: values.sourceKey as string,
						status: values.status as string,
						updatedAt: values.updatedAt as Date,
					};
					mocks.reviewRows.push(row);
					mocks.nextReviewIdRef.value += 1;
					return {
						run: vi.fn(() => undefined),
					};
				}

				return {
					run: vi.fn(() => undefined),
				};
			}),
		};
	});

	mocks.db.select.mockImplementation(() => ({
		from: vi.fn(() => ({
			where: vi.fn(() => ({
				get: vi.fn(() => undefined),
			})),
		})),
	}));

	mocks.db.update.mockImplementation(() => ({
		set: vi.fn(() => ({
			where: vi.fn(() => ({
				run: vi.fn(() => undefined),
			})),
		})),
	}));
}

describe("applyImportPlan", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.provenanceRows.splice(0, mocks.provenanceRows.length);
		mocks.reviewRows.splice(0, mocks.reviewRows.length);
		mocks.nextDownloadClientIdRef.value = 101;
		mocks.nextDownloadProfileIdRef.value = 201;
		mocks.nextReviewIdRef.value = 1;
		installDbMocks();
	});

	it("imports supported settings and profiles in dependency order and writes provenance rows", async () => {
		const result = await applyImportPlan({
			sourceId: 7,
			selectedRows: [
				{
					sourceKey: "radarr:7:profile:uhd",
					resourceType: "profile",
					action: "create",
					payload: {
						profileKind: "quality",
						raw: {
							categories: [],
							contentType: "movie",
							cutoff: 0,
							icon: "film",
							id: 4,
							items: [[1]],
							language: "en",
							minCustomFormatScore: 0,
							name: "UHD",
							rootFolderPath: "/movies-4k",
							upgradeAllowed: false,
							upgradeUntilCustomFormatScore: 0,
						},
					},
				},
				{
					sourceKey: "radarr:7:setting:download-client",
					resourceType: "setting",
					action: "create",
					payload: {
						group: "download-client",
						raw: {
							apiKey: "abc",
							category: "allstarr",
							enabled: true,
							host: "localhost",
							id: 5,
							implementation: "qBittorrent",
							name: "qBittorrent",
							password: null,
							port: 8080,
							protocol: "torrent",
							priority: 1,
							removeCompletedDownloads: true,
							settings: {},
							tag: null,
							urlBase: null,
							useSsl: false,
							username: null,
						},
					},
				},
				{
					sourceKey: "radarr:7:profile:metadata",
					resourceType: "profile",
					action: "create",
					payload: {
						profileKind: "metadata",
						raw: {
							minimumPages: 0,
							minimumPopularity: 10,
							skipCompilations: false,
							skipMissingIsbnAsin: true,
							skipMissingReleaseDate: false,
						},
					},
				},
			],
		});

		expect(result).toEqual({ appliedCount: 3, reviewCount: 0 });
		expect(mocks.upsertSettingValue).toHaveBeenCalledWith(
			"metadata.hardcover.profile",
			{
				minimumPages: 0,
				minimumPopularity: 10,
				skipCompilations: false,
				skipMissingIsbnAsin: true,
				skipMissingReleaseDate: false,
			},
		);
		expect(mocks.provenanceRows.map((row) => row.sourceKey)).toEqual([
			"radarr:7:setting:download-client",
			"radarr:7:profile:uhd",
			"radarr:7:profile:metadata",
		]);
		expect(mocks.provenanceRows[0]).toMatchObject({
			sourceId: 7,
			targetType: "download-client",
			targetId: "101",
		});
		expect(mocks.provenanceRows[1]).toMatchObject({
			sourceId: 7,
			targetType: "download-profile",
			targetId: "201",
		});
		expect(mocks.provenanceRows[2]).toMatchObject({
			sourceId: 7,
			targetType: "metadata-profile",
			targetId: "metadata.hardcover.profile",
		});
	});

	it("persists unresolved rows as review items and does not count them as applied", async () => {
		const result = await applyImportPlan({
			sourceId: 3,
			selectedRows: [
				{
					sourceKey: "sonarr:3:show:55",
					resourceType: "show",
					action: "unresolved",
					payload: { reason: "No confident TMDB match", title: "Unknown Show" },
				},
			],
		});

		expect(result).toEqual({ appliedCount: 0, reviewCount: 1 });
		expect(mocks.reviewRows).toHaveLength(1);
		expect(mocks.reviewRows[0]).toMatchObject({
			sourceId: 3,
			sourceKey: "sonarr:3:show:55",
			resourceType: "show",
			status: "unresolved",
			payload: {
				reason: "No confident TMDB match",
				title: "Unknown Show",
			},
		});
		expect(mocks.provenanceRows).toHaveLength(0);
	});
});
