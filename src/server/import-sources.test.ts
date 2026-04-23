import { beforeEach, describe, expect, it, vi } from "vitest";

const schemaMocks = vi.hoisted(() => ({
	importProvenance: {
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
	importSnapshots: {
		fetchedAt: "importSnapshots.fetchedAt",
		payload: "importSnapshots.payload",
		sourceId: "importSnapshots.sourceId",
	},
	importSources: {
		apiKey: "importSources.apiKey",
		baseUrl: "importSources.baseUrl",
		createdAt: "importSources.createdAt",
		id: "importSources.id",
		kind: "importSources.kind",
		label: "importSources.label",
		lastSyncError: "importSources.lastSyncError",
		lastSyncedAt: "importSources.lastSyncedAt",
		lastSyncStatus: "importSources.lastSyncStatus",
		updatedAt: "importSources.updatedAt",
	},
}));

const mocks = vi.hoisted(() => {
	const rows: Array<{
		apiKey: string;
		baseUrl: string;
		createdAt: Date;
		id: number;
		kind: string;
		label: string;
		lastSyncError: string | null;
		lastSyncedAt: Date | null;
		lastSyncStatus: string;
		updatedAt: Date;
	}> = [];
	const snapshots: Array<{
		fetchedAt: Date;
		id: number;
		payload: Record<string, unknown>;
		sourceId: number;
	}> = [];
	const provenance: Array<{
		lastImportedAt: Date;
		sourceId: number;
		sourceKey: string;
		targetId: string;
		targetType: string;
	}> = [];
	const reviewItems: Array<{
		createdAt: Date;
		id: number;
		payload: Record<string, unknown>;
		resourceType: string;
		sourceId: number;
		sourceKey: string;
		status: string;
		updatedAt: Date;
	}> = [];

	let nextSourceId = 1;
	let nextSnapshotId = 1;
	let nextReviewItemId = 1;

	const requireAdmin = vi.fn();
	const select = vi.fn();
	const insert = vi.fn();
	const update = vi.fn();
	const deleteFn = vi.fn();
	const fetchSonarrSnapshot = vi.fn();
	const fetchRadarrSnapshot = vi.fn();
	const fetchReadarrSnapshot = vi.fn();
	const fetchBookshelfSnapshot = vi.fn();
	const normalizeImportSnapshot = vi.fn();
	const applyImportPlan = vi.fn();

	return {
		applyImportPlan,
		deleteFn,
		fetchBookshelfSnapshot,
		fetchRadarrSnapshot,
		fetchReadarrSnapshot,
		fetchSonarrSnapshot,
		insert,
		nextReviewItemIdRef: {
			get value() {
				return nextReviewItemId;
			},
			set value(value: number) {
				nextReviewItemId = value;
			},
		},
		nextSnapshotIdRef: {
			get value() {
				return nextSnapshotId;
			},
			set value(value: number) {
				nextSnapshotId = value;
			},
		},
		nextSourceIdRef: {
			get value() {
				return nextSourceId;
			},
			set value(value: number) {
				nextSourceId = value;
			},
		},
		normalizeImportSnapshot,
		requireAdmin,
		provenance,
		reviewItems,
		rows,
		select,
		snapshots,
		update,
	};
});

vi.mock("@tanstack/react-start", () => ({
	createServerFn: () => ({
		handler: (handler: (...args: unknown[]) => unknown) => handler,
		inputValidator: (validator: (input: unknown) => unknown) => ({
			handler:
				(handler: (input: { data: unknown }) => unknown) =>
				(input: { data: unknown }) =>
					handler({ data: validator(input.data) }),
		}),
	}),
}));

vi.mock("drizzle-orm", () => ({
	and: vi.fn((...args: unknown[]) => ({ args, type: "and" })),
	eq: vi.fn((left: unknown, right: unknown) => ({ left, right, type: "eq" })),
}));

vi.mock("src/db", () => ({
	db: {
		delete: (...args: unknown[]) => mocks.deleteFn(...args),
		insert: (...args: unknown[]) => mocks.insert(...args),
		select: (...args: unknown[]) => mocks.select(...args),
		update: (...args: unknown[]) => mocks.update(...args),
	},
}));

vi.mock("src/db/schema", () => schemaMocks);

vi.mock("src/lib/validators", () => ({
	applyImportPlanSchema: { parse: (data: unknown) => data },
	createImportSourceSchema: { parse: (data: unknown) => data },
	deleteImportSourceSchema: { parse: (data: unknown) => data },
	refreshImportSourceSchema: { parse: (data: unknown) => data },
	resolveImportReviewItemSchema: { parse: (data: unknown) => data },
	updateImportSourceSchema: { parse: (data: unknown) => data },
}));

vi.mock("./imports/apply", () => ({
	applyImportPlan: mocks.applyImportPlan,
}));

vi.mock("./imports/connectors/bookshelf", () => ({
	fetchBookshelfSnapshot: mocks.fetchBookshelfSnapshot,
}));

vi.mock("./imports/connectors/radarr", () => ({
	fetchRadarrSnapshot: mocks.fetchRadarrSnapshot,
}));

vi.mock("./imports/connectors/readarr", () => ({
	fetchReadarrSnapshot: mocks.fetchReadarrSnapshot,
}));

vi.mock("./imports/connectors/sonarr", () => ({
	fetchSonarrSnapshot: mocks.fetchSonarrSnapshot,
}));

vi.mock("./imports/normalize", () => ({
	normalizeImportSnapshot: mocks.normalizeImportSnapshot,
}));

vi.mock("./middleware", () => ({
	requireAdmin: mocks.requireAdmin,
}));

import {
	applyImportPlanFn,
	createImportSourceFn,
	deleteImportSourceFn,
	getImportPlanFn,
	getImportReviewFn,
	getImportSourcesFn,
	refreshImportSourceFn,
	resolveImportReviewItemFn,
	updateImportSourceFn,
} from "./import-sources";

function resetState() {
	mocks.rows.splice(0, mocks.rows.length);
	mocks.provenance.splice(0, mocks.provenance.length);
	mocks.snapshots.splice(0, mocks.snapshots.length);
	mocks.reviewItems.splice(0, mocks.reviewItems.length);
	mocks.nextSourceIdRef.value = 1;
	mocks.nextSnapshotIdRef.value = 1;
	mocks.nextReviewItemIdRef.value = 1;
}

function installDbMocks() {
	mocks.select.mockImplementation(() => ({
		from: (table: unknown) => {
			if (table === schemaMocks.importSources) {
				return {
					get: vi.fn((condition?: { right: number }) =>
						condition
							? mocks.rows.find((row) => row.id === condition.right)
							: undefined,
					),
					where: vi.fn((condition: { right: number }) => ({
						get: vi.fn(() =>
							mocks.rows.find((row) => row.id === condition.right),
						),
					})),
					orderBy: vi.fn(() => ({
						all: vi.fn(() =>
							[...mocks.rows].sort((left, right) =>
								left.label.localeCompare(right.label),
							),
						),
					})),
				};
			}

			if (table === schemaMocks.importReviewItems) {
				return {
					all: vi.fn(() =>
						[...mocks.reviewItems].sort(
							(left, right) =>
								right.updatedAt.getTime() - left.updatedAt.getTime() ||
								right.createdAt.getTime() - left.createdAt.getTime() ||
								right.id - left.id,
						),
					),
					get: vi.fn((condition?: { right: number }) =>
						condition
							? mocks.reviewItems.find((row) => row.id === condition.right)
							: undefined,
					),
					where: vi.fn((condition: { right: number }) => ({
						all: vi.fn(() =>
							mocks.reviewItems.filter(
								(row) => row.sourceId === condition.right,
							),
						),
					})),
				};
			}

			if (table === schemaMocks.importSnapshots) {
				return {
					all: vi.fn(() => [...mocks.snapshots]),
					where: vi.fn((condition: { right: number }) => ({
						all: vi.fn(() =>
							mocks.snapshots.filter((row) => row.sourceId === condition.right),
						),
					})),
				};
			}

			if (table === schemaMocks.importProvenance) {
				return {
					where: vi.fn((condition: { args?: Array<{ right: unknown }> }) => ({
						all: vi.fn(() => {
							const [sourceIdCondition, sourceKeyCondition] =
								condition.args ?? [];
							const sourceId =
								typeof sourceIdCondition?.right === "number"
									? sourceIdCondition.right
									: undefined;
							const sourceKey =
								typeof sourceKeyCondition?.right === "string"
									? sourceKeyCondition.right
									: undefined;
							return mocks.provenance.filter((row) => {
								if (sourceId !== undefined && row.sourceId !== sourceId) {
									return false;
								}
								if (sourceKey !== undefined && row.sourceKey !== sourceKey) {
									return false;
								}
								return true;
							});
						}),
					})),
				};
			}

			return {
				get: vi.fn(() => undefined),
				all: vi.fn(() => []),
				orderBy: vi.fn(() => ({ all: vi.fn(() => []) })),
				where: vi.fn(() => ({ get: vi.fn(() => undefined), run: vi.fn() })),
			};
		},
	}));

	mocks.insert.mockImplementation((table: unknown) => ({
		values: vi.fn((data: Record<string, unknown>) => {
			if (table === schemaMocks.importSources) {
				return {
					returning: vi.fn(() => ({
						get: vi.fn(() => {
							const row = {
								...data,
								id: mocks.nextSourceIdRef.value,
								lastSyncError: null,
								lastSyncedAt: null,
							};
							mocks.nextSourceIdRef.value += 1;
							mocks.rows.push(row as (typeof mocks.rows)[number]);
							return row;
						}),
					})),
				};
			}

			if (table === schemaMocks.importSnapshots) {
				return {
					run: vi.fn(() => {
						mocks.snapshots.push({
							fetchedAt: data.fetchedAt as Date,
							id: mocks.nextSnapshotIdRef.value,
							payload: data.payload as Record<string, unknown>,
							sourceId: data.sourceId as number,
						});
						mocks.nextSnapshotIdRef.value += 1;
					}),
				};
			}

			if (table === schemaMocks.importReviewItems) {
				return {
					run: vi.fn(() => {
						mocks.reviewItems.push({
							createdAt: data.createdAt as Date,
							id: mocks.nextReviewItemIdRef.value,
							payload: data.payload as Record<string, unknown>,
							resourceType: data.resourceType as string,
							sourceId: data.sourceId as number,
							sourceKey: data.sourceKey as string,
							status: data.status as string,
							updatedAt: data.updatedAt as Date,
						});
						mocks.nextReviewItemIdRef.value += 1;
					}),
				};
			}

			if (table === schemaMocks.importProvenance) {
				return {
					run: vi.fn(() => {
						mocks.provenance.push({
							lastImportedAt: data.lastImportedAt as Date,
							sourceId: data.sourceId as number,
							sourceKey: data.sourceKey as string,
							targetId: data.targetId as string,
							targetType: data.targetType as string,
						});
					}),
				};
			}

			return {
				run: vi.fn(() => undefined),
				returning: vi.fn(() => ({
					get: vi.fn(() => data),
				})),
			};
		}),
	}));

	mocks.update.mockImplementation((table: unknown) => ({
		set: vi.fn((values: Record<string, unknown>) => ({
			where: vi.fn((condition: { right: number }) => {
				if (table === schemaMocks.importSources) {
					return {
						returning: vi.fn(() => ({
							get: vi.fn(() => {
								const index = mocks.rows.findIndex(
									(row) => row.id === condition.right,
								);
								const existing = mocks.rows[index];
								const updated = {
									...existing,
									...values,
								};
								mocks.rows[index] = updated as (typeof mocks.rows)[number];
								return updated;
							}),
						})),
					};
				}

				if (table === schemaMocks.importReviewItems) {
					return {
						run: vi.fn(() => {
							const index = mocks.reviewItems.findIndex(
								(row) => row.id === condition.right,
							);
							const existing = mocks.reviewItems[index];
							mocks.reviewItems[index] = {
								...existing,
								payload:
									(values.payload as Record<string, unknown>) ??
									existing.payload,
								status: (values.status as string) ?? existing.status,
								updatedAt: (values.updatedAt as Date) ?? existing.updatedAt,
							};
						}),
					};
				}

				return {
					run: vi.fn(() => undefined),
					returning: vi.fn(() => ({
						get: vi.fn(() => values),
					})),
				};
			}),
		})),
	}));

	mocks.deleteFn.mockImplementation(() => ({
		where: vi.fn((condition: { right: number }) => ({
			run: vi.fn(() => {
				const index = mocks.rows.findIndex((row) => row.id === condition.right);
				if (index >= 0) {
					mocks.rows.splice(index, 1);
				}
			}),
		})),
	}));
}

describe("import source CRUD and refresh", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		resetState();
		installDbMocks();
		mocks.requireAdmin.mockResolvedValue({ user: { id: 1, role: "admin" } });
	});

	it("creates, lists, updates, and deletes a source", async () => {
		const created = await createImportSourceFn({
			data: {
				apiKey: "secret",
				baseUrl: "http://localhost:7878",
				kind: "radarr",
				label: "Radarr 4K",
			},
		});

		expect(created.lastSyncStatus).toBe("idle");
		expect(created).not.toHaveProperty("apiKey");
		expect(created.hasApiKey).toBe(true);

		const listed = await getImportSourcesFn();
		expect(listed).toHaveLength(1);
		expect(listed[0]).not.toHaveProperty("apiKey");
		expect(listed[0]?.hasApiKey).toBe(true);

		const updated = await updateImportSourceFn({
			data: {
				apiKey: "secret-2",
				baseUrl: "http://localhost:7878",
				id: created.id,
				kind: "radarr",
				label: "Radarr UHD",
			},
		});

		expect(updated.label).toBe("Radarr UHD");
		expect(updated).not.toHaveProperty("apiKey");
		expect(updated.hasApiKey).toBe(true);

		await deleteImportSourceFn({ data: { id: created.id } });
		await expect(getImportSourcesFn()).resolves.toEqual([]);
		expect(mocks.requireAdmin).toHaveBeenCalledTimes(5);
	});

	it("refreshes a source, stores a normalized snapshot, and updates sync status", async () => {
		mocks.rows.push({
			apiKey: "sonarr-key",
			baseUrl: "http://localhost:8989",
			createdAt: new Date("2026-04-21T00:00:00.000Z"),
			id: 1,
			kind: "sonarr",
			label: "Sonarr",
			lastSyncError: null,
			lastSyncedAt: null,
			lastSyncStatus: "idle",
			updatedAt: new Date("2026-04-21T00:00:00.000Z"),
		});

		const rawSnapshot = {
			fetchedAt: "2026-04-21T12:00:00.000Z",
			kind: "sonarr" as const,
			settings: { naming: { renameEpisodes: true } },
			rootFolders: [{ id: 1, path: "/tv" }],
			profiles: [{ id: 2, name: "HD-1080p" }],
			library: { series: [{ id: 3, title: "Andor", tmdbId: 1 }] },
			activity: { history: [], queue: [], blocklist: [] },
		};
		const normalizedSnapshot = {
			activity: { blocklist: [], history: [], queue: [] },
			fetchedAt: rawSnapshot.fetchedAt,
			kind: "sonarr" as const,
			library: { books: [], movies: [], shows: [] },
			settings: {
				items: [],
				metadataProfiles: [],
				qualityProfiles: [],
			},
			sourceId: 1,
			unsupported: [],
		};

		mocks.fetchSonarrSnapshot.mockResolvedValue(rawSnapshot);
		mocks.normalizeImportSnapshot.mockReturnValue(normalizedSnapshot);

		const result = await refreshImportSourceFn({ data: { id: 1 } });

		expect(result).toEqual(normalizedSnapshot);
		expect(mocks.fetchSonarrSnapshot).toHaveBeenCalledWith({
			apiKey: "sonarr-key",
			baseUrl: "http://localhost:8989",
		});
		expect(mocks.normalizeImportSnapshot).toHaveBeenCalledWith({
			kind: "sonarr",
			snapshot: rawSnapshot,
			sourceId: 1,
		});
		expect(mocks.snapshots).toHaveLength(1);
		expect(mocks.snapshots[0]).toMatchObject({
			payload: normalizedSnapshot,
			sourceId: 1,
		});
		expect(mocks.rows[0]).toMatchObject({
			lastSyncError: null,
			lastSyncedAt: new Date("2026-04-21T12:00:00.000Z"),
			lastSyncStatus: "synced",
		});
	});

	it("loads the latest snapshot and maps provenance target labels in the plan", async () => {
		mocks.rows.push({
			apiKey: "radarr-key",
			baseUrl: "http://localhost:7878",
			createdAt: new Date("2026-04-21T00:00:00.000Z"),
			id: 1,
			kind: "radarr",
			label: "Radarr",
			lastSyncError: null,
			lastSyncedAt: new Date("2026-04-21T12:00:00.000Z"),
			lastSyncStatus: "synced",
			updatedAt: new Date("2026-04-21T00:00:00.000Z"),
		});
		mocks.snapshots.push(
			{
				fetchedAt: new Date("2026-04-21T10:00:00.000Z"),
				id: 1,
				payload: {
					activity: { blocklist: [], history: [], queue: [] },
					fetchedAt: "2026-04-21T10:00:00.000Z",
					kind: "radarr",
					library: { books: [], movies: [], shows: [] },
					settings: {
						items: [
							{
								action: "create",
								payload: { group: "download-client", raw: { name: "Old" } },
								resourceType: "setting",
								selectable: true,
								sourceId: 1,
								sourceKey: "radarr:1:setting:old",
								title: "Old",
								warning: null,
							},
						],
						metadataProfiles: [],
						qualityProfiles: [],
					},
					sourceId: 1,
					unsupported: [],
				},
				sourceId: 1,
			},
			{
				fetchedAt: new Date("2026-04-21T12:00:00.000Z"),
				id: 2,
				payload: {
					activity: { blocklist: [], history: [], queue: [] },
					fetchedAt: "2026-04-21T12:00:00.000Z",
					kind: "radarr",
					library: { books: [], movies: [], shows: [] },
					settings: {
						items: [
							{
								action: "skip",
								payload: { group: "download-client", raw: { name: "New" } },
								resourceType: "setting",
								selectable: false,
								sourceId: 1,
								sourceKey: "radarr:1:setting:new",
								title: "New",
								warning: "Already imported from this source",
							},
						],
						metadataProfiles: [],
						qualityProfiles: [],
					},
					sourceId: 1,
					unsupported: [],
				},
				sourceId: 1,
			},
		);
		mocks.provenance.push({
			lastImportedAt: new Date("2026-04-21T12:30:00.000Z"),
			sourceId: 1,
			sourceKey: "radarr:1:setting:new",
			targetId: "201",
			targetType: "download-profile",
		});

		const plan = await getImportPlanFn({ data: { sourceId: 1 } });

		expect(plan).toEqual([
			expect.objectContaining({
				action: "skip",
				section: "settings",
				sourceId: 1,
				sourceKey: "radarr:1:setting:new",
				targetId: 201,
				targetLabel: "Download profile",
			}),
		]);
		expect(plan).not.toEqual(
			expect.arrayContaining([
				expect.objectContaining({ sourceKey: "radarr:1:setting:old" }),
			]),
		);
	});

	it("serializes review rows with stable dates and source labels", async () => {
		mocks.rows.push({
			apiKey: "sonarr-key",
			baseUrl: "http://localhost:8989",
			createdAt: new Date("2026-04-21T00:00:00.000Z"),
			id: 1,
			kind: "sonarr",
			label: "Sonarr",
			lastSyncError: null,
			lastSyncedAt: new Date("2026-04-21T12:00:00.000Z"),
			lastSyncStatus: "synced",
			updatedAt: new Date("2026-04-21T00:00:00.000Z"),
		});
		mocks.reviewItems.push({
			createdAt: new Date("2026-04-21T01:00:00.000Z"),
			id: 9,
			payload: { title: "Unknown Show" },
			resourceType: "show",
			sourceId: 1,
			sourceKey: "sonarr:1:show:55",
			status: "unresolved",
			updatedAt: new Date("2026-04-21T02:00:00.000Z"),
		});

		const rows = await getImportReviewFn({ data: { sourceId: 1 } });

		expect(rows).toEqual([
			{
				createdAt: "2026-04-21T01:00:00.000Z",
				id: 9,
				payload: { title: "Unknown Show" },
				resourceType: "show",
				sourceId: 1,
				sourceKind: "sonarr",
				sourceKey: "sonarr:1:show:55",
				sourceLabel: "Sonarr",
				status: "unresolved",
				updatedAt: "2026-04-21T02:00:00.000Z",
			},
		]);
	});

	it("delegates apply payloads to the apply engine", async () => {
		mocks.applyImportPlan.mockResolvedValue({
			appliedCount: 2,
			reviewCount: 1,
		});

		const result = await applyImportPlanFn({
			data: {
				selectedRows: [
					{
						action: "create",
						payload: {},
						resourceType: "profile",
						sourceKey: "radarr:7:profile:1",
					},
				],
				sourceId: 7,
			},
		});

		expect(result).toEqual({ appliedCount: 2, reviewCount: 1 });
		expect(mocks.applyImportPlan).toHaveBeenCalledWith({
			selectedRows: [
				{
					action: "create",
					payload: {},
					resourceType: "profile",
					sourceKey: "radarr:7:profile:1",
				},
			],
			sourceId: 7,
		});
	});

	it("updates review item status and payload", async () => {
		mocks.reviewItems.push({
			createdAt: new Date("2026-04-21T00:00:00.000Z"),
			id: 9,
			payload: { title: "Unknown Show" },
			resourceType: "show",
			sourceId: 1,
			sourceKey: "sonarr:1:show:55",
			status: "unresolved",
			updatedAt: new Date("2026-04-21T00:00:00.000Z"),
		});

		await expect(
			resolveImportReviewItemFn({
				data: {
					id: 9,
					payload: { title: "Resolved Show", tmdbId: 123 },
					status: "resolved",
				},
			}),
		).resolves.toEqual({ success: true });

		expect(mocks.reviewItems[0]).toMatchObject({
			payload: { title: "Resolved Show", tmdbId: 123 },
			status: "resolved",
		});
	});

	it("preserves a review item payload when resolving without one", async () => {
		mocks.reviewItems.push({
			createdAt: new Date("2026-04-21T00:00:00.000Z"),
			id: 10,
			payload: { title: "Keep Me" },
			resourceType: "show",
			sourceId: 1,
			sourceKey: "sonarr:1:show:99",
			status: "unresolved",
			updatedAt: new Date("2026-04-21T00:00:00.000Z"),
		});

		await expect(
			resolveImportReviewItemFn({
				data: {
					id: 10,
					status: "resolved",
				},
			}),
		).resolves.toEqual({ success: true });

		expect(mocks.reviewItems[0]).toMatchObject({
			payload: { title: "Keep Me" },
			status: "resolved",
		});
	});
});
