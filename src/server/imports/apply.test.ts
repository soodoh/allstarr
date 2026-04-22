import { beforeEach, describe, expect, it, vi } from "vitest";

type ClientRow = {
	id: number;
	name: string;
	implementation: string;
	protocol: string;
	enabled: boolean;
	priority: number;
	host: string;
	port: number;
	useSsl: boolean;
	urlBase: string | null;
	username: string | null;
	password: string | null;
	apiKey: string | null;
	category: string;
	tag: string | null;
	removeCompletedDownloads: boolean;
	settings: Record<string, unknown> | null;
	createdAt: number;
	updatedAt: number;
};

type ProfileRow = {
	id: number;
	name: string;
	rootFolderPath: string;
	cutoff: number;
	items: number[][];
	upgradeAllowed: boolean;
	icon: string;
	categories: number[];
	contentType: string;
	language: string;
	minCustomFormatScore: number;
	upgradeUntilCustomFormatScore: number;
};

type ProvenanceRow = {
	lastImportedAt: Date;
	sourceId: number;
	sourceKey: string;
	targetId: string;
	targetType: string;
};

type ReviewRow = {
	createdAt: Date;
	id: number;
	payload: Record<string, unknown>;
	resourceType: string;
	sourceId: number;
	sourceKey: string;
	status: string;
	updatedAt: Date;
};

type SettingRow = {
	key: string;
	value: string;
};

type State = {
	clients: ClientRow[];
	failOnInsertTable: unknown | null;
	nextClientId: number;
	nextProfileId: number;
	nextReviewId: number;
	profiles: ProfileRow[];
	provenance: ProvenanceRow[];
	reviews: ReviewRow[];
	settings: SettingRow[];
};

type WriteResult = {
	onConflictDoUpdate?: (args: {
		set: Record<string, unknown>;
		target: unknown;
	}) => { run: () => void };
	returning?: () => { get: () => unknown };
	run?: () => void;
};

type DbFacade = {
	insert: (table: unknown) => {
		values: (values: Record<string, unknown>) => WriteResult;
	};
	select: () => {
		from: (table: unknown) => {
			get: (condition?: unknown) => unknown;
			where: (condition: unknown) => {
				get: () => unknown;
				run: () => void;
			};
		};
	};
	transaction: (
		fn: (tx: DbFacade) => Promise<unknown> | unknown,
	) => Promise<unknown>;
	update: (table: unknown) => {
		set: (values: Record<string, unknown>) => {
			where: (condition: unknown) => WriteResult;
		};
	};
};

const schemaMocks = vi.hoisted(() => ({
	downloadClients: { id: "downloadClients.id" },
	downloadProfiles: { id: "downloadProfiles.id" },
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
	settings: { key: "settings.key", value: "settings.value" },
}));

