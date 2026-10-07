import {
	books,
	booksAuthors,
	downloadClients,
	downloadProfiles,
	importProvenance,
	importReviewItems,
	importSnapshots,
	importSources,
	movies,
	shows,
} from "src/db/schema";
import { createSqliteFixture } from "src/test/sqlite-fixture";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { normalizeImportSnapshot } from "./normalize";
import type { RawImportSnapshot } from "./types";

let fixture: ReturnType<typeof createSqliteFixture>;
let plan: typeof import("./persisted-plan");
let sourceId: number;

beforeEach(async () => {
	vi.resetModules();
	fixture = createSqliteFixture();
	fixture.db.delete(downloadProfiles).run();
	sourceId = addSource();
	vi.doMock("src/db", () => ({ db: fixture.db }));
	plan = await import("./persisted-plan");
});
afterEach(() => {
	vi.doUnmock("src/db");
	vi.restoreAllMocks();
	fixture.close();
});

function addSource() {
	return fixture.db
		.insert(importSources)
		.values({
			kind: "readarr",
			label: "Library",
			baseUrl: "http://source.test",
			apiKey: "test",
		})
		.returning()
		.get().id;
}
function save(
	overrides: Partial<RawImportSnapshot> = {},
	id = sourceId,
	fetchedAt = new Date("2026-10-01"),
) {
	const snapshot: RawImportSnapshot = {
		kind: "readarr",
		fetchedAt: fetchedAt.toISOString(),
		settings: {},
		rootFolders: [],
		profiles: [],
		library: {},
		activity: { history: [], queue: [], blocklist: [] },
		...overrides,
	};
	const payload = normalizeImportSnapshot({
		kind: "readarr",
		sourceId: id,
		snapshot,
	});
	fixture.db
		.insert(importSnapshots)
		.values({ sourceId: id, payload, fetchedAt })
		.run();
	return payload;
}
function client(id: number, name = "Downloader") {
	return {
		id,
		name,
		implementation: "QBittorrent",
		protocol: "torrent",
		host: "localhost",
		port: 8080,
	};
}
function key(resource: string) {
	return `readarr:${sourceId}:${resource}`;
}

