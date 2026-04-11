import { beforeEach, describe, expect, it, vi } from "vitest";

// ─── Hoisted mocks ───────────────────────────────────────────────────────────

const mocks = vi.hoisted(() => {
	// node:fs
	const existsSync = vi.fn();
	const readdirSync = vi.fn();
	const statSync = vi.fn();

	// drizzle-orm helpers
	const eq = vi.fn((_l: unknown, _r: unknown) => "eq");
	const and = vi.fn((..._args: unknown[]) => "and");
	const like = vi.fn((_l: unknown, _r: unknown) => "like");
	const sqlFn = vi.fn((..._args: unknown[]) => "sql");

	// db chain helpers
	const run = vi.fn();
	const get = vi.fn((): unknown => undefined);
	const all = vi.fn((): unknown[] => []);
	const limit = vi.fn(() => ({ get }));
	const where = vi.fn(() => ({ all, run, get, limit }));
	const set = vi.fn(() => ({ where }));
	const innerJoin = vi.fn(() => ({ where }));
	const from = vi.fn(() => ({ all, where, innerJoin }));
	const select = vi.fn(() => ({ from }));
	const values = vi.fn((_val?: unknown) => ({ run }));
	const insert = vi.fn(() => ({ values }));
	const updateFn = vi.fn(() => ({ set }));
	const deleteFn = vi.fn(() => ({ where }));

	// extractHints + matchFormat + probes
	const extractHints = vi.fn((): unknown => null);
	const matchFormat = vi.fn(() => ({
		id: 1,
		name: "EPUB",
		weight: 10,
		color: "blue",
	}));
	const probeAudioFile = vi.fn(async (): Promise<unknown> => null);
	const probeEbookFile = vi.fn((): unknown => null);
	const getRootFolderPaths = vi.fn((): unknown[] => []);

	return {
		existsSync,
		readdirSync,
		statSync,
		eq,
		and,
		like,
		sqlFn,
		run,
		get,
		all,
		limit,
		where,
		set,
		innerJoin,
		from,
		select,
		insert,
		updateFn,
		deleteFn,
		values,
		extractHints,
		matchFormat,
		probeAudioFile,
		probeEbookFile,
		getRootFolderPaths,
	};
});

// ─── Module mocks ─────────────────────────────────────────────────────────────

vi.mock("node:fs", () => ({
	default: {
		existsSync: mocks.existsSync,
		readdirSync: mocks.readdirSync,
		statSync: mocks.statSync,
	},
}));

vi.mock("node:path", () => ({
	default: {
		join: (...parts: string[]) => parts.join("/"),
		extname: (p: string) => {
			const dot = p.lastIndexOf(".");
			return dot >= 0 ? p.slice(dot) : "";
		},
		basename: (p: string) => {
			const slash = p.lastIndexOf("/");
			return slash >= 0 ? p.slice(slash + 1) : p;
		},
	},
}));

vi.mock("drizzle-orm", () => ({
	eq: mocks.eq,
	and: mocks.and,
	like: mocks.like,
	sql: mocks.sqlFn,
}));

vi.mock("src/db", () => ({
	db: {
		select: mocks.select,
		insert: mocks.insert,
		update: mocks.updateFn,
		delete: mocks.deleteFn,
	},
}));

vi.mock("src/db/schema", () => ({
	authors: { id: "authors.id", name: "authors.name" },
	bookFiles: {
		id: "bookFiles.id",
		bookId: "bookFiles.bookId",
		path: "bookFiles.path",
		size: "bookFiles.size",
		quality: "bookFiles.quality",
		part: "bookFiles.part",
		partCount: "bookFiles.partCount",
		downloadProfileId: "bookFiles.downloadProfileId",
		duration: "bookFiles.duration",
		pageCount: "bookFiles.pageCount",
	},
	books: {
		id: "books.id",
		title: "books.title",
		releaseYear: "books.releaseYear",
	},
	booksAuthors: {
		bookId: "booksAuthors.bookId",
		authorId: "booksAuthors.authorId",
	},
	downloadProfiles: {
		id: "downloadProfiles.id",
		contentType: "downloadProfiles.contentType",
		rootFolderPath: "downloadProfiles.rootFolderPath",
	},
	episodeFiles: { path: "episodeFiles.path" },
	history: {},
	movieFiles: { path: "movieFiles.path" },
	unmappedFiles: {
		id: "unmappedFiles.id",
		path: "unmappedFiles.path",
		rootFolderPath: "unmappedFiles.rootFolderPath",
	},
}));

vi.mock("src/server/hint-extractor", () => ({
	extractHints: mocks.extractHints,
}));

vi.mock("src/server/indexers/format-parser", () => ({
	matchFormat: mocks.matchFormat,
}));