const mocks = vi.hoisted(() => {
	let state: State = {
		clients: [],
		failOnInsertTable: null,
		nextClientId: 101,
		nextProfileId: 201,
		nextReviewId: 1,
		profiles: [],
		provenance: [],
		reviews: [],
		settings: [],
	};

	const requireAdmin = vi.fn();
	const eq = vi.fn((left: unknown, right: unknown) => ({
		left,
		right,
		type: "eq",
	}));
	const and = vi.fn((...args: unknown[]) => ({ args, type: "and" }));

	function cloneState(input: State): State {
		return {
			clients: input.clients.map((row) => ({ ...row })),
			failOnInsertTable: input.failOnInsertTable,
			nextClientId: input.nextClientId,
			nextProfileId: input.nextProfileId,
			nextReviewId: input.nextReviewId,
			profiles: input.profiles.map((row) => ({ ...row })),
			provenance: input.provenance.map((row) => ({ ...row })),
			reviews: input.reviews.map((row) => ({ ...row })),
			settings: input.settings.map((row) => ({ ...row })),
		};
	}

	function getState(): State {
		return state;
	}

	function resetState(): void {
		state = {
			clients: [],
			failOnInsertTable: null,
			nextClientId: 101,
			nextProfileId: 201,
			nextReviewId: 1,
			profiles: [],
			provenance: [],
			reviews: [],
			settings: [],
		};
	}

	function findEqValue(condition: unknown, targetColumn: unknown): unknown {
		if (!condition || typeof condition !== "object") {
			return undefined;
		}
		const candidate = condition as {
			left?: unknown;
			right?: unknown;
			type?: string;
		};
		return candidate.type === "eq" && candidate.left === targetColumn
			? candidate.right
			: undefined;
	}

	function findAndValue(condition: unknown, targetColumn: unknown): unknown {
		if (!condition || typeof condition !== "object") {
			return undefined;
		}
		const candidate = condition as {
			args?: unknown[];
			type?: string;
		};
		if (candidate.type !== "and" || !candidate.args) {
			return undefined;
		}
		for (const arg of candidate.args) {
			const value = findEqValue(arg, targetColumn);
			if (value !== undefined) {
				return value;
			}
		}
		return undefined;
	}

	function upsertProvenance(current: State, row: ProvenanceRow): void {
		const index = current.provenance.findIndex(
			(entry) =>
				entry.sourceId === row.sourceId && entry.sourceKey === row.sourceKey,
		);
		if (index >= 0) {
			current.provenance[index] = row;
			return;
		}
		current.provenance.push(row);
	}

	function upsertReview(current: State, row: ReviewRow): void {
		const index = current.reviews.findIndex(
			(entry) =>
				entry.sourceId === row.sourceId && entry.sourceKey === row.sourceKey,
		);
		if (index >= 0) {
			current.reviews[index] = {
				...current.reviews[index],
				...row,
				id: current.reviews[index].id,
			};
			return;
		}
		current.reviews.push(row);
	}

	function upsertSetting(current: State, row: SettingRow): void {
		const index = current.settings.findIndex((entry) => entry.key === row.key);
		if (index >= 0) {
			current.settings[index] = row;
			return;
		}
		current.settings.push(row);
	}

	function createFacade(getCurrentState: () => State): DbFacade {
		return {
			insert(table: unknown) {
				return {
					values(values: Record<string, unknown>) {
						if (table === schemaMocks.downloadClients) {
							return {
								returning() {
									return {
										get() {
											const current = getCurrentState();
											if (current.failOnInsertTable === table) {
												throw new Error("download clients insert failed");
											}
											const row: ClientRow = {
												apiKey: (values.apiKey as string | null) ?? null,
												category: (values.category as string) ?? "allstarr",
												createdAt: values.createdAt as number,
												enabled: Boolean(values.enabled),
												host: values.host as string,
												id: current.nextClientId,
												implementation: values.implementation as string,
												name: values.name as string,
												password: (values.password as string | null) ?? null,
												port: values.port as number,
												priority: values.priority as number,
												protocol: values.protocol as string,
												removeCompletedDownloads: Boolean(
													values.removeCompletedDownloads,
												),
												settings:
													(values.settings as Record<string, unknown> | null) ??
													null,
												tag: (values.tag as string | null) ?? null,
												updatedAt: values.updatedAt as number,
												urlBase: (values.urlBase as string | null) ?? null,
												useSsl: Boolean(values.useSsl),
												username: (values.username as string | null) ?? null,
											};
											current.nextClientId += 1;
											current.clients.push(row);
											return row;
										},
									};
								},
							};
						}

						if (table === schemaMocks.downloadProfiles) {
							return {
								returning() {
									return {
										get() {
											const current = getCurrentState();
											if (current.failOnInsertTable === table) {
												throw new Error("download profiles insert failed");
											}
											const row: ProfileRow = {
												categories: (values.categories as number[]) ?? [],
												contentType: values.contentType as string,
												cutoff: values.cutoff as number,
												icon: values.icon as string,
												id: current.nextProfileId,
												items: values.items as number[][],
												language: values.language as string,
												minCustomFormatScore:
													values.minCustomFormatScore as number,
												name: values.name as string,
												rootFolderPath: values.rootFolderPath as string,
												upgradeAllowed: Boolean(values.upgradeAllowed),
												upgradeUntilCustomFormatScore:
													values.upgradeUntilCustomFormatScore as number,
											};
											current.nextProfileId += 1;
											current.profiles.push(row);
											return row;
										},
									};
								},
							};
						}

						if (table === schemaMocks.importProvenance) {
							return {
								onConflictDoUpdate() {
									return {
										run() {
											const current = getCurrentState();
											upsertProvenance(current, {
												lastImportedAt: values.lastImportedAt as Date,
												sourceId: values.sourceId as number,
												sourceKey: values.sourceKey as string,
												targetId: values.targetId as string,
												targetType: values.targetType as string,
											});
										},
									};
								},
							};
						}

						if (table === schemaMocks.importReviewItems) {
							return {
								run() {
									const current = getCurrentState();
									const existing = current.reviews.find(
										(entry) =>
											entry.sourceId === (values.sourceId as number) &&
											entry.sourceKey === (values.sourceKey as string),
									);
									upsertReview(current, {
										createdAt: values.createdAt as Date,
										id: existing?.id ?? current.nextReviewId,
										payload: values.payload as Record<string, unknown>,
										resourceType: values.resourceType as string,
										sourceId: values.sourceId as number,
										sourceKey: values.sourceKey as string,
										status: values.status as string,
										updatedAt: values.updatedAt as Date,
									});
									if (!existing) {
										current.nextReviewId += 1;
									}
								},
							};
						}

						if (table === schemaMocks.settings) {
							return {
								onConflictDoUpdate() {
									return {
										run() {
											upsertSetting(getCurrentState(), {
												key: values.key as string,
												value: values.value as string,
											});
										},
									};
								},
								run() {
									upsertSetting(getCurrentState(), {
										key: values.key as string,
										value: values.value as string,
									});
								},
							};
						}

						return {
							onConflictDoUpdate() {
								return { run: () => undefined };
							},
							run() {
								return undefined;
							},
						};
					},
				};
			},
			select() {
				return {
					from(table: unknown) {
						const current = getCurrentState();

						if (table === schemaMocks.importProvenance) {
							return {
								get(condition?: unknown) {
									const sourceId = findAndValue(
										condition,
										schemaMocks.importProvenance.sourceId,
									);
									const sourceKey = findAndValue(
										condition,
										schemaMocks.importProvenance.sourceKey,
									);
									return current.provenance.find(
										(entry) =>
											entry.sourceId === sourceId &&
											entry.sourceKey === sourceKey,
									);
								},
								where(condition: unknown) {
									return {
										get() {
											const sourceId = findAndValue(
												condition,
												schemaMocks.importProvenance.sourceId,
											);
											const sourceKey = findAndValue(
												condition,
												schemaMocks.importProvenance.sourceKey,
											);
											return current.provenance.find(
												(entry) =>
													entry.sourceId === sourceId &&
													entry.sourceKey === sourceKey,
											);
										},
										run() {
											return undefined;
										},
									};
								},
							};
						}

						if (table === schemaMocks.importReviewItems) {
							return {
								get(condition?: unknown) {
									const id = findEqValue(
										condition,
										schemaMocks.importReviewItems.id,
									);
									if (typeof id === "number") {
										return current.reviews.find((entry) => entry.id === id);
									}
									return undefined;
								},
								where(condition: unknown) {
									return {
										get() {
											const id = findEqValue(
												condition,
												schemaMocks.importReviewItems.id,
											);
											if (typeof id === "number") {
												return current.reviews.find((entry) => entry.id === id);
											}
											return undefined;
										},
										run() {
											return undefined;
										},
									};
								},
							};
						}

						if (table === schemaMocks.downloadClients) {
							return {
								get(condition?: unknown) {
									const id = findEqValue(
										condition,
										schemaMocks.downloadClients.id,
									);
									if (typeof id === "number") {
										return current.clients.find((entry) => entry.id === id);
									}
									return undefined;
								},
								where(condition: unknown) {
									return {
										get() {
											const id = findEqValue(
												condition,
												schemaMocks.downloadClients.id,
											);
											if (typeof id === "number") {
												return current.clients.find((entry) => entry.id === id);
											}
											return undefined;
										},
										run() {
											return undefined;
										},
									};
								},
							};
						}

						if (table === schemaMocks.downloadProfiles) {
							return {
								get(condition?: unknown) {
									const id = findEqValue(
										condition,
										schemaMocks.downloadProfiles.id,
									);
									if (typeof id === "number") {
										return current.profiles.find((entry) => entry.id === id);
									}
									return undefined;
								},
								where(condition: unknown) {
									return {
										get() {
											const id = findEqValue(
												condition,
												schemaMocks.downloadProfiles.id,
											);
											if (typeof id === "number") {
												return current.profiles.find(
													(entry) => entry.id === id,
												);
											}
											return undefined;
										},
										run() {
											return undefined;
										},
									};
								},
							};
						}

						return {
							get() {
								return undefined;
							},
							where() {
								return {
									get() {
										return undefined;
									},
									run() {
										return undefined;
									},
								};
							},
						};
					},
				};
			},
			transaction(
				fn: (tx: ReturnType<typeof createFacade>) => Promise<unknown> | unknown,
			) {
				const txState = cloneState(getCurrentState());
				const tx = createFacade(() => txState);
				return Promise.resolve(fn(tx)).then(
					(result) => {
						state = txState;
						return result;
					},
					(error) => {
						throw error;
					},
				);
			},
			update(table: unknown) {
				return {
					set(values: Record<string, unknown>) {
						return {
							where(condition: unknown) {
								if (table === schemaMocks.downloadClients) {
									return {
										returning() {
											return {
												get() {
													const current = getCurrentState();
													const id = findEqValue(
														condition,
														schemaMocks.downloadClients.id,
													);
													const index = current.clients.findIndex(
														(entry) => entry.id === id,
													);
													const existing = current.clients[index];
													const updated: ClientRow = {
														...existing,
														...(values as Partial<ClientRow>),
														id: existing.id,
													};
													current.clients[index] = updated;
													return updated;
												},
											};
										},
									};
								}

								if (table === schemaMocks.downloadProfiles) {
									return {
										returning() {
											return {
												get() {
													const current = getCurrentState();
													const id = findEqValue(
														condition,
														schemaMocks.downloadProfiles.id,
													);
													const index = current.profiles.findIndex(
														(entry) => entry.id === id,
													);
													const existing = current.profiles[index];
													const updated: ProfileRow = {
														...existing,
														...(values as Partial<ProfileRow>),
														id: existing.id,
													};
													current.profiles[index] = updated;
													return updated;
												},
											};
										},
									};
								}

								if (table === schemaMocks.importReviewItems) {
									return {
										run() {
											const current = getCurrentState();
											const id = findEqValue(
												condition,
												schemaMocks.importReviewItems.id,
											);
											const index = current.reviews.findIndex(
												(entry) => entry.id === id,
											);
											const existing = current.reviews[index];
											current.reviews[index] = {
												...existing,
												payload:
													(values.payload as Record<string, unknown>) ??
													existing.payload,
												status: (values.status as string) ?? existing.status,
												updatedAt:
													(values.updatedAt as Date) ?? existing.updatedAt,
											};
										},
									};
								}

								if (table === schemaMocks.settings) {
									return {
										run() {
											upsertSetting(getCurrentState(), {
												key: values.key as string,
												value: values.value as string,
											});
										},
									};
								}

								return {
									returning() {
										return { get: () => values };
									},
									run() {
										return undefined;
									},
								};
							},
						};
					},
				};
			},
		};
	}

	const db = createFacade(() => state);

	return {
		and,
		db,
		eq,
		getState,
		requireAdmin,
		resetState,
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
	upsertSettingValue: vi.fn(),
}));

