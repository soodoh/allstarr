import { describe, expect, it } from "vitest";
import { normalizeImportSnapshot } from "./normalize";
import { buildImportPlan } from "./plan";

function buildRawSnapshot(overrides: {
	kind: "sonarr" | "radarr" | "readarr" | "bookshelf";
	settings?: Record<string, unknown>;
	rootFolders?: Array<Record<string, unknown>>;
	profiles?: Array<Record<string, unknown>>;
	library?: Record<string, Array<Record<string, unknown>>>;
	activity?: {
		history?: Array<Record<string, unknown>>;
		queue?: Array<Record<string, unknown>>;
		blocklist?: Array<Record<string, unknown>>;
	};
}): {
	kind: "sonarr" | "radarr" | "readarr" | "bookshelf";
	fetchedAt: string;
	settings: Record<string, unknown>;
	rootFolders: Array<Record<string, unknown>>;
	profiles: Array<Record<string, unknown>>;
	library: Record<string, Array<Record<string, unknown>>>;
	activity: {
		history: Array<Record<string, unknown>>;
		queue: Array<Record<string, unknown>>;
		blocklist: Array<Record<string, unknown>>;
	};
} {
	return {
		kind: overrides.kind,
		fetchedAt: "2026-04-21T00:00:00.000Z",
		settings: overrides.settings ?? {},
		rootFolders: overrides.rootFolders ?? [],
		profiles: overrides.profiles ?? [],
		library: overrides.library ?? {},
		activity: {
			history: overrides.activity?.history ?? [],
			queue: overrides.activity?.queue ?? [],
			blocklist: overrides.activity?.blocklist ?? [],
		},
	};
}

describe("buildImportPlan", () => {
	it("marks duplicate movies from two Radarr instances as one update and one skip when provenance already exists", async () => {
		const plan = await buildImportPlan({
			snapshots: [
				normalizeImportSnapshot({
					sourceId: 1,
					kind: "radarr",
					snapshot: buildRawSnapshot({
						kind: "radarr",
						profiles: [{ id: 7, name: "UHD" }],
						library: {
							movies: [{ id: 100, tmdbId: 11, title: "Dune" }],
						},
					}),
				}),
				normalizeImportSnapshot({
					sourceId: 2,
					kind: "radarr",
					snapshot: buildRawSnapshot({
						kind: "radarr",
						library: {
							movies: [{ id: 210, tmdbId: 11, title: "Dune" }],
						},
					}),
				}),
			],
			existingState: {
				moviesByTmdbId: new Map([[11, { id: 44 }]]),
				provenanceBySourceKey: new Map([
					["radarr:1:movie:100", { targetType: "movie", targetId: 44 }],
				]),
			},
		});

		expect(plan.library.items.map((item) => item.action)).toEqual([
			"skip",
			"update",
		]);
		expect(plan.library.items.map((item) => item.targetId)).toEqual([44, 44]);
		expect(plan.library.items[0]).toMatchObject({
			sourceKey: "radarr:1:movie:100",
			selectable: false,
		});
		expect(plan.library.items[1]).toMatchObject({
			sourceKey: "radarr:2:movie:210",
			selectable: true,
		});
	});

	it("sends low-confidence Sonarr shows to unresolved", async () => {
		const plan = await buildImportPlan({
			snapshots: [
				normalizeImportSnapshot({
					sourceId: 3,
					kind: "sonarr",
					snapshot: buildRawSnapshot({
						kind: "sonarr",
						library: {
							series: [{ id: 55, title: "Unknown Show", tvdbId: 999999 }],
						},
					}),
				}),
			],
			existingState: {},
		});

		expect(plan.unresolved.items[0]).toMatchObject({
			resourceType: "show",
			action: "unresolved",
			selectable: false,
		});
		expect(plan.unresolved.items[0]?.warning).toContain("TMDB");
	});

	it("sends low-confidence Readarr and Bookshelf books to unresolved", async () => {
		const plan = await buildImportPlan({
			snapshots: [
				normalizeImportSnapshot({
					sourceId: 4,
					kind: "readarr",
					snapshot: buildRawSnapshot({
						kind: "readarr",
						library: {
							books: [{ id: 77, title: "The Missing Tome" }],
						},
					}),
				}),
				normalizeImportSnapshot({
					sourceId: 5,
					kind: "bookshelf",
					snapshot: buildRawSnapshot({
						kind: "bookshelf",
						library: {
							books: [{ id: 88, title: "Another Unknown Book" }],
						},
					}),
				}),
			],
			existingState: {},
		});

		expect(plan.unresolved.items.map((item) => item.resourceType)).toEqual([
			"book",
			"book",
		]);
		expect(
			plan.unresolved.items.every((item) => item.action === "unresolved"),
		).toBe(true);
	});
});

describe("normalizeImportSnapshot", () => {
	it("keeps metadata profiles separate from quality profiles", () => {
		const normalized = normalizeImportSnapshot({
			sourceId: 8,
			kind: "readarr",
			snapshot: buildRawSnapshot({
				kind: "readarr",
				settings: {
					metadataProfiles: [{ id: 14, name: "Hardcover" }],
				},
				profiles: [{ id: 13, name: "Lossless" }],
			}),
		});

		expect(normalized.settings.qualityProfiles).toEqual([
			expect.objectContaining({
				resourceType: "profile",
				title: "Lossless",
			}),
		]);
		expect(normalized.settings.metadataProfiles).toEqual([
			expect.objectContaining({
				resourceType: "profile",
				title: "Hardcover",
			}),
		]);
		expect(normalized.settings.qualityProfiles[0]?.sourceKey).toBe(
			"readarr:8:profile:quality:13",
		);
		expect(normalized.settings.metadataProfiles[0]?.sourceKey).toBe(
			"readarr:8:profile:metadata:14",
		);
	});
});
