import * as fs from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	bookFiles,
	books,
	downloadProfiles,
	episodeFiles,
	episodes,
	history,
	movieFiles,
	movies,
	seasons,
	shows,
	unmappedFiles,
} from "src/db/schema";
import { createSqliteFixture } from "src/test/sqlite-fixture";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./logger", () => ({
	logWarn: vi.fn(),
	logInfo: vi.fn(),
	logError: vi.fn(),
}));
vi.mock("./event-bus", () => ({ eventBus: { emit: vi.fn() } }));
vi.mock("./media-probe", () => ({
	probeAudioFile: vi.fn().mockResolvedValue(null),
	probeEbookFile: vi.fn().mockReturnValue(null),
	probeVideoFile: vi.fn().mockResolvedValue(null),
}));
vi.mock("./settings-reader", () => ({
	default: (_key: string, fallback: unknown) => fallback,
}));
let fixture: ReturnType<typeof createSqliteFixture>;
let directory: string;
let mapping: typeof import("./unmapped-file-mapping");
let profileId: number;
let targets: { book: number; movie: number; episode: number };
beforeEach(async () => {
	vi.resetModules();
	fixture = createSqliteFixture();
	directory = fs.mkdtempSync(join(tmpdir(), "allstarr-mapping-"));
	const book = fixture.db
		.insert(books)
		.values({ title: "Book" })
		.returning()
		.get();
	const movie = fixture.db
		.insert(movies)
		.values({ title: "Movie", sortTitle: "Movie", tmdbId: 1 })
		.returning()
		.get();
	const show = fixture.db
		.insert(shows)
		.values({ title: "Show", sortTitle: "Show", tmdbId: 2 })
		.returning()
		.get();
	const season = fixture.db
		.insert(seasons)
		.values({ showId: show.id, seasonNumber: 1 })
		.returning()
		.get();
	const episode = fixture.db
		.insert(episodes)
		.values({
			showId: show.id,
			seasonId: season.id,
			episodeNumber: 1,
			tmdbId: 3,
		})
		.returning()
		.get();
	targets = { book: book.id, movie: movie.id, episode: episode.id };
	profileId = fixture.db
		.insert(downloadProfiles)
		.values({ name: "Test", rootFolderPath: join(directory, "library") })
		.returning()
		.get().id;
	vi.doMock("src/db", () => ({ db: fixture.db }));
	mapping = await import("./unmapped-file-mapping");
});
afterEach(() => {
	vi.doUnmock("src/db");
	vi.doUnmock("node:fs");
	vi.restoreAllMocks();
	fixture.close();
	fs.rmSync(directory, { recursive: true, force: true });
});
function incoming(
	entityType: "book" | "movie" | "episode",
	name = entityType === "book" ? "Book.epub" : "Source.mkv",
) {
	const path = join(directory, "incoming", name);
	fs.mkdirSync(join(directory, "incoming"), { recursive: true });
	fs.writeFileSync(path, "original media");
	return fixture.db
		.insert(unmappedFiles)
		.values({
			path,
			rootFolderPath: directory,
			contentType:
				entityType === "book"
					? "ebook"
					: entityType === "movie"
						? "movie"
						: "tv",
			format: entityType === "book" ? "EPUB" : "MKV",
			size: 14,
		})
		.returning()
		.get();
}
function request(entityType: "book" | "movie" | "episode", id: number) {
	const data = mapping.mappingInputSchema.parse({
		downloadProfileId: profileId,
		rows: [{ entityType, entityId: targets[entityType], unmappedFileId: id }],
	});
	if (!("rows" in data)) throw new Error("Expected Mapping rows");
	return data;
}
function placed(entityType: "book" | "movie" | "episode") {
	if (entityType === "book") return fixture.db.select().from(bookFiles).all();
	if (entityType === "movie") return fixture.db.select().from(movieFiles).all();
	return fixture.db.select().from(episodeFiles).all();
}

