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
	it("keeps quality and metadata profiles in distinct plan sections", async () => {
		const plan = await buildImportPlan({
			snapshots: [
				normalizeImportSnapshot({
					sourceId: 9,
					kind: "readarr",
					snapshot: buildRawSnapshot({
						kind: "readarr",
						profiles: [{ id: 13, name: "Lossless" }],
						settings: {
							metadataProfiles: [{ id: 14, name: "Hardcover" }],
						},
					}),
				}),
			],
			existingState: {},
		});

		expect(plan.qualityProfiles.items).toHaveLength(1);
		expect(plan.metadataProfiles.items).toHaveLength(1);
		expect(plan.qualityProfiles.items[0]).toMatchObject({
			resourceType: "profile",
			title: "Lossless",
			sourceKey: "readarr:9:profile:quality:13",
		});
		expect(plan.metadataProfiles.items[0]).toMatchObject({
			resourceType: "profile",
			title: "Hardcover",
			sourceKey: "readarr:9:profile:metadata:14",
		});
	});

	it("only makes the default metadata profile selectable", async () => {
		const plan = await buildImportPlan({
			snapshots: [
				normalizeImportSnapshot({
					sourceId: 15,
					kind: "readarr",
					snapshot: buildRawSnapshot({
						kind: "readarr",
						rootFolders: [
							{
								defaultMetadataProfileId: 1,
								path: "/data/capture/library/books",
							},
						],
						settings: {
							metadataProfiles: [
								{ id: 1, name: "Standard" },
								{ id: 2, name: "None" },
							],
						},
					}),
				}),
			],
			existingState: {},
		});

		expect(plan.metadataProfiles.items).toEqual([
			expect.objectContaining({
				action: "create",
				selectable: true,
				sourceKey: "readarr:15:profile:metadata:1",
				title: "Standard",
			}),
			expect.objectContaining({
				action: "unsupported",
				selectable: false,
				sourceKey: "readarr:15:profile:metadata:2",
				title: "None",
			}),
		]);
	});

	it("marks unsupported settings and activity rows as non-selectable", async () => {
		const plan = await buildImportPlan({
			snapshots: [
				normalizeImportSnapshot({
					sourceId: 10,
					kind: "sonarr",
					snapshot: buildRawSnapshot({
						kind: "sonarr",
						settings: {
							downloadClients: [{ id: 1, name: "qBittorrent" }],
							indexers: [{ id: 2, name: "Nyaa.si" }],
							naming: [{ id: 3, name: "Naming" }],
						},
						activity: {
							queue: [{ id: 4, title: "Queued Episode" }],
						},
					}),
				}),
			],
			existingState: {},
		});

		expect(plan.settings.items).toEqual([
			expect.objectContaining({
				action: "create",
				selectable: true,
				title: "qBittorrent",
			}),
			expect.objectContaining({
				action: "unsupported",
				selectable: false,
				title: "Nyaa.si",
			}),
			expect.objectContaining({
				action: "unsupported",
				selectable: false,
				title: "Naming",
			}),
		]);
		expect(plan.activity.items).toEqual([
			expect.objectContaining({
				action: "unsupported",
				selectable: false,
				title: "Queued Episode",
			}),
		]);
	});

	it("matches a Sonarr show directly by tmdbId without needing a crosswalk", async () => {
		const plan = await buildImportPlan({
			snapshots: [
				normalizeImportSnapshot({
					sourceId: 11,
					kind: "sonarr",
					snapshot: buildRawSnapshot({
						kind: "sonarr",
						library: {
							series: [{ id: 77, title: "Direct Match", tmdbId: 999 }],
						},
					}),
				}),
			],
			existingState: {
				showsByTmdbId: new Map([[999, { id: 55 }]]),
			},
		});

		expect(plan.library.items[0]).toMatchObject({
			resourceType: "show",
			action: "update",
			targetId: 55,
			sourceKey: "sonarr:11:show:77",
		});
	});

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

	it("accepts exact book fingerprint matches as updates", async () => {
		const plan = await buildImportPlan({
			snapshots: [
				normalizeImportSnapshot({
					sourceId: 6,
					kind: "readarr",
					snapshot: buildRawSnapshot({
						kind: "readarr",
						library: {
							books: [
								{
									id: 501,
									title: "Foundation",
									authorName: "Isaac Asimov",
									year: 1951,
								},
							],
						},
					}),
				}),
			],
			existingState: {
				bookFingerprintToId: new Map([["foundation|isaac asimov|1951", 123]]),
			},
		});

		expect(plan.library.items[0]).toMatchObject({
			resourceType: "book",
			action: "update",
			selectable: true,
			sourceKey: "readarr:6:book:501",
			targetId: 123,
		});
		expect(plan.unresolved.items).toHaveLength(0);
	});

	it("does not update a movie when tmdbId is missing", async () => {
		const plan = await buildImportPlan({
			snapshots: [
				normalizeImportSnapshot({
					sourceId: 12,
					kind: "radarr",
					snapshot: buildRawSnapshot({
						kind: "radarr",
						library: {
							movies: [{ id: 301, title: "Mystery Movie" }],
						},
					}),
				}),
			],
			existingState: {
				moviesByTmdbId: new Map([[301, { id: 77 }]]),
			},
		});

		expect(plan.library.items[0]).toMatchObject({
			resourceType: "movie",
			action: "create",
			targetId: null,
			sourceKey: "radarr:12:movie:301",
		});
	});

	it("emits unsupported rows for intentionally unsupported snapshot buckets", async () => {
		const rawSnapshot = buildRawSnapshot({
			kind: "radarr",
			library: {
				movies: [{ id: 1, tmdbId: 11, title: "Dune" }],
				podcasts: [{ id: 99, title: "Unsupported Podcast" }],
			} as Record<string, Array<Record<string, unknown>>>,
		}) as ReturnType<typeof buildRawSnapshot> & {
			library: Record<string, Array<Record<string, unknown>>>;
		};

		const plan = await buildImportPlan({
			snapshots: [
				normalizeImportSnapshot({
					sourceId: 10,
					kind: "radarr",
					snapshot: rawSnapshot,
				}),
			],
			existingState: {},
		});

		expect(plan.unsupported.items).toHaveLength(1);
		expect(plan.unsupported.items[0]).toMatchObject({
			resourceType: "unsupported",
			action: "unsupported",
			sourceKey: "radarr:10:unsupported:library:podcasts:99",
			title: "Unsupported Podcast",
		});
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

	it("preserves a direct Sonarr tmdbId in the normalized show payload", () => {
		const normalized = normalizeImportSnapshot({
			sourceId: 13,
			kind: "sonarr",
			snapshot: buildRawSnapshot({
				kind: "sonarr",
				library: {
					series: [{ id: 77, title: "Direct Match", tmdbId: 999 }],
				},
			}),
		});

		expect(normalized.library.shows[0]?.payload).toMatchObject({
			tmdbId: 999,
			sourceRecordId: 77,
		});
	});

	it("derives Readarr book author and year from companion author and release date fields", () => {
		const normalized = normalizeImportSnapshot({
			sourceId: 14,
			kind: "readarr",
			snapshot: buildRawSnapshot({
				kind: "readarr",
				library: {
					authors: [
						{
							authorName: "Ursula K. Le Guin",
							id: 1,
						},
					],
					books: [
						{
							authorId: 1,
							foreignBookId: "13642",
							id: 1,
							releaseDate: "1968-01-01T00:00:00Z",
							title: "A Wizard of Earthsea",
						},
					],
				},
			}),
		});

		expect(normalized.library.books[0]?.payload).toMatchObject({
			authorName: "Ursula K. Le Guin",
			foreignBookId: "13642",
			sourceRecordId: 1,
			title: "A Wizard of Earthsea",
			year: 1968,
		});
	});
});