import { applyImportPlan } from "./apply";

describe("applyImportPlan", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.resetState();
		mocks.requireAdmin.mockResolvedValue({ user: { id: 1, role: "admin" } });
	});

	it("reapplies supported rows without duplicating targets and keeps provenance linked", async () => {
		const first = await applyImportPlan({
			sourceId: 7,
			selectedRows: [
				{
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
							name: "Seed Client",
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
					resourceType: "setting",
					sourceKey: "radarr:7:setting:download-client",
				},
				{
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
							name: "Seed Profile",
							rootFolderPath: "/movies-4k",
							upgradeAllowed: false,
							upgradeUntilCustomFormatScore: 0,
						},
					},
					resourceType: "profile",
					sourceKey: "radarr:7:profile:uhd",
				},
				{
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
					resourceType: "profile",
					sourceKey: "radarr:7:profile:metadata",
				},
			],
		});

		const second = await applyImportPlan({
			sourceId: 7,
			selectedRows: [
				{
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
							name: "Updated Client",
							password: null,
							port: 8080,
							protocol: "torrent",
							priority: 1,
							removeCompletedDownloads: true,
							settings: { watchFolder: "/downloads" },
							tag: null,
							urlBase: null,
							useSsl: false,
							username: null,
						},
					},
					resourceType: "setting",
					sourceKey: "radarr:7:setting:download-client",
				},
				{
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
							name: "Updated Profile",
							rootFolderPath: "/movies-4k",
							upgradeAllowed: false,
							upgradeUntilCustomFormatScore: 0,
						},
					},
					resourceType: "profile",
					sourceKey: "radarr:7:profile:uhd",
				},
				{
					action: "create",
					payload: {
						profileKind: "metadata",
						raw: {
							minimumPages: 25,
							minimumPopularity: 11,
							skipCompilations: true,
							skipMissingIsbnAsin: true,
							skipMissingReleaseDate: true,
						},
					},
					resourceType: "profile",
					sourceKey: "radarr:7:profile:metadata",
				},
			],
		});

		expect(first).toEqual({ appliedCount: 3, reviewCount: 0 });
		expect(second).toEqual({ appliedCount: 3, reviewCount: 0 });
		expect(mocks.getState().clients).toHaveLength(1);
		expect(mocks.getState().profiles).toHaveLength(1);
		expect(mocks.getState().settings).toHaveLength(1);
		expect(mocks.getState().clients[0]).toMatchObject({
			id: 101,
			name: "Updated Client",
			settings: { watchFolder: "/downloads" },
		});
		expect(mocks.getState().profiles[0]).toMatchObject({
			id: 201,
			name: "Updated Profile",
		});
		expect(mocks.getState().provenance).toEqual([
			{
				lastImportedAt: expect.any(Date),
				sourceId: 7,
				sourceKey: "radarr:7:setting:download-client",
				targetId: "101",
				targetType: "download-client",
			},
			{
				lastImportedAt: expect.any(Date),
				sourceId: 7,
				sourceKey: "radarr:7:profile:uhd",
				targetId: "201",
				targetType: "download-profile",
			},
			{
				lastImportedAt: expect.any(Date),
				sourceId: 7,
				sourceKey: "radarr:7:profile:metadata",
				targetId: "metadata.hardcover.profile",
				targetType: "metadata-profile",
			},
		]);
		expect(JSON.parse(mocks.getState().settings[0].value)).toEqual({
			minimumPages: 25,
			minimumPopularity: 11,
			skipCompilations: true,
			skipMissingIsbnAsin: true,
			skipMissingReleaseDate: true,
		});
	});

	it("rolls back earlier writes when a later row fails", async () => {
		mocks.getState().failOnInsertTable = schemaMocks.downloadProfiles;

		await expect(
			applyImportPlan({
				sourceId: 3,
				selectedRows: [
					{
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
								name: "Seed Client",
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
						resourceType: "setting",
						sourceKey: "radarr:3:setting:download-client",
					},
					{
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
								name: "Broken Profile",
								rootFolderPath: "/movies-4k",
								upgradeAllowed: false,
								upgradeUntilCustomFormatScore: 0,
							},
						},
						resourceType: "profile",
						sourceKey: "radarr:3:profile:uhd",
					},
				],
			}),
		).rejects.toThrow("download profiles insert failed");

		expect(mocks.getState().clients).toHaveLength(0);
		expect(mocks.getState().profiles).toHaveLength(0);
		expect(mocks.getState().provenance).toHaveLength(0);
		expect(mocks.getState().reviews).toHaveLength(0);
		expect(mocks.getState().settings).toHaveLength(0);
	});

	it("persists unresolved rows as review items and does not count them as applied", async () => {
		const result = await applyImportPlan({
			sourceId: 3,
			selectedRows: [
				{
					action: "unresolved",
					payload: { reason: "No confident TMDB match", title: "Unknown Show" },
					resourceType: "show",
					sourceKey: "sonarr:3:show:55",
				},
			],
		});

		expect(result).toEqual({ appliedCount: 0, reviewCount: 1 });
		expect(mocks.getState().reviews).toHaveLength(1);
		expect(mocks.getState().reviews[0]).toMatchObject({
			sourceId: 3,
			sourceKey: "sonarr:3:show:55",
			resourceType: "show",
			status: "unresolved",
			payload: {
				reason: "No confident TMDB match",
				title: "Unknown Show",
			},
		});
		expect(mocks.getState().provenance).toHaveLength(0);
	});

	it("does not create a local record for unsupported actions on supported rows", async () => {
		const result = await applyImportPlan({
			sourceId: 8,
			selectedRows: [
				{
					action: "link",
					payload: {
						profileKind: "quality",
						raw: {
							categories: [],
							contentType: "movie",
							cutoff: 0,
							icon: "film",
							id: 9,
							items: [[1]],
							language: "en",
							minCustomFormatScore: 0,
							name: "Unsupported Action",
							rootFolderPath: "/movies-uhd",
							upgradeAllowed: false,
							upgradeUntilCustomFormatScore: 0,
						},
					},
					resourceType: "profile",
					sourceKey: "radarr:8:profile:unsupported",
				},
			],
		});

		expect(result).toEqual({ appliedCount: 0, reviewCount: 1 });
		expect(mocks.getState().profiles).toHaveLength(0);
		expect(mocks.getState().clients).toHaveLength(0);
		expect(mocks.getState().reviews).toHaveLength(1);
		expect(mocks.getState().reviews[0]?.sourceKey).toBe(
			"radarr:8:profile:unsupported",
		);
	});
});