describe("persisted Import plan", () => {
	it("keeps missing source and missing snapshot outcomes consistent across callers", async () => {
		expect(plan.readImportPlan(sourceId)).toEqual([]);
		expect(plan.readImportReview(sourceId)).toEqual([]);
		await expect(plan.applyPersistedImportPlan(sourceId, [])).rejects.toThrow(
			"Import snapshot not found",
		);
		expect(() => plan.readImportPlan(999)).toThrow("Import source not found");
		expect(() => plan.readImportReview(999)).toThrow("Import source not found");
		await expect(plan.applyPersistedImportPlan(999, [])).rejects.toThrow(
			"Import source not found",
		);
	});
	it("reads and applies the latest saved snapshot, independent of insertion order", async () => {
		save(
			{ settings: { downloadClients: [client(1, "Newest")] } },
			sourceId,
			new Date("2026-10-03"),
		);
		save(
			{ settings: { downloadClients: [client(2, "Older")] } },
			sourceId,
			new Date("2026-10-01"),
		);
		expect(plan.readImportPlan(sourceId).map((row) => row.title)).toEqual([
			"Newest",
		]);
		await expect(
			plan.applyPersistedImportPlan(sourceId, [
				key("setting:download-client:2"),
			]),
		).rejects.toThrow("Import plan row not found");
		expect(fixture.db.select().from(downloadClients).all()).toEqual([]);
		expect(
			await plan.applyPersistedImportPlan(sourceId, [
				key("setting:download-client:1"),
			]),
		).toEqual({ appliedCount: 1, reviewCount: 0 });
		expect(fixture.db.select().from(downloadClients).get()?.name).toBe(
			"Newest",
		);
	});
	it("uses canonical matches and labels for movies, shows and primary-author book fingerprints", async () => {
		const movie = fixture.db
			.insert(movies)
			.values({ title: "Movie", sortTitle: "Movie", tmdbId: 12 })
			.returning()
			.get();
		const show = fixture.db
			.insert(shows)
			.values({ title: "Show", sortTitle: "Show", tmdbId: 13 })
			.returning()
			.get();
		const book = fixture.db
			.insert(books)
			.values({ title: "A Book", releaseYear: 2020 })
			.returning()
			.get();
		fixture.db
			.insert(booksAuthors)
			.values([
				{
					bookId: book.id,
					authorName: "Secondary",
					foreignAuthorId: "secondary",
					isPrimary: false,
				},
				{
					bookId: book.id,
					authorName: "Primary",
					foreignAuthorId: "primary",
					isPrimary: true,
				},
			])
			.run();
		save({
			library: {
				movies: [{ id: 1, title: "Movie", tmdbId: 12 }],
				series: [{ id: 2, title: "Show", tmdbId: 13 }],
				books: [{ id: 3, title: "A Book", authorName: "Primary", year: 2020 }],
			},
		});
		const rows = plan.readImportPlan(sourceId);
		expect(rows.map((row) => row.target)).toEqual(
			expect.arrayContaining([
				{ id: movie.id, label: "Movie" },
				{ id: show.id, label: "Show" },
				{ id: book.id, label: "A Book" },
			]),
		);
		expect(rows.every((row) => row.payload.targetId === row.target.id)).toBe(
			true,
		);
		expect(
			await plan.applyPersistedImportPlan(
				sourceId,
				rows.map((row) => row.sourceKey),
			),
		).toEqual({ appliedCount: 3, reviewCount: 0 });
		expect(
			fixture.db
				.select()
				.from(importProvenance)
				.all()
				.map((row) => row.targetId),
		).toEqual(
			expect.arrayContaining([
				String(movie.id),
				String(show.id),
				String(book.id),
			]),
		);
		expect(
			plan.readImportPlan(sourceId).every((row) => row.action === "skip"),
		).toBe(true);
	});
	it("refreshes matching state instead of reusing a stale read result", async () => {
		save({
			library: { books: [{ id: 1, title: "Book", foreignBookId: "foreign" }] },
		});
		expect(plan.readImportReview(sourceId)).toHaveLength(1);
		const book = fixture.db
			.insert(books)
			.values({ title: "Local book", foreignBookId: "foreign" })
			.returning()
			.get();
		expect(
			await plan.applyPersistedImportPlan(sourceId, [key("book:1")]),
		).toEqual({ appliedCount: 1, reviewCount: 0 });
		expect(fixture.db.select().from(importProvenance).get()?.targetId).toBe(
			String(book.id),
		);
	});
	it("keeps provenance isolated when two sources reuse external identities", async () => {
		const otherId = addSource();
		save({ settings: { downloadClients: [client(1)] } });
		save({ settings: { downloadClients: [client(1, "Other")] } }, otherId);
		await plan.applyPersistedImportPlan(sourceId, [
			key("setting:download-client:1"),
		]);
		expect(plan.readImportPlan(otherId)[0]?.action).toBe("create");
		await plan.applyPersistedImportPlan(otherId, [
			`readarr:${otherId}:setting:download-client:1`,
		]);
		expect(fixture.db.select().from(downloadClients).all()).toHaveLength(2);
	});
	it("applies supported profiles and clients idempotently and projects blocked rows for review", async () => {
		save({
			settings: {
				downloadClients: [client(1)],
				metadataProfiles: [{ id: 1, name: "Metadata" }],
				naming: { rename: true },
			},
			profiles: [{ id: 2, name: "Quality" }],
			library: { books: [{ id: 3, title: "Missing" }] },
			activity: {
				history: [],
				blocklist: [],
				queue: [{ id: 4, title: "Queued" }],
			},
		});
		const rows = plan.readImportPlan(sourceId);
		const review = plan.readImportReview(sourceId);
		expect(review).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ title: "Missing", status: "unresolved" }),
				expect.objectContaining({ title: "Naming", status: "blocked" }),
			]),
		);
		expect(rows.find((row) => row.title === "Quality")?.sourceSummary).toBe(
			"quality profile",
		);
		expect(rows.find((row) => row.title === "Metadata")?.sourceSummary).toBe(
			"metadata profile",
		);
		const keys = [...rows, ...review].map((row) => row.sourceKey);
		expect(await plan.applyPersistedImportPlan(sourceId, keys)).toEqual({
			appliedCount: 3,
			reviewCount: 5,
		});
		await plan.applyPersistedImportPlan(sourceId, keys);
		expect(fixture.db.select().from(downloadClients).all()).toHaveLength(1);
		expect(fixture.db.select().from(downloadProfiles).all()).toHaveLength(1);
		expect(fixture.db.select().from(importReviewItems).all()).toHaveLength(3);
	});
	it("rolls back all writes when a later selected row fails in synchronous SQLite", async () => {
		save({
			settings: { downloadClients: [client(1)] },
			profiles: [{ id: 2, name: "Quality" }],
		});
		fixture.sqlite.exec(
			"CREATE TRIGGER fail_profile BEFORE INSERT ON download_profiles BEGIN SELECT RAISE(ABORT, 'profile write failed'); END;",
		);
		await expect(
			plan.applyPersistedImportPlan(sourceId, [
				key("setting:download-client:1"),
				key("profile:quality:2"),
			]),
		).rejects.toThrow("profile write failed");
		expect(fixture.db.select().from(downloadClients).all()).toEqual([]);
		expect(fixture.db.select().from(downloadProfiles).all()).toEqual([]);
		expect(fixture.db.select().from(importProvenance).all()).toEqual([]);
		expect(fixture.db.select().from(importReviewItems).all()).toEqual([]);
	});
	it("preserves existing review identity while updating its canonical payload", async () => {
		save({ library: { books: [{ id: 1, title: "Unmatched" }] } });
		await plan.applyPersistedImportPlan(sourceId, [key("book:1")]);
		const first = fixture.db.select().from(importReviewItems).get();
		save(
			{ library: { books: [{ id: 1, title: "Updated" }] } },
			sourceId,
			new Date("2026-10-02"),
		);
		await plan.applyPersistedImportPlan(sourceId, [key("book:1")]);
		const last = fixture.db.select().from(importReviewItems).get();
		expect(last?.id).toBe(first?.id);
		expect(last?.payload).toMatchObject({ title: "Updated" });
	});
});