describe("Mapping execution interface with SQLite and files", () => {
	it.each(["book", "movie", "episode"] as const)(
		"commits %s file placement, history and unmapped-row removal together",
		async (entityType) => {
			const file = incoming(entityType);
			expect(
				await mapping.executeMapping(request(entityType, file.id)),
			).toMatchObject({ mappedCount: 1, failedCount: 0, warnings: [] });
			const row = placed(entityType)[0];
			if (!row) throw new Error("Missing placed file");
			expect(fs.readFileSync(row.path, "utf8")).toBe("original media");
			expect(fs.existsSync(file.path)).toBe(false);
			expect(fixture.db.select().from(unmappedFiles).all()).toEqual([]);
			expect(fixture.db.select().from(history).all()).toHaveLength(1);
		},
	);
	it.each(["book", "movie", "episode"] as const)(
		"restores the %s source and rolls back database writes on commit failure",
		async (entityType) => {
			const file = incoming(entityType);
			fixture.sqlite.exec(
				"CREATE TRIGGER reject_history BEFORE INSERT ON history BEGIN SELECT RAISE(ABORT, 'history unavailable'); END;",
			);
			const result = await mapping.executeMapping(request(entityType, file.id));
			expect(result).toMatchObject({
				mappedCount: 0,
				failedCount: 1,
				failures: [
					expect.objectContaining({
						unmappedFileId: file.id,
						message: "history unavailable",
					}),
				],
			});
			expect(fs.readFileSync(file.path, "utf8")).toBe("original media");
			expect(placed(entityType)).toEqual([]);
			expect(fixture.db.select().from(history).all()).toEqual([]);
			expect(fixture.db.select().from(unmappedFiles).all()).toHaveLength(1);
		},
	);
	it("continues a batch after a row transaction fails and keeps the failed source retryable", async () => {
		const failed = incoming("book", "First.epub");
		const succeeded = incoming("book", "Second.epub");
		fixture.sqlite.exec(
			"CREATE TRIGGER reject_first BEFORE INSERT ON history WHEN json_extract(NEW.data, '$.path') LIKE '%First.epub' BEGIN SELECT RAISE(ABORT, 'first row failed'); END;",
		);
		const requestData = request("book", failed.id);
		requestData.rows.push({
			entityType: "book",
			entityId: targets.book,
			unmappedFileId: succeeded.id,
			assets: [],
		});
		const result = await mapping.executeMapping(requestData);
		expect(result).toMatchObject({
			mappedCount: 1,
			failedCount: 1,
			failures: [expect.objectContaining({ unmappedFileId: failed.id })],
		});
		expect(fs.readFileSync(failed.path, "utf8")).toBe("original media");
		expect(fs.existsSync(succeeded.path)).toBe(false);
		expect(placed("book")).toHaveLength(1);
		expect(fixture.db.select().from(history).all()).toHaveLength(1);
	});
	it("keeps committed placement when deselected-asset cleanup fails and returns a warning", async () => {
		const file = incoming("book");
		const assetPath = join(directory, "incoming", "Book.cover.jpg");
		fs.writeFileSync(assetPath, "related asset");
		vi.doMock("node:fs", () => ({
			...fs,
			rmSync: (
				path: Parameters<typeof fs.rmSync>[0],
				options: Parameters<typeof fs.rmSync>[1],
			) => {
				if (path === assetPath) throw new Error("cleanup unavailable");
				return fs.rmSync(path, options);
			},
		}));
		const data = mapping.mappingInputSchema.parse({
			downloadProfileId: profileId,
			moveRelatedFiles: true,
			deleteDeselectedRelatedFiles: true,
			rows: [
				{
					entityType: "book",
					entityId: targets.book,
					unmappedFileId: file.id,
					assets: [
						{
							sourcePath: assetPath,
							selected: false,
							action: "delete",
							kind: "file",
							ownershipReason: "direct",
						},
					],
				},
			],
		});
		const result = await mapping.executeMapping(data);
		expect(result).toMatchObject({
			mappedCount: 1,
			failedCount: 0,
			warnings: [expect.objectContaining({ message: "cleanup unavailable" })],
		});
		const row = placed("book")[0];
		if (!row) throw new Error("Missing placed file");
		expect(fs.readFileSync(row.path, "utf8")).toBe("original media");
		expect(fs.existsSync(file.path)).toBe(false);
		expect(fs.existsSync(assetPath)).toBe(true);
		expect(fixture.db.select().from(history).all()).toHaveLength(1);
		expect(fixture.db.select().from(unmappedFiles).all()).toEqual([]);
	});
	it("retains legacy in-place episode Mapping behavior", async () => {
		const file = incoming("episode");
		const data = mapping.mappingInputSchema.parse({
			downloadProfileId: profileId,
			entityType: "episode",
			entityId: targets.episode,
			unmappedFileIds: [file.id],
		});
		expect(await mapping.executeMapping(data)).toMatchObject({
			mappedCount: 1,
		});
		expect(placed("episode")[0]?.path).toBe(file.path);
		expect(fs.existsSync(file.path)).toBe(true);
	});
	it("previews related assets through the same Mapping module without moving files", async () => {
		const file = incoming("book");
		const assetPath = join(directory, "incoming", "Book.cover.jpg");
		fs.writeFileSync(assetPath, "related asset");
		const preview = await mapping.previewMappingAssets({
			rows: [{ fileId: file.id, path: file.path, contentType: "book" }],
		});
		expect(preview.rows[0]?.assets).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ sourcePath: assetPath }),
			]),
		);
		expect(fs.existsSync(file.path)).toBe(true);
		expect(placed("book")).toEqual([]);
	});
});