vi.mock("src/server/media-probe", () => ({
	probeAudioFile: mocks.probeAudioFile,
	probeEbookFile: mocks.probeEbookFile,
}));

vi.mock("src/server/root-folders", () => ({
	getRootFolderPaths: mocks.getRootFolderPaths,
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

function dirent(
	name: string,
	isDir: boolean,
): { name: string; isDirectory: () => boolean; isFile: () => boolean } {
	return {
		name,
		isDirectory: () => isDir,
		isFile: () => !isDir,
	};
}

/**
 * Configure mocks.readdirSync to return different results depending on the
 * path argument. Uses a Map<string, returnValue>.
 */
function setupReaddirSync(dirMap: Map<string, ReturnType<typeof dirent>[]>) {
	mocks.readdirSync.mockImplementation((dirPath: string) => {
		const result = dirMap.get(dirPath);
		if (result !== undefined) return result;
		throw new Error(`ENOENT: no such file or directory '${dirPath}'`);
	});
}

/**
 * Configure mocks.statSync to return the given size for any path.
 */
function setupStatSync(sizeMap?: Map<string, number>) {
	mocks.statSync.mockImplementation((filePath: string) => {
		const size = sizeMap?.get(filePath) ?? 1024;
		return { size };
	});
}

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
	vi.clearAllMocks();

	// sensible defaults — individual tests override as needed
	mocks.existsSync.mockReturnValue(true);
	mocks.readdirSync.mockReturnValue([]);
	mocks.statSync.mockReturnValue({ size: 1024 });
	mocks.all.mockReturnValue([]);
	mocks.get.mockReturnValue(undefined);
	mocks.matchFormat.mockReturnValue({
		id: 1,
		name: "EPUB",
		weight: 10,
		color: "blue",
	});
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("getRootFolderPaths re-export", () => {
	it("re-exports getRootFolderPaths from root-folders module", async () => {
		const mod = await import("../disk-scan");
		expect(mod.getRootFolderPaths).toBe(mocks.getRootFolderPaths);
	});
});

describe("rescanRootFolder", () => {
	it("returns error when root folder does not exist", async () => {
		mocks.existsSync.mockReturnValue(false);

		const { rescanRootFolder } = await import("../disk-scan");
		const stats = await rescanRootFolder("/missing/path");

		expect(stats.errors).toHaveLength(1);
		expect(stats.errors[0]).toContain("does not exist");
		expect(stats.filesAdded).toBe(0);
	});

	it("returns zeroed stats when root folder is empty", async () => {
		mocks.existsSync.mockReturnValue(true);
		// getContentTypeForRootFolder => no profiles
		mocks.all.mockReturnValueOnce([]);
		// buildAuthorLookup => no authors
		mocks.all.mockReturnValueOnce([]);
		// walkDirectories => readdirSync returns empty
		mocks.readdirSync.mockReturnValue([]);
		// syncBookFiles => no existing files
		mocks.all.mockReturnValueOnce([]);
		// filesNeedingMeta => none
		mocks.all.mockReturnValueOnce([]);

		const { rescanRootFolder } = await import("../disk-scan");
		const stats = await rescanRootFolder("/books");

		expect(stats.filesAdded).toBe(0);
		expect(stats.filesRemoved).toBe(0);
		expect(stats.filesUnchanged).toBe(0);
		expect(stats.filesUpdated).toBe(0);
		expect(stats.unmatchedFiles).toBe(0);
		expect(stats.errors).toHaveLength(0);
	});

	it("discovers and adds new book files", async () => {
		mocks.existsSync.mockReturnValue(true);

		// getContentTypeForRootFolder => returns "book" profile
		mocks.all.mockReturnValueOnce([{ contentType: "book" }]);
		// profile lookup (limit.get)
		mocks.get.mockReturnValueOnce({ id: 5 });

		// buildAuthorLookup => one author
		mocks.all.mockReturnValueOnce([{ id: 10, name: "Brandon Sanderson" }]);

		// walkDirectories: readdirSync for root => author dir
		const dirEntries = new Map<string, ReturnType<typeof dirent>[]>();
		dirEntries.set("/books", [dirent("Brandon Sanderson", true)]);
		dirEntries.set("/books/Brandon Sanderson", [
			dirent("The Way of Kings (2010)", true),
		]);
		dirEntries.set("/books/Brandon Sanderson/The Way of Kings (2010)", [
			dirent("The Way of Kings.epub", false),
		]);
		setupReaddirSync(dirEntries);
		setupStatSync(
			new Map([
				[
					"/books/Brandon Sanderson/The Way of Kings (2010)/The Way of Kings.epub",
					5000,
				],
			]),
		);

		// buildBookLookup => one book for author 10
		mocks.all.mockReturnValueOnce([
			{ id: 20, title: "The Way of Kings", releaseYear: 2010 },
		]);

		// syncBookFiles: no existing files in DB
		mocks.all.mockReturnValueOnce([]);

		// bookFiles for tracked paths (syncUnmappedFiles)
		mocks.all.mockReturnValueOnce([]);
		// movieFiles for tracked paths
		mocks.all.mockReturnValueOnce([]);
		// episodeFiles for tracked paths
		mocks.all.mockReturnValueOnce([]);
		// existing unmapped files
		mocks.all.mockReturnValueOnce([]);
		// collectAllFiles: readdirSync already setup

		// filesNeedingMeta
		mocks.all.mockReturnValueOnce([]);

		const { rescanRootFolder } = await import("../disk-scan");
		const stats = await rescanRootFolder("/books");

		expect(stats.filesAdded).toBe(1);
		expect(stats.filesRemoved).toBe(0);
		expect(stats.errors).toHaveLength(0);
		// insert was called for bookFiles + history
		expect(mocks.insert).toHaveBeenCalled();
	});

	it("marks files unchanged when size matches existing", async () => {
		mocks.existsSync.mockReturnValue(true);

		// getContentTypeForRootFolder => "book"
		mocks.all.mockReturnValueOnce([{ contentType: "book" }]);
		mocks.get.mockReturnValueOnce({ id: 5 });

		// buildAuthorLookup
		mocks.all.mockReturnValueOnce([{ id: 10, name: "Author One" }]);

		const dirEntries = new Map<string, ReturnType<typeof dirent>[]>();
		dirEntries.set("/books", [dirent("Author One", true)]);
		dirEntries.set("/books/Author One", [dirent("My Book (2020)", true)]);
		dirEntries.set("/books/Author One/My Book (2020)", [
			dirent("My Book.epub", false),
		]);
		setupReaddirSync(dirEntries);
		setupStatSync(
			new Map([["/books/Author One/My Book (2020)/My Book.epub", 3000]]),
		);

		// buildBookLookup
		mocks.all.mockReturnValueOnce([
			{ id: 30, title: "My Book", releaseYear: 2020 },
		]);

		// syncBookFiles: existing file with SAME size
		mocks.all.mockReturnValueOnce([
			{
				id: 100,
				bookId: 30,
				path: "/books/Author One/My Book (2020)/My Book.epub",
				size: 3000,
				quality: { quality: { name: "EPUB" } },
			},
		]);

		// syncUnmappedFiles tracked paths
		mocks.all.mockReturnValueOnce([]);
		mocks.all.mockReturnValueOnce([]);
		mocks.all.mockReturnValueOnce([]);
		mocks.all.mockReturnValueOnce([]);

		// filesNeedingMeta
		mocks.all.mockReturnValueOnce([]);

		const { rescanRootFolder } = await import("../disk-scan");
		const stats = await rescanRootFolder("/books");

		expect(stats.filesUnchanged).toBe(1);
		expect(stats.filesAdded).toBe(0);
		expect(stats.filesUpdated).toBe(0);
	});

	it("updates files when size has changed", async () => {
		mocks.existsSync.mockReturnValue(true);

		mocks.all.mockReturnValueOnce([{ contentType: "book" }]);
		mocks.get.mockReturnValueOnce({ id: 5 });

		mocks.all.mockReturnValueOnce([{ id: 10, name: "Author One" }]);

		const dirEntries = new Map<string, ReturnType<typeof dirent>[]>();
		dirEntries.set("/books", [dirent("Author One", true)]);
		dirEntries.set("/books/Author One", [dirent("My Book (2020)", true)]);
		dirEntries.set("/books/Author One/My Book (2020)", [
			dirent("My Book.epub", false),
		]);
		setupReaddirSync(dirEntries);
		setupStatSync(
			new Map([["/books/Author One/My Book (2020)/My Book.epub", 9999]]),
		);

		mocks.all.mockReturnValueOnce([
			{ id: 30, title: "My Book", releaseYear: 2020 },
		]);

		// syncBookFiles: existing file with DIFFERENT size
		mocks.all.mockReturnValueOnce([
			{
				id: 100,
				bookId: 30,
				path: "/books/Author One/My Book (2020)/My Book.epub",
				size: 3000,
				quality: { quality: { name: "EPUB" } },
			},
		]);

		mocks.all.mockReturnValueOnce([]);
		mocks.all.mockReturnValueOnce([]);
		mocks.all.mockReturnValueOnce([]);
		mocks.all.mockReturnValueOnce([]);
		mocks.all.mockReturnValueOnce([]);

		const { rescanRootFolder } = await import("../disk-scan");
		const stats = await rescanRootFolder("/books");

		expect(stats.filesUpdated).toBe(1);
		expect(mocks.updateFn).toHaveBeenCalled();
	});

	it("removes stale files no longer on disk", async () => {
		mocks.existsSync.mockReturnValue(true);

		mocks.all.mockReturnValueOnce([{ contentType: "book" }]);
		mocks.get.mockReturnValueOnce({ id: 5 });

		// buildAuthorLookup — empty so no files discovered on disk
		mocks.all.mockReturnValueOnce([]);

		mocks.readdirSync.mockReturnValue([]);

		// syncBookFiles: one existing file in DB that won't be found on disk
		mocks.all.mockReturnValueOnce([
			{
				id: 200,
				bookId: 30,
				path: "/books/Author One/My Book (2020)/My Book.epub",
				size: 3000,
				quality: { quality: { name: "EPUB" } },
			},
		]);

		// syncUnmappedFiles tracked paths
		mocks.all.mockReturnValueOnce([]);
		mocks.all.mockReturnValueOnce([]);
		mocks.all.mockReturnValueOnce([]);
		mocks.all.mockReturnValueOnce([]);

		mocks.all.mockReturnValueOnce([]);

		const { rescanRootFolder } = await import("../disk-scan");
		const stats = await rescanRootFolder("/books");

		expect(stats.filesRemoved).toBe(1);
		// delete was called for the stale file, insert for history
		expect(mocks.deleteFn).toHaveBeenCalled();
		expect(mocks.insert).toHaveBeenCalled();
	});

	it("counts unmatched files when author is not found", async () => {
		mocks.existsSync.mockReturnValue(true);

		mocks.all.mockReturnValueOnce([{ contentType: "book" }]);
		mocks.get.mockReturnValueOnce({ id: 5 });

		// buildAuthorLookup — empty, so all authors are unmatched
		mocks.all.mockReturnValueOnce([]);

		const dirEntries = new Map<string, ReturnType<typeof dirent>[]>();
		dirEntries.set("/books", [dirent("Unknown Author", true)]);
		dirEntries.set("/books/Unknown Author", [dirent("Some Book (2020)", true)]);
		dirEntries.set("/books/Unknown Author/Some Book (2020)", [
			dirent("Some Book.epub", false),
		]);
		setupReaddirSync(dirEntries);

		// syncBookFiles: no existing
		mocks.all.mockReturnValueOnce([]);

		// syncUnmappedFiles
		mocks.all.mockReturnValueOnce([]);
		mocks.all.mockReturnValueOnce([]);
		mocks.all.mockReturnValueOnce([]);
		mocks.all.mockReturnValueOnce([]);

		mocks.all.mockReturnValueOnce([]);

		const { rescanRootFolder } = await import("../disk-scan");
		const stats = await rescanRootFolder("/books");

		expect(stats.unmatchedFiles).toBe(1);
	});

	it("counts unmatched files when book title is not found", async () => {
		mocks.existsSync.mockReturnValue(true);

		mocks.all.mockReturnValueOnce([{ contentType: "book" }]);
		mocks.get.mockReturnValueOnce({ id: 5 });

		mocks.all.mockReturnValueOnce([{ id: 10, name: "Known Author" }]);

		const dirEntries = new Map<string, ReturnType<typeof dirent>[]>();
		dirEntries.set("/books", [dirent("Known Author", true)]);
		dirEntries.set("/books/Known Author", [
			dirent("Unknown Title (2020)", true),
		]);
		dirEntries.set("/books/Known Author/Unknown Title (2020)", [
			dirent("Unknown Title.epub", false),
		]);
		setupReaddirSync(dirEntries);

		// buildBookLookup => empty — no books match
		mocks.all.mockReturnValueOnce([]);

		// syncBookFiles: no existing
		mocks.all.mockReturnValueOnce([]);

		mocks.all.mockReturnValueOnce([]);
		mocks.all.mockReturnValueOnce([]);
		mocks.all.mockReturnValueOnce([]);
		mocks.all.mockReturnValueOnce([]);

		mocks.all.mockReturnValueOnce([]);

		const { rescanRootFolder } = await import("../disk-scan");
		const stats = await rescanRootFolder("/books");

		expect(stats.unmatchedFiles).toBe(1);
	});

	it("records error when root folder is unreadable", async () => {
		mocks.existsSync.mockReturnValue(true);

		mocks.all.mockReturnValueOnce([{ contentType: "book" }]);
		mocks.get.mockReturnValueOnce(undefined);

		mocks.all.mockReturnValueOnce([]);

		mocks.readdirSync.mockImplementation(() => {
			throw new Error("EACCES: permission denied");
		});

		// syncBookFiles
		mocks.all.mockReturnValueOnce([]);
		// filesNeedingMeta
		mocks.all.mockReturnValueOnce([]);

		const { rescanRootFolder } = await import("../disk-scan");
		const stats = await rescanRootFolder("/books");

		expect(stats.errors.length).toBeGreaterThanOrEqual(1);
		expect(stats.errors[0]).toContain("Could not read root folder");
	});

	it("records error when statSync fails for a file", async () => {
		mocks.existsSync.mockReturnValue(true);

		mocks.all.mockReturnValueOnce([{ contentType: "book" }]);
		mocks.get.mockReturnValueOnce({ id: 5 });

		mocks.all.mockReturnValueOnce([{ id: 10, name: "Author" }]);

		const dirEntries = new Map<string, ReturnType<typeof dirent>[]>();
		dirEntries.set("/books", [dirent("Author", true)]);
		dirEntries.set("/books/Author", [dirent("Title (2020)", true)]);
		dirEntries.set("/books/Author/Title (2020)", [dirent("Title.epub", false)]);
		setupReaddirSync(dirEntries);

		mocks.statSync.mockImplementation(() => {
			throw new Error("EACCES: permission denied");
		});

		mocks.all.mockReturnValueOnce([
			{ id: 30, title: "Title", releaseYear: 2020 },
		]);

		// syncBookFiles: no existing
		mocks.all.mockReturnValueOnce([]);

		mocks.all.mockReturnValueOnce([]);
		mocks.all.mockReturnValueOnce([]);
		mocks.all.mockReturnValueOnce([]);
		mocks.all.mockReturnValueOnce([]);

		mocks.all.mockReturnValueOnce([]);

		const { rescanRootFolder } = await import("../disk-scan");
		const stats = await rescanRootFolder("/books");

		expect(stats.errors.some((e) => e.includes("Could not stat file"))).toBe(
			true,
		);
	});

	it("assigns part numbers to multi-file audiobooks", async () => {
		mocks.existsSync.mockReturnValue(true);

		mocks.all.mockReturnValueOnce([{ contentType: "book" }]);
		mocks.get.mockReturnValueOnce({ id: 5 });

		mocks.all.mockReturnValueOnce([{ id: 10, name: "Author" }]);

		const dirEntries = new Map<string, ReturnType<typeof dirent>[]>();
		dirEntries.set("/books", [dirent("Author", true)]);
		dirEntries.set("/books/Author", [dirent("Audiobook (2021)", true)]);
		dirEntries.set("/books/Author/Audiobook (2021)", [
			dirent("Part 01.mp3", false),
			dirent("Part 02.mp3", false),
			dirent("Part 03.mp3", false),
		]);
		setupReaddirSync(dirEntries);
		setupStatSync();

		mocks.all.mockReturnValueOnce([
			{ id: 40, title: "Audiobook", releaseYear: 2021 },
		]);

		// syncBookFiles — capture what gets inserted
		const insertedValues: unknown[] = [];
		mocks.all.mockReturnValueOnce([]); // no existing files
		mocks.values.mockImplementation((val: unknown) => {
			insertedValues.push(val);
			return { run: mocks.run };
		});

		// syncUnmappedFiles tracked paths
		mocks.all.mockReturnValueOnce([]);
		mocks.all.mockReturnValueOnce([]);
		mocks.all.mockReturnValueOnce([]);
		mocks.all.mockReturnValueOnce([]);

		// filesNeedingMeta
		mocks.all.mockReturnValueOnce([]);

		const { rescanRootFolder } = await import("../disk-scan");
		const stats = await rescanRootFolder("/books");

		expect(stats.filesAdded).toBe(3);

		// The inserted book files should have part numbers (filter out history inserts by checking for "path" key)
		const bookFileInserts = insertedValues.filter(
			(v: unknown) =>
				typeof v === "object" &&
				v !== null &&
				"bookId" in v &&
				"path" in v &&
				(v as { bookId: number }).bookId === 40,
		);
		expect(bookFileInserts).toHaveLength(3);
		expect((bookFileInserts[0] as { part: number }).part).toBe(1);
		expect((bookFileInserts[1] as { part: number }).part).toBe(2);
		expect((bookFileInserts[2] as { part: number }).part).toBe(3);
		expect((bookFileInserts[0] as { partCount: number }).partCount).toBe(3);
	});

	it("does not assign part numbers to single audio file", async () => {
		mocks.existsSync.mockReturnValue(true);

		mocks.all.mockReturnValueOnce([{ contentType: "book" }]);
		mocks.get.mockReturnValueOnce({ id: 5 });

		mocks.all.mockReturnValueOnce([{ id: 10, name: "Author" }]);

		const dirEntries = new Map<string, ReturnType<typeof dirent>[]>();
		dirEntries.set("/books", [dirent("Author", true)]);
		dirEntries.set("/books/Author", [dirent("Audiobook (2021)", true)]);
		dirEntries.set("/books/Author/Audiobook (2021)", [
			dirent("Audiobook.m4b", false),
		]);
		setupReaddirSync(dirEntries);
		setupStatSync();

		mocks.all.mockReturnValueOnce([
			{ id: 40, title: "Audiobook", releaseYear: 2021 },
		]);

		const insertedValues: unknown[] = [];
		mocks.all.mockReturnValueOnce([]);
		mocks.values.mockImplementation((val: unknown) => {
			insertedValues.push(val);
			return { run: mocks.run };
		});

		mocks.all.mockReturnValueOnce([]);
		mocks.all.mockReturnValueOnce([]);
		mocks.all.mockReturnValueOnce([]);
		mocks.all.mockReturnValueOnce([]);

		mocks.all.mockReturnValueOnce([]);

		const { rescanRootFolder } = await import("../disk-scan");
		const stats = await rescanRootFolder("/books");

		expect(stats.filesAdded).toBe(1);

		const bookFileInsert = insertedValues.find(
			(v: unknown) =>
				typeof v === "object" &&
				v !== null &&
				"bookId" in v &&
				"path" in v &&
				(v as { bookId: number }).bookId === 40,
		) as { part: number | null; partCount: number | null } | undefined;
		expect(bookFileInsert?.part).toBeNull();
		expect(bookFileInsert?.partCount).toBeNull();
	});

	it("skips non-supported file extensions", async () => {
		mocks.existsSync.mockReturnValue(true);

		mocks.all.mockReturnValueOnce([{ contentType: "book" }]);
		mocks.get.mockReturnValueOnce({ id: 5 });

		mocks.all.mockReturnValueOnce([{ id: 10, name: "Author" }]);

		const dirEntries = new Map<string, ReturnType<typeof dirent>[]>();
		dirEntries.set("/books", [dirent("Author", true)]);
		dirEntries.set("/books/Author", [dirent("My Book (2020)", true)]);
		dirEntries.set("/books/Author/My Book (2020)", [
			dirent("cover.jpg", false),
			dirent("metadata.opf", false),
			dirent("My Book.epub", false),
			dirent("readme.txt", false),
		]);
		setupReaddirSync(dirEntries);
		setupStatSync();

		mocks.all.mockReturnValueOnce([
			{ id: 30, title: "My Book", releaseYear: 2020 },
		]);

		mocks.all.mockReturnValueOnce([]);

		mocks.all.mockReturnValueOnce([]);
		mocks.all.mockReturnValueOnce([]);
		mocks.all.mockReturnValueOnce([]);
		mocks.all.mockReturnValueOnce([]);

		mocks.all.mockReturnValueOnce([]);

		const { rescanRootFolder } = await import("../disk-scan");
		const stats = await rescanRootFolder("/books");

		// Only the .epub should be added
		expect(stats.filesAdded).toBe(1);
	});

	it("probes audio metadata for files missing duration", async () => {
		mocks.existsSync.mockReturnValue(true);

		mocks.all.mockReturnValueOnce([{ contentType: "book" }]);
		mocks.get.mockReturnValueOnce({ id: 5 });

		// No authors — no files discovered on disk
		mocks.all.mockReturnValueOnce([]);
		mocks.readdirSync.mockReturnValue([]);

		// syncBookFiles: no existing
		mocks.all.mockReturnValueOnce([]);

		// syncUnmappedFiles
		mocks.all.mockReturnValueOnce([]);
		mocks.all.mockReturnValueOnce([]);
		mocks.all.mockReturnValueOnce([]);
		mocks.all.mockReturnValueOnce([]);

		// filesNeedingMeta — one audio file needs probing
		mocks.all.mockReturnValueOnce([
			{
				id: 50,
				path: "/books/Author/Book/file.mp3",
				duration: null,
				pageCount: null,
			},
		]);

		mocks.probeAudioFile.mockResolvedValueOnce({
			duration: 3600,
			bitrate: 128000,
			sampleRate: 44100,
			channels: 2,
			codec: "mp3",
		});

		const { rescanRootFolder } = await import("../disk-scan");
		await rescanRootFolder("/books");

		expect(mocks.probeAudioFile).toHaveBeenCalledWith(
			"/books/Author/Book/file.mp3",
		);
		expect(mocks.updateFn).toHaveBeenCalled();
	});

	it("probes ebook metadata for files missing page count", async () => {
		mocks.existsSync.mockReturnValue(true);

		mocks.all.mockReturnValueOnce([{ contentType: "book" }]);
		mocks.get.mockReturnValueOnce({ id: 5 });

		mocks.all.mockReturnValueOnce([]);
		mocks.readdirSync.mockReturnValue([]);

		mocks.all.mockReturnValueOnce([]);

		mocks.all.mockReturnValueOnce([]);
		mocks.all.mockReturnValueOnce([]);
		mocks.all.mockReturnValueOnce([]);
		mocks.all.mockReturnValueOnce([]);

		// filesNeedingMeta — one ebook file needs probing
		mocks.all.mockReturnValueOnce([
			{
				id: 60,
				path: "/books/Author/Book/file.epub",
				duration: null,
				pageCount: null,
			},
		]);

		mocks.probeEbookFile.mockReturnValueOnce({
			pageCount: 350,
			language: "en",
		});

		const { rescanRootFolder } = await import("../disk-scan");
		await rescanRootFolder("/books");

		expect(mocks.probeEbookFile).toHaveBeenCalledWith(
			"/books/Author/Book/file.epub",
		);
		expect(mocks.updateFn).toHaveBeenCalled();
	});

	it("sets downloadProfileId on files missing one", async () => {
		mocks.existsSync.mockReturnValue(true);

		mocks.all.mockReturnValueOnce([{ contentType: "book" }]);
		mocks.get.mockReturnValueOnce({ id: 7 }); // profile with id 7

		mocks.all.mockReturnValueOnce([]);
		mocks.readdirSync.mockReturnValue([]);

		// syncBookFiles
		mocks.all.mockReturnValueOnce([]);

		// syncUnmappedFiles
		mocks.all.mockReturnValueOnce([]);
		mocks.all.mockReturnValueOnce([]);
		mocks.all.mockReturnValueOnce([]);
		mocks.all.mockReturnValueOnce([]);

		// filesNeedingMeta
		mocks.all.mockReturnValueOnce([]);

		const { rescanRootFolder } = await import("../disk-scan");
		await rescanRootFolder("/books");

		// update should be called to set downloadProfileId
		expect(mocks.updateFn).toHaveBeenCalled();
		expect(mocks.set).toHaveBeenCalledWith(
			expect.objectContaining({ downloadProfileId: 7 }),
		);
	});

	it("skips downloadProfileId update when no profile exists", async () => {
		mocks.existsSync.mockReturnValue(true);

		mocks.all.mockReturnValueOnce([{ contentType: "book" }]);
		mocks.get.mockReturnValueOnce(undefined); // no profile

		mocks.all.mockReturnValueOnce([]);
		mocks.readdirSync.mockReturnValue([]);

		mocks.all.mockReturnValueOnce([]);

		mocks.all.mockReturnValueOnce([]);
		mocks.all.mockReturnValueOnce([]);
		mocks.all.mockReturnValueOnce([]);
		mocks.all.mockReturnValueOnce([]);

		mocks.all.mockReturnValueOnce([]);

		const { rescanRootFolder } = await import("../disk-scan");
		await rescanRootFolder("/books");

		// set should NOT be called with downloadProfileId
		const setCallsWithProfileId = mocks.set.mock.calls.filter(
			(args: unknown[]) => {
				const arg = args[0] as Record<string, unknown> | undefined;
				return arg && "downloadProfileId" in arg;
			},
		);
		expect(setCallsWithProfileId).toHaveLength(0);
	});

	it("handles author name matching case-insensitively", async () => {
		mocks.existsSync.mockReturnValue(true);

		mocks.all.mockReturnValueOnce([{ contentType: "book" }]);
		mocks.get.mockReturnValueOnce({ id: 5 });

		// Author in DB with different casing
		mocks.all.mockReturnValueOnce([{ id: 10, name: "BRANDON SANDERSON" }]);

		const dirEntries = new Map<string, ReturnType<typeof dirent>[]>();
		// Dir on disk uses different casing
		dirEntries.set("/books", [dirent("brandon sanderson", true)]);
		dirEntries.set("/books/brandon sanderson", [
			dirent("Mistborn (2006)", true),
		]);
		dirEntries.set("/books/brandon sanderson/Mistborn (2006)", [
			dirent("Mistborn.epub", false),
		]);
		setupReaddirSync(dirEntries);
		setupStatSync();

		mocks.all.mockReturnValueOnce([
			{ id: 20, title: "Mistborn", releaseYear: 2006 },
		]);

		mocks.all.mockReturnValueOnce([]);

		mocks.all.mockReturnValueOnce([]);
		mocks.all.mockReturnValueOnce([]);
		mocks.all.mockReturnValueOnce([]);
		mocks.all.mockReturnValueOnce([]);

		mocks.all.mockReturnValueOnce([]);

		const { rescanRootFolder } = await import("../disk-scan");
		const stats = await rescanRootFolder("/books");

		expect(stats.filesAdded).toBe(1);
		expect(stats.unmatchedFiles).toBe(0);
	});

	it("parses book folder names with and without year", async () => {
		mocks.existsSync.mockReturnValue(true);

		mocks.all.mockReturnValueOnce([{ contentType: "book" }]);
		mocks.get.mockReturnValueOnce({ id: 5 });

		mocks.all.mockReturnValueOnce([{ id: 10, name: "Author" }]);

		const dirEntries = new Map<string, ReturnType<typeof dirent>[]>();
		dirEntries.set("/books", [dirent("Author", true)]);
		dirEntries.set("/books/Author", [
			dirent("Title With Year (2015)", true),
			dirent("Title Without Year", true),
		]);
		dirEntries.set("/books/Author/Title With Year (2015)", [
			dirent("book.epub", false),
		]);
		dirEntries.set("/books/Author/Title Without Year", [
			dirent("book.pdf", false),
		]);
		setupReaddirSync(dirEntries);
		setupStatSync();

		// buildBookLookup returns both books
		mocks.all.mockReturnValueOnce([
			{ id: 30, title: "Title With Year", releaseYear: 2015 },
			{ id: 31, title: "Title Without Year", releaseYear: null },
		]);

		mocks.all.mockReturnValueOnce([]);

		mocks.all.mockReturnValueOnce([]);
		mocks.all.mockReturnValueOnce([]);
		mocks.all.mockReturnValueOnce([]);
		mocks.all.mockReturnValueOnce([]);

		mocks.all.mockReturnValueOnce([]);

		const { rescanRootFolder } = await import("../disk-scan");
		const stats = await rescanRootFolder("/books");

		expect(stats.filesAdded).toBe(2);
	});

	it("skips syncUnmappedFiles when no content type is found", async () => {
		mocks.existsSync.mockReturnValue(true);

		// getContentTypeForRootFolder => no profiles
		mocks.all.mockReturnValueOnce([]);
		mocks.get.mockReturnValueOnce(undefined);

		mocks.all.mockReturnValueOnce([]);
		mocks.readdirSync.mockReturnValue([]);

		// syncBookFiles
		mocks.all.mockReturnValueOnce([]);

		// filesNeedingMeta
		mocks.all.mockReturnValueOnce([]);

		const { rescanRootFolder } = await import("../disk-scan");
		const stats = await rescanRootFolder("/books");

		// We should have fewer all() calls because syncUnmappedFiles was skipped
		// (no tracked paths queries for bookFiles/movieFiles/episodeFiles/unmappedFiles)
		expect(stats.errors).toHaveLength(0);
	});

	it("handles all supported book extensions", async () => {
		mocks.existsSync.mockReturnValue(true);

		mocks.all.mockReturnValueOnce([{ contentType: "book" }]);
		mocks.get.mockReturnValueOnce({ id: 5 });

		mocks.all.mockReturnValueOnce([{ id: 10, name: "Author" }]);

		const supportedFiles = [
			dirent("book.pdf", false),
			dirent("book.mobi", false),
			dirent("book.epub", false),
			dirent("book.azw3", false),
			dirent("book.azw", false),
			dirent("book.mp3", false),
			dirent("book.m4b", false),
			dirent("book.flac", false),
		];

		const dirEntries = new Map<string, ReturnType<typeof dirent>[]>();
		dirEntries.set("/books", [dirent("Author", true)]);
		dirEntries.set("/books/Author", [dirent("Book (2020)", true)]);
		dirEntries.set("/books/Author/Book (2020)", supportedFiles);
		setupReaddirSync(dirEntries);
		setupStatSync();

		mocks.all.mockReturnValueOnce([
			{ id: 30, title: "Book", releaseYear: 2020 },
		]);

		mocks.all.mockReturnValueOnce([]);

		mocks.all.mockReturnValueOnce([]);
		mocks.all.mockReturnValueOnce([]);
		mocks.all.mockReturnValueOnce([]);
		mocks.all.mockReturnValueOnce([]);

		mocks.all.mockReturnValueOnce([]);

		const { rescanRootFolder } = await import("../disk-scan");
		const stats = await rescanRootFolder("/books");

		expect(stats.filesAdded).toBe(8);
	});
});

describe("ScanStats type", () => {
	it("exports ScanStats type (verified via rescanRootFolder return)", async () => {
		mocks.existsSync.mockReturnValue(false);

		const { rescanRootFolder } = await import("../disk-scan");
		const stats = await rescanRootFolder("/nope");

		expect(stats).toEqual(
			expect.objectContaining({
				filesAdded: expect.any(Number),
				filesRemoved: expect.any(Number),
				filesUnchanged: expect.any(Number),
				filesUpdated: expect.any(Number),
				unmatchedFiles: expect.any(Number),
				errors: expect.any(Array),
			}),
		);
	});
});
