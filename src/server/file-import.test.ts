import { beforeEach, describe, expect, it, vi } from "vitest";

// ─── Shared mocks (hoisted above all imports) ────────────────────────────────

const mocks = vi.hoisted(() => ({
	// node:fs
	readdirSync: vi.fn(),
	statSync: vi.fn(),
	statfsSync: vi.fn(),
	mkdirSync: vi.fn(),
	linkSync: vi.fn(),
	copyFileSync: vi.fn(),
	chmodSync: vi.fn(),
	renameSync: vi.fn(),
	unlinkSync: vi.fn(),
	// db
	dbGet: vi.fn(),
	dbAll: vi.fn(),
	dbRun: vi.fn(),
	dbSet: vi.fn(),
	dbValues: vi.fn(),
	// logger
	logInfo: vi.fn(),
	logWarn: vi.fn(),
	logError: vi.fn(),
	// event bus
	emit: vi.fn(),
	// media probe
	probeAudioFile: vi.fn(),
	probeEbookFile: vi.fn(),
	// import mapping
	mapTvFiles: vi.fn(),
	mapBookFiles: vi.fn(),
	// format parser
	matchFormat: vi.fn(),
	// settings reader
	getMediaSetting: vi.fn(),
	// tracked download state helpers
	claimTrackedDownloadImport: vi.fn(),
	markTrackedDownloadFailed: vi.fn(),
	markTrackedDownloadImported: vi.fn(),
}));

// ─── Module mocks ─────────────────────────────────────────────────────────────

vi.mock("node:fs", () => ({
	default: {
		readdirSync: mocks.readdirSync,
		statSync: mocks.statSync,
		statfsSync: mocks.statfsSync,
		mkdirSync: mocks.mkdirSync,
		linkSync: mocks.linkSync,
		copyFileSync: mocks.copyFileSync,
		chmodSync: mocks.chmodSync,
		renameSync: mocks.renameSync,
		unlinkSync: mocks.unlinkSync,
	},
}));

vi.mock("node:path", async () => {
	const actual = await vi.importActual<typeof import("node:path")>("node:path");
	return { default: actual.posix };
});

vi.mock("fuzzball", () => ({
	token_set_ratio: vi.fn((a: string, b: string) => (a === b ? 100 : 50)),
	partial_ratio: vi.fn((a: string, b: string) => (a === b ? 100 : 50)),
}));

// Build a self-referencing fluent chain for drizzle's query builder.
// Every method returns the chain, except the terminal ones (get/all/run)
// which delegate to hoisted mocks so per-test setup works.
vi.mock("src/db", () => {
	const handler: ProxyHandler<object> = {
		get(_target, prop) {
			if (prop === "get") return mocks.dbGet;
			if (prop === "all") return mocks.dbAll;
			if (prop === "run") return mocks.dbRun;
			if (prop === "set") return mocks.dbSet;
			if (prop === "values") return mocks.dbValues;
			// Everything else is a chaining method -> return a fn that returns the proxy
			return (..._args: unknown[]) => new Proxy({}, handler);
		},
	};
	return { db: new Proxy({}, handler) };
});

vi.mock("src/db/schema", () => ({
	authors: { id: "authors.id", name: "authors.name" },
	bookFiles: {
		id: "bookFiles.id",
		bookId: "bookFiles.bookId",
		path: "bookFiles.path",
	},
	books: {
		id: "books.id",
		title: "books.title",
		releaseYear: "books.releaseYear",
	},
	booksAuthors: {
		bookId: "booksAuthors.bookId",
		authorId: "booksAuthors.authorId",
		authorName: "booksAuthors.authorName",
		isPrimary: "booksAuthors.isPrimary",
	},
	downloadProfiles: {
		id: "downloadProfiles.id",
		rootFolderPath: "downloadProfiles.rootFolderPath",
		contentType: "downloadProfiles.contentType",
	},
	episodeFiles: { id: "episodeFiles.id" },
	episodes: {
		id: "episodes.id",
		showId: "episodes.showId",
		seasonId: "episodes.seasonId",
		episodeNumber: "episodes.episodeNumber",
		hasFile: "episodes.hasFile",
	},
	history: {},
	seasons: { id: "seasons.id", seasonNumber: "seasons.seasonNumber" },
	showDownloadProfiles: {
		showId: "showDownloadProfiles.showId",
		downloadProfileId: "showDownloadProfiles.downloadProfileId",
	},
	shows: { id: "shows.id" },
	trackedDownloads: {
		id: "trackedDownloads.id",
		$inferSelect: {} as Record<string, unknown>,
	},
}));

vi.mock("drizzle-orm", () => ({
	and: vi.fn((...args: unknown[]) => ({ type: "and", args })),
	eq: vi.fn((l: unknown, r: unknown) => ({ l, r })),
}));

vi.mock("./logger", () => ({
	logInfo: mocks.logInfo,
	logWarn: mocks.logWarn,
	logError: mocks.logError,
}));

vi.mock("./event-bus", () => ({
	eventBus: { emit: mocks.emit },
}));

vi.mock("./media-probe", () => ({
	probeAudioFile: mocks.probeAudioFile,
	probeEbookFile: mocks.probeEbookFile,
}));

vi.mock("./import-mapping", () => ({
	mapTvFiles: mocks.mapTvFiles,
	mapBookFiles: mocks.mapBookFiles,
}));

vi.mock("./indexers/format-parser", () => ({
	matchFormat: mocks.matchFormat,
}));

vi.mock("./settings-reader", () => ({
	default: mocks.getMediaSetting,
}));

vi.mock("./tracked-download-state", () => ({
	claimTrackedDownloadImport: mocks.claimTrackedDownloadImport,
	markTrackedDownloadFailed: mocks.markTrackedDownloadFailed,
	markTrackedDownloadImported: mocks.markTrackedDownloadImported,
}));

// ─── Import after mocks ──────────────────────────────────────────────────────

import { importCompletedDownload } from "./file-import";

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
	vi.resetAllMocks();

	// Default: matchFormat returns a generic quality
	mocks.matchFormat.mockReturnValue({ id: 1, name: "EPUB" });

	// Default: statSync returns file info
	mocks.statSync.mockReturnValue({ size: 1024, isDirectory: () => false });

	// Default: settings return defaults
	mocks.getMediaSetting.mockImplementation(
		(_key: string, defaultValue: unknown) => defaultValue,
	);

	// Default: probes return null
	mocks.probeAudioFile.mockResolvedValue(null);
	mocks.probeEbookFile.mockReturnValue(null);

	// Default terminals
	mocks.dbGet.mockReturnValue(undefined);
	mocks.dbAll.mockReturnValue([]);
	mocks.dbRun.mockReturnValue(undefined);

	// dbSet and dbValues need to return a proxy-like object for chaining
	// They're called like db.update(t).set({...}).where(...).run()
	// and db.insert(t).values({...}).returning({...}).get()
	// The proxy already handles chaining, but set/values are intercepted
	// to capture args. They need to return something with .where/.returning etc.
	const chainProxy = new Proxy(
		{},
		{
			get(_target, prop) {
				if (prop === "get") return mocks.dbGet;
				if (prop === "all") return mocks.dbAll;
				if (prop === "run") return mocks.dbRun;
				return (..._args: unknown[]) =>
					new Proxy(
						{},
						{
							get(_t, p) {
								if (p === "get") return mocks.dbGet;
								if (p === "all") return mocks.dbAll;
								if (p === "run") return mocks.dbRun;
								return () => chainProxy;
							},
						},
					);
			},
		},
	);
	mocks.dbSet.mockReturnValue(chainProxy);
	mocks.dbValues.mockReturnValue(chainProxy);
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeTd(overrides: Record<string, unknown> = {}) {
	return {
		id: 1,
		downloadClientId: 10,
		downloadId: "dl-abc",
		bookId: 100,
		authorId: 200,
		downloadProfileId: 300,
		showId: null,
		episodeId: null,
		movieId: null,
		releaseTitle: "Test Book",
		protocol: "usenet",
		indexerId: null,
		guid: null,
		state: "completed",
		outputPath: "/downloads/test-book",
		message: null,
		createdAt: new Date(),
		updatedAt: new Date(),
		...overrides,
	};
}

/** Convenience to set up sequential .get() returns */
function queueGets(...returns: unknown[]) {
	for (const val of returns) {
		mocks.dbGet.mockReturnValueOnce(val);
	}
}

/** Convenience to set up sequential .all() returns */
function queueAlls(...returns: unknown[]) {
	for (const val of returns) {
		mocks.dbAll.mockReturnValueOnce(val);
	}
}

function expectMarkedFailed(message: unknown, id = 1) {
	expect(mocks.markTrackedDownloadFailed).toHaveBeenCalledWith(id, message);
}

function expectMarkedImported(id = 1) {
	expect(mocks.markTrackedDownloadImported).toHaveBeenCalledWith(id);
}

function expectClaimedForImport(id = 1) {
	expect(mocks.claimTrackedDownloadImport).toHaveBeenCalledWith(id);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("importCompletedDownload", () => {
	it("throws if tracked download not found", async () => {
		// dbGet returns undefined (default)
		await expect(importCompletedDownload(999)).rejects.toThrow(
			"Tracked download 999 not found",
		);
	});

	it("marks failed when outputPath is missing", async () => {
		const td = makeTd({ outputPath: null });
		queueGets(td);

		await importCompletedDownload(1);

		expectClaimedForImport();
		expectMarkedFailed("Download output path not set");
	});

	it("marks failed when source dir not found", async () => {
		const td = makeTd({ outputPath: "/nonexistent/path" });
		queueGets(td);
		mocks.statSync.mockImplementation(() => {
			throw new Error("ENOENT");
		});

		await importCompletedDownload(1);

		expectMarkedFailed("Download output path not found");
	});

	it("marks failed when no book files found in download", async () => {
		const td = makeTd();
		queueGets(
			td, // select tracked download
			{ contentType: "ebook" }, // resolveProfileType
		);
		mocks.statSync.mockReturnValue({ size: 1024, isDirectory: () => true });
		mocks.readdirSync.mockReturnValue([]); // no files

		await importCompletedDownload(1);

		expectMarkedFailed("No book files found in download");
	});

	it("marks failed when no root folder configured", async () => {
		const td = makeTd();
		queueGets(
			td, // select tracked download
			{ contentType: "ebook" }, // resolveProfileType
			{ name: "Author Name" }, // resolveAuthorName -> author
			undefined, // resolveRootFolder -> profile lookup (downloadProfileId)
			undefined, // resolveRootFolder -> fallback
		);
		mocks.statSync.mockReturnValue({ size: 1024, isDirectory: () => true });
		mocks.readdirSync.mockReturnValue([
			{ name: "book.epub", isDirectory: () => false },
		]);

		await importCompletedDownload(1);

		expectMarkedFailed("No root folder configured in download profiles");
	});

	it("marks failed when insufficient disk space", async () => {
		const td = makeTd();
		queueGets(
			td,
			{ contentType: "ebook" }, // resolveProfileType
			{ name: "Test Author" }, // resolveAuthorName
			{ rootFolderPath: "/library" }, // resolveRootFolder
		);
		mocks.statSync.mockReturnValue({ size: 1024, isDirectory: () => true });
		mocks.readdirSync.mockReturnValue([
			{ name: "book.epub", isDirectory: () => false },
		]);
		// Very low free space: bsize * bavail / 1024 / 1024 = ~0.01 MB
		mocks.statfsSync.mockReturnValue({ bsize: 1024, bavail: 10 });

		await importCompletedDownload(1);

		expectMarkedFailed(expect.stringContaining("Insufficient free space"));
	});

	it("marks failed and rethrows the original error when import throws", async () => {
		const td = makeTd();
		const error = new Error("permission denied");
		queueGets(
			td,
			{ contentType: "ebook" },
			{ name: "Jane Author" },
			{ rootFolderPath: "/library" },
			{ title: "My Book", releaseYear: 2024 },
		);
		queueAlls([]);

		mocks.statSync.mockReturnValue({ size: 2048, isDirectory: () => true });
		mocks.readdirSync.mockReturnValue([
			{ name: "my-book.epub", isDirectory: () => false },
		]);
		mocks.statfsSync.mockReturnValue({
			bsize: 1024 * 1024,
			bavail: 500,
		});
		mocks.mkdirSync.mockImplementation(() => {
			throw error;
		});

		await expect(importCompletedDownload(1)).rejects.toBe(error);

		expectMarkedFailed("permission denied");
	});

	it("imports ebook files successfully", async () => {
		const td = makeTd();
		queueGets(
			td,
			{ contentType: "ebook" }, // resolveProfileType
			{ name: "Jane Author" }, // resolveAuthorName
			{ rootFolderPath: "/library" }, // resolveRootFolder
			{ title: "My Book", releaseYear: 2024 }, // book lookup
			{ id: 42 }, // bookFiles insert returning
		);
		// existingFiles query
		queueAlls([]);

		mocks.statSync.mockReturnValue({ size: 2048, isDirectory: () => true });
		mocks.readdirSync.mockReturnValue([
			{ name: "my-book.epub", isDirectory: () => false },
		]);
		mocks.statfsSync.mockReturnValue({
			bsize: 1024 * 1024,
			bavail: 500,
		});

		await importCompletedDownload(1);

		// Default is hard links (useHardLinks defaults to true)
		expect(mocks.linkSync).toHaveBeenCalled();
		expect(mocks.mkdirSync).toHaveBeenCalledWith(expect.any(String), {
			recursive: true,
		});
		expectMarkedImported();
		expect(mocks.emit).toHaveBeenCalledWith(
			expect.objectContaining({ type: "importCompleted" }),
		);
	});

	it("imports audio files and probes metadata", async () => {
		const td = makeTd();
		queueGets(
			td,
			{ contentType: "audiobook" }, // resolveProfileType -> audio
			{ name: "Audio Author" }, // resolveAuthorName
			{ rootFolderPath: "/audiobooks" }, // resolveRootFolder
			{ title: "Audio Book", releaseYear: 2023 }, // book lookup
			{ id: 50 }, // first file insert
			{ id: 51 }, // second file insert
		);
		queueAlls([]); // existingFiles

		mocks.statSync.mockReturnValue({ size: 4096, isDirectory: () => true });
		mocks.readdirSync.mockReturnValue([
			{ name: "part01.mp3", isDirectory: () => false },
			{ name: "part02.mp3", isDirectory: () => false },
		]);
		mocks.statfsSync.mockReturnValue({ bsize: 1024 * 1024, bavail: 500 });

		mocks.probeAudioFile.mockResolvedValue({
			duration: 3600,
			bitrate: 128,
			sampleRate: 44100,
			channels: 2,
			codec: "mp3",
		});

		await importCompletedDownload(1);

		expect(mocks.probeAudioFile).toHaveBeenCalledTimes(2);
		expectMarkedImported();
	});

	it("probes ebook metadata after import", async () => {
		const td = makeTd();
		queueGets(
			td,
			{ contentType: "ebook" },
			{ name: "Author" },
			{ rootFolderPath: "/library" },
			{ title: "Ebook", releaseYear: 2024 },
			{ id: 55 }, // bookFiles insert
		);
		queueAlls([]);

		mocks.statSync.mockReturnValue({ size: 2048, isDirectory: () => true });
		mocks.readdirSync.mockReturnValue([
			{ name: "book.epub", isDirectory: () => false },
		]);
		mocks.statfsSync.mockReturnValue({ bsize: 1024 * 1024, bavail: 500 });
		mocks.probeEbookFile.mockReturnValue({
			pageCount: 300,
			language: "en",
		});

		await importCompletedDownload(1);

		expect(mocks.probeEbookFile).toHaveBeenCalled();
		expect(mocks.dbSet).toHaveBeenCalledWith(
			expect.objectContaining({ pageCount: 300, language: "en" }),
		);
	});

	it("cleans up existing book files on upgrade (recycle bin)", async () => {
		const td = makeTd();
		queueGets(
			td,
			{ contentType: "ebook" },
			{ name: "Upgrade Author" },
			{ rootFolderPath: "/library" },
			{ title: "Upgrade Book", releaseYear: 2022 }, // book lookup
			{ id: 60 }, // file insert
		);
		// existingFiles: one old file
		queueAlls([{ id: 10, path: "/library/old/old.epub" }]);

		mocks.statSync.mockReturnValue({ size: 2048, isDirectory: () => true });
		mocks.readdirSync.mockReturnValue([
			{ name: "new.epub", isDirectory: () => false },
		]);
		mocks.statfsSync.mockReturnValue({ bsize: 1024 * 1024, bavail: 500 });

		mocks.getMediaSetting.mockImplementation(
			(key: string, defaultValue: unknown) => {
				if (key === "mediaManagement.book.recyclingBin")
					return "/library/.recycle";
				return defaultValue;
			},
		);

		await importCompletedDownload(1);

		expect(mocks.mkdirSync).toHaveBeenCalledWith("/library/.recycle", {
			recursive: true,
		});
		expect(mocks.renameSync).toHaveBeenCalledWith(
			"/library/old/old.epub",
			"/library/.recycle/old.epub",
		);
	});

	it("cleans up existing book files on upgrade (delete)", async () => {
		const td = makeTd();
		queueGets(
			td,
			{ contentType: "ebook" },
			{ name: "Delete Author" },
			{ rootFolderPath: "/library" },
			{ title: "Delete Book", releaseYear: 2022 },
			{ id: 61 },
		);
		queueAlls([{ id: 11, path: "/library/old/old.epub" }]);

		mocks.statSync.mockReturnValue({ size: 2048, isDirectory: () => true });
		mocks.readdirSync.mockReturnValue([
			{ name: "new.epub", isDirectory: () => false },
		]);
		mocks.statfsSync.mockReturnValue({ bsize: 1024 * 1024, bavail: 500 });

		await importCompletedDownload(1);

		expect(mocks.unlinkSync).toHaveBeenCalledWith("/library/old/old.epub");
	});

	it("uses hard links when configured", async () => {
		const td = makeTd();
		queueGets(
			td,
			{ contentType: "ebook" },
			{ name: "Author" },
			{ rootFolderPath: "/library" },
			{ title: "Book", releaseYear: 2024 },
			{ id: 70 },
		);
		queueAlls([]);

		mocks.statSync.mockReturnValue({ size: 2048, isDirectory: () => true });
		mocks.readdirSync.mockReturnValue([
			{ name: "book.epub", isDirectory: () => false },
		]);
		mocks.statfsSync.mockReturnValue({ bsize: 1024 * 1024, bavail: 500 });

		mocks.getMediaSetting.mockImplementation(
			(key: string, defaultValue: unknown) => {
				if (key === "mediaManagement.book.useHardLinks") return true;
				return defaultValue;
			},
		);

		await importCompletedDownload(1);

		expect(mocks.linkSync).toHaveBeenCalled();
		expect(mocks.copyFileSync).not.toHaveBeenCalled();
	});

	it("falls back to copy when hard link fails", async () => {
		const td = makeTd();
		queueGets(
			td,
			{ contentType: "ebook" },
			{ name: "Author" },
			{ rootFolderPath: "/library" },
			{ title: "Book", releaseYear: 2024 },
			{ id: 71 },
		);
		queueAlls([]);

		mocks.statSync.mockReturnValue({ size: 2048, isDirectory: () => true });
		mocks.readdirSync.mockReturnValue([
			{ name: "book.epub", isDirectory: () => false },
		]);
		mocks.statfsSync.mockReturnValue({ bsize: 1024 * 1024, bavail: 500 });

		mocks.getMediaSetting.mockImplementation(
			(key: string, defaultValue: unknown) => {
				if (key === "mediaManagement.book.useHardLinks") return true;
				return defaultValue;
			},
		);
		mocks.linkSync.mockImplementation(() => {
			throw new Error("EXDEV");
		});

		await importCompletedDownload(1);

		expect(mocks.linkSync).toHaveBeenCalled();
		expect(mocks.copyFileSync).toHaveBeenCalled();
	});

	it("applies file and folder permissions when configured", async () => {
		const td = makeTd();
		queueGets(
			td,
			{ contentType: "ebook" },
			{ name: "Author" },
			{ rootFolderPath: "/library" },
			{ title: "Book", releaseYear: 2024 },
			{ id: 72 },
		);
		queueAlls([]);

		mocks.statSync.mockReturnValue({ size: 2048, isDirectory: () => true });
		mocks.readdirSync.mockReturnValue([
			{ name: "book.epub", isDirectory: () => false },
		]);
		mocks.statfsSync.mockReturnValue({ bsize: 1024 * 1024, bavail: 500 });

		mocks.getMediaSetting.mockImplementation(
			(key: string, defaultValue: unknown) => {
				if (key === "mediaManagement.book.setPermissions") return true;
				if (key === "mediaManagement.book.fileChmod") return "0644";
				if (key === "mediaManagement.book.folderChmod") return "0755";
				return defaultValue;
			},
		);

		await importCompletedDownload(1);

		// File chmod
		expect(mocks.chmodSync).toHaveBeenCalledWith(
			expect.stringContaining("book.epub"),
			0o644,
		);
		// Folder chmod
		expect(mocks.chmodSync).toHaveBeenCalledWith(expect.any(String), 0o755);
	});

	it("renames books when renameBooks is enabled", async () => {
		const td = makeTd();
		queueGets(
			td,
			{ contentType: "ebook" },
			{ name: "Rename Author" },
			{ rootFolderPath: "/library" },
			{ title: "Rename Book", releaseYear: 2025 },
			{ id: 73 },
		);
		queueAlls([]);

		mocks.statSync.mockReturnValue({ size: 2048, isDirectory: () => true });
		mocks.readdirSync.mockReturnValue([
			{ name: "random-name.epub", isDirectory: () => false },
		]);
		mocks.statfsSync.mockReturnValue({ bsize: 1024 * 1024, bavail: 500 });

		mocks.getMediaSetting.mockImplementation(
			(key: string, defaultValue: unknown) => {
				if (key === "mediaManagement.book.renameBooks") return true;
				return defaultValue;
			},
		);

		await importCompletedDownload(1);

		// useHardLinks defaults to true, so linkSync is used for the renamed file
		expect(mocks.linkSync).toHaveBeenCalledWith(
			expect.stringContaining("random-name.epub"),
			expect.stringContaining("Rename Author - Rename Book.epub"),
		);
	});

	it("renames single-file audio imports without a part suffix", async () => {
		const td = makeTd();
		queueGets(
			td,
			{ contentType: "audiobook" },
			{ name: "Audio Author" },
			{ rootFolderPath: "/audiobooks" },
			{ title: "Audio Book", releaseYear: 2024 },
			{ id: 74 },
		);
		queueAlls([]);

		mocks.statSync.mockReturnValue({ size: 4096, isDirectory: () => true });
		mocks.readdirSync.mockReturnValue([
			{ name: "track01.mp3", isDirectory: () => false },
		]);
		mocks.statfsSync.mockReturnValue({ bsize: 1024 * 1024, bavail: 500 });

		mocks.getMediaSetting.mockImplementation(
			(key: string, defaultValue: unknown) => {
				if (key === "mediaManagement.book.renameBooks") return true;
				return defaultValue;
			},
		);

		await importCompletedDownload(1);

		expect(mocks.linkSync).toHaveBeenCalledWith(
			"/downloads/test-book/track01.mp3",
			expect.stringContaining("Audio Author - Audio Book.mp3"),
		);
		expect(
			(mocks.linkSync.mock.calls[0]?.[1] as string | undefined) ?? "",
		).not.toContain("Part");
	});

	it("skips free space check when skipFreeSpaceCheck is enabled", async () => {
		const td = makeTd();
		queueGets(
			td,
			{ contentType: "ebook" },
			{ name: "Author" },
			{ rootFolderPath: "/library" },
			{ title: "Book", releaseYear: 2024 },
			{ id: 80 },
		);
		queueAlls([]);

		mocks.statSync.mockReturnValue({ size: 2048, isDirectory: () => true });
		mocks.readdirSync.mockReturnValue([
			{ name: "book.epub", isDirectory: () => false },
		]);

		mocks.getMediaSetting.mockImplementation(
			(key: string, defaultValue: unknown) => {
				if (key === "mediaManagement.book.skipFreeSpaceCheck") return true;
				return defaultValue;
			},
		);

		await importCompletedDownload(1);

		expect(mocks.statfsSync).not.toHaveBeenCalled();
		expectMarkedImported();
	});

	it("marks failed when all file imports fail", async () => {
		const td = makeTd();
		queueGets(
			td,
			{ contentType: "ebook" },
			{ name: "Author" },
			{ rootFolderPath: "/library" },
			{ title: "Fail Book", releaseYear: 2024 },
		);
		queueAlls([]);

		mocks.statSync.mockReturnValue({ size: 2048, isDirectory: () => true });
		mocks.readdirSync.mockReturnValue([
			{ name: "book.epub", isDirectory: () => false },
		]);
		mocks.statfsSync.mockReturnValue({ bsize: 1024 * 1024, bavail: 500 });
		// Both link and copy must fail for the import to fail
		mocks.linkSync.mockImplementation(() => {
			throw new Error("EXDEV");
		});
		mocks.copyFileSync.mockImplementation(() => {
			throw new Error("disk error");
		});

		await importCompletedDownload(1);

		expect(mocks.logError).toHaveBeenCalledWith(
			"file-import",
			expect.stringContaining("Failed to import"),
			expect.any(Error),
		);
		expectMarkedFailed("All file imports failed");
	});
});

describe("pack detection and delegation", () => {
	it("delegates to episode pack import when showId set but no episodeId", async () => {
		const td = makeTd({
			bookId: null,
			authorId: null,
			showId: 500,
			episodeId: null,
			outputPath: "/downloads/tv-pack",
		});
		queueGets(td);
		mocks.statSync.mockReturnValue({ size: 1024, isDirectory: () => true });
		mocks.readdirSync.mockReturnValue([]); // no video files

		await importCompletedDownload(1);

		expectMarkedFailed("No video files found in episode pack download");
	});

	it("delegates to book pack import when authorId set but no bookId", async () => {
		const td = makeTd({
			bookId: null,
			authorId: 200,
			outputPath: "/downloads/pack",
		});
		queueGets(td);
		mocks.statSync.mockReturnValue({ size: 1024, isDirectory: () => true });
		mocks.readdirSync.mockReturnValue([]); // no book files

		await importCompletedDownload(1);

		expectMarkedFailed("No book files found in book pack download");
	});
});

describe("importBookPackDownload", () => {
	it("marks failed when outputPath is missing for book pack", async () => {
		const td = makeTd({
			bookId: null,
			authorId: 200,
			outputPath: null,
		});
		queueGets(td);

		await importCompletedDownload(1);

		expectMarkedFailed("Missing output path or author ID for book pack");
	});

	it("marks failed when author not found", async () => {
		const td = makeTd({
			bookId: null,
			authorId: 200,
			outputPath: "/downloads/pack",
		});
		queueGets(
			td,
			undefined, // author lookup fails
		);
		mocks.statSync.mockReturnValue({ size: 1024, isDirectory: () => true });
		mocks.readdirSync.mockReturnValue([
			{ name: "book1.epub", isDirectory: () => false },
		]);

		await importCompletedDownload(1);

		expectMarkedFailed("Author 200 not found");
	});

	it("marks failed when no root folder for book pack", async () => {
		const td = makeTd({
			bookId: null,
			authorId: 200,
			outputPath: "/downloads/pack",
		});
		queueGets(
			td,
			{ id: 200, name: "Author" }, // author
			undefined, // resolveRootFolder profile
			undefined, // resolveRootFolder fallback
		);
		mocks.statSync.mockReturnValue({ size: 1024, isDirectory: () => true });
		mocks.readdirSync.mockReturnValue([
			{ name: "book.epub", isDirectory: () => false },
		]);

		await importCompletedDownload(1);

		expectMarkedFailed("No root folder configured in download profiles");
	});

	it("imports matched books from pack successfully", async () => {
		const td = makeTd({
			bookId: null,
			authorId: 200,
			outputPath: "/downloads/pack",
		});
		queueGets(
			td,
			{ id: 200, name: "Pack Author" }, // author
			{ rootFolderPath: "/library" }, // resolveRootFolder
			{ contentType: "ebook" }, // resolveProfileType
			{ id: 90 }, // first file insert
			{ id: 91 }, // second file insert
		);
		mocks.statSync.mockReturnValue({ size: 1024, isDirectory: () => true });
		mocks.readdirSync.mockReturnValue([
			{ name: "Author - Title One.epub", isDirectory: () => false },
			{ name: "Author - Title Two.epub", isDirectory: () => false },
		]);
		mocks.statfsSync.mockReturnValue({ bsize: 1024 * 1024, bavail: 500 });

		mocks.mapBookFiles.mockReturnValue([
			{
				path: "/downloads/pack/Author - Title One.epub",
				extractedTitle: "Title One",
			},
			{
				path: "/downloads/pack/Author - Title Two.epub",
				extractedTitle: "Title Two",
			},
		]);

		// authorBooks
		queueAlls(
			[
				{ id: 101, title: "Title One", releaseYear: 2023 },
				{ id: 102, title: "Title Two", releaseYear: 2024 },
			],
			[], // booksWithFiles - no existing
		);

		await importCompletedDownload(1);

		expectMarkedImported();
		expect(mocks.emit).toHaveBeenCalledWith(
			expect.objectContaining({
				type: "importCompleted",
				bookTitle: expect.stringContaining("pack: 2 books"),
			}),
		);
	});

	it("renames pack imports through the shared file flow when enabled", async () => {
		const td = makeTd({
			bookId: null,
			authorId: 200,
			outputPath: "/downloads/pack",
		});
		queueGets(
			td,
			{ id: 200, name: "Pack Author" },
			{ rootFolderPath: "/library" },
			{ contentType: "audiobook" },
			{ id: 90 },
		);
		mocks.statSync.mockReturnValue({ size: 1024, isDirectory: () => true });
		mocks.readdirSync.mockReturnValue([
			{ name: "Author - Title.mp3", isDirectory: () => false },
		]);
		mocks.statfsSync.mockReturnValue({ bsize: 1024 * 1024, bavail: 500 });

		mocks.mapBookFiles.mockReturnValue([
			{
				path: "/downloads/pack/Author - Title.mp3",
				extractedTitle: "Title",
			},
		]);

		queueAlls([{ id: 101, title: "Title", releaseYear: 2023 }], []);

		mocks.getMediaSetting.mockImplementation(
			(key: string, defaultValue: unknown) => {
				if (key === "mediaManagement.book.renameBooks") return true;
				if (key === "naming.book.audio.bookFile") {
					return "Pack - {Author Name} - {Book Title}";
				}
				return defaultValue;
			},
		);

		await importCompletedDownload(1);

		expect(mocks.linkSync).toHaveBeenCalledWith(
			"/downloads/pack/Author - Title.mp3",
			expect.stringContaining("Pack - Pack Author - Title.mp3"),
		);
		expectMarkedImported();
	});

	it("renames single-file audio pack imports without a part suffix", async () => {
		const td = makeTd({
			bookId: null,
			authorId: 200,
			outputPath: "/downloads/pack",
		});
		queueGets(
			td,
			{ id: 200, name: "Pack Author" },
			{ rootFolderPath: "/library" },
			{ contentType: "audiobook" },
			{ id: 92 },
		);
		mocks.statSync.mockReturnValue({ size: 1024, isDirectory: () => true });
		mocks.readdirSync.mockReturnValue([
			{ name: "Author - Title.mp3", isDirectory: () => false },
		]);
		mocks.statfsSync.mockReturnValue({ bsize: 1024 * 1024, bavail: 500 });

		mocks.mapBookFiles.mockReturnValue([
			{
				path: "/downloads/pack/Author - Title.mp3",
				extractedTitle: "Title",
			},
		]);

		queueAlls([{ id: 101, title: "Title", releaseYear: 2023 }], []);

		mocks.getMediaSetting.mockImplementation(
			(key: string, defaultValue: unknown) => {
				if (key === "mediaManagement.book.renameBooks") return true;
				return defaultValue;
			},
		);

		await importCompletedDownload(1);

		expect(mocks.linkSync).toHaveBeenCalledWith(
			"/downloads/pack/Author - Title.mp3",
			expect.stringContaining("Pack Author - Title.mp3"),
		);
		expect(
			(mocks.linkSync.mock.calls[0]?.[1] as string | undefined) ?? "",
		).not.toContain("Part");
	});

	it("skips books that already have files", async () => {
		const td = makeTd({
			bookId: null,
			authorId: 200,
			outputPath: "/downloads/pack",
		});
		queueGets(
			td,
			{ id: 200, name: "Author" },
			{ rootFolderPath: "/library" },
			{ contentType: "ebook" },
		);
		mocks.statSync.mockReturnValue({ size: 1024, isDirectory: () => true });
		mocks.readdirSync.mockReturnValue([
			{ name: "book.epub", isDirectory: () => false },
		]);
		mocks.statfsSync.mockReturnValue({ bsize: 1024 * 1024, bavail: 500 });

		mocks.mapBookFiles.mockReturnValue([
			{
				path: "/downloads/pack/book.epub",
				extractedTitle: "Existing Book",
			},
		]);

		queueAlls(
			[{ id: 101, title: "Existing Book", releaseYear: 2023 }], // authorBooks
			[{ bookId: 101 }], // booksWithFiles - already has file
		);

		await importCompletedDownload(1);

		expectMarkedFailed("No book files matched or imported from pack");
	});

	it("marks failed when mapBookFiles returns empty", async () => {
		const td = makeTd({
			bookId: null,
			authorId: 200,
			outputPath: "/downloads/pack",
		});
		queueGets(
			td,
			{ id: 200, name: "Author" },
			{ rootFolderPath: "/library" },
			{ contentType: "ebook" },
		);
		mocks.statSync.mockReturnValue({ size: 1024, isDirectory: () => true });
		mocks.readdirSync.mockReturnValue([
			{ name: "book.epub", isDirectory: () => false },
		]);
		mocks.statfsSync.mockReturnValue({ bsize: 1024 * 1024, bavail: 500 });

		mocks.mapBookFiles.mockReturnValue([]);

		await importCompletedDownload(1);

		expectMarkedFailed("No book files could be parsed from pack");
	});
});

describe("importEpisodePackDownload", () => {
	function makeTvTd(overrides: Record<string, unknown> = {}) {
		return makeTd({
			bookId: null,
			authorId: null,
			showId: 500,
			episodeId: null,
			outputPath: "/downloads/tv-pack",
			releaseTitle: "My Show S01",
			...overrides,
		});
	}

	it("marks failed when outputPath is missing for episode pack", async () => {
		queueGets(makeTvTd({ outputPath: null }));

		await importCompletedDownload(1);

		expectMarkedFailed("Missing output path or show ID for episode pack");
	});

	it("marks failed when show not found", async () => {
		queueGets(
			makeTvTd(),
			undefined, // show lookup fails
		);
		mocks.statSync.mockReturnValue({ size: 1024, isDirectory: () => true });
		mocks.readdirSync.mockReturnValue([
			{ name: "show.S01E01.mkv", isDirectory: () => false },
		]);

		await importCompletedDownload(1);

		expectMarkedFailed("Show 500 not found");
	});

	it("marks failed when no root folder for TV", async () => {
		queueGets(
			makeTvTd(),
			{
				id: 500,
				title: "My Show",
				year: 2024,
				useSeasonFolder: true,
			}, // show found
			undefined, // resolveShowRootFolder -> no link
			undefined, // resolveShowRootFolder -> no fallback
		);
		mocks.statSync.mockReturnValue({ size: 1024, isDirectory: () => true });
		mocks.readdirSync.mockReturnValue([
			{ name: "show.S01E01.mkv", isDirectory: () => false },
		]);

		await importCompletedDownload(1);

		expectMarkedFailed("No root folder configured for TV download profiles");
	});

	it("imports episode files from pack", async () => {
		queueGets(
			makeTvTd(),
			{
				id: 500,
				title: "My Show",
				year: 2024,
				useSeasonFolder: true,
			},
			{ downloadProfileId: 300 }, // resolveShowRootFolder link
			{ rootFolderPath: "/tv-library" }, // resolveShowRootFolder profile
			{ id: 801 }, // first episodeFile insert
			{ id: 802 }, // second episodeFile insert
		);
		mocks.statSync.mockReturnValue({ size: 4096, isDirectory: () => true });
		mocks.readdirSync.mockReturnValue([
			{ name: "show.S01E01.mkv", isDirectory: () => false },
			{ name: "show.S01E02.mkv", isDirectory: () => false },
		]);
		mocks.statfsSync.mockReturnValue({ bsize: 1024 * 1024, bavail: 500 });

		mocks.mapTvFiles.mockReturnValue([
			{
				path: "/downloads/tv-pack/show.S01E01.mkv",
				season: 1,
				episode: 1,
			},
			{
				path: "/downloads/tv-pack/show.S01E02.mkv",
				season: 1,
				episode: 2,
			},
		]);

		// show episodes
		queueAlls([
			{ id: 601, seasonNumber: 1, episodeNumber: 1, hasFile: false },
			{ id: 602, seasonNumber: 1, episodeNumber: 2, hasFile: false },
		]);

		await importCompletedDownload(1);

		// useHardLinks defaults to true
		expect(mocks.linkSync).toHaveBeenCalledTimes(2);
		expectMarkedImported();
		expect(mocks.logInfo).toHaveBeenCalledWith(
			"file-import",
			expect.stringContaining('Imported 2 episode(s) from pack for "My Show"'),
		);
	});

	it("skips episodes that already have files", async () => {
		queueGets(
			makeTvTd(),
			{
				id: 500,
				title: "My Show",
				year: 2024,
				useSeasonFolder: true,
			},
			{ downloadProfileId: 300 },
			{ rootFolderPath: "/tv-library" },
		);
		mocks.statSync.mockReturnValue({ size: 4096, isDirectory: () => true });
		mocks.readdirSync.mockReturnValue([
			{ name: "show.S01E01.mkv", isDirectory: () => false },
		]);
		mocks.statfsSync.mockReturnValue({ bsize: 1024 * 1024, bavail: 500 });

		mocks.mapTvFiles.mockReturnValue([
			{
				path: "/downloads/tv-pack/show.S01E01.mkv",
				season: 1,
				episode: 1,
			},
		]);

		// Episode already has file
		queueAlls([{ id: 601, seasonNumber: 1, episodeNumber: 1, hasFile: true }]);

		await importCompletedDownload(1);

		expect(mocks.copyFileSync).not.toHaveBeenCalled();
		expectMarkedFailed("No episode files matched or imported from pack");
	});

	it("marks failed when mapTvFiles returns empty", async () => {
		queueGets(
			makeTvTd(),
			{
				id: 500,
				title: "My Show",
				year: 2024,
				useSeasonFolder: false,
			},
			{ downloadProfileId: 300 },
			{ rootFolderPath: "/tv-library" },
		);
		mocks.statSync.mockReturnValue({ size: 4096, isDirectory: () => true });
		mocks.readdirSync.mockReturnValue([
			{ name: "random-video.mkv", isDirectory: () => false },
		]);
		mocks.statfsSync.mockReturnValue({ bsize: 1024 * 1024, bavail: 500 });

		mocks.mapTvFiles.mockReturnValue([]);

		await importCompletedDownload(1);

		expectMarkedFailed("No files matched S##E## pattern in episode pack");
	});
});

describe("edge cases", () => {
	it("resolves author from booksAuthors when authorId not found", async () => {
		const td = makeTd({ authorId: null });
		queueGets(
			td,
			{ contentType: "ebook" }, // resolveProfileType
			{ authorName: "Fallback Author" }, // booksAuthors lookup
			{ rootFolderPath: "/library" }, // resolveRootFolder
			{ title: "Some Book", releaseYear: 2024 }, // book lookup
			{ id: 99 }, // file insert
		);
		queueAlls([]);

		mocks.statSync.mockReturnValue({ size: 2048, isDirectory: () => true });
		mocks.readdirSync.mockReturnValue([
			{ name: "book.epub", isDirectory: () => false },
		]);
		mocks.statfsSync.mockReturnValue({ bsize: 1024 * 1024, bavail: 500 });

		await importCompletedDownload(1);

		expect(mocks.mkdirSync).toHaveBeenCalledWith(
			expect.stringContaining("Fallback Author"),
			{ recursive: true },
		);
	});

	it("uses 'Unknown Author' when no author resolution succeeds", async () => {
		const td = makeTd({ authorId: null, bookId: null });
		queueGets(
			td,
			{ contentType: "ebook" }, // resolveProfileType
			// resolveAuthorName: authorId is null, bookId is null -> "Unknown Author"
			{ rootFolderPath: "/library" }, // resolveRootFolder
			null, // book lookup returns null
			{ id: 100 }, // file insert
		);
		queueAlls([]);

		mocks.statSync.mockReturnValue({ size: 2048, isDirectory: () => true });
		mocks.readdirSync.mockReturnValue([
			{ name: "mystery.epub", isDirectory: () => false },
		]);
		mocks.statfsSync.mockReturnValue({ bsize: 1024 * 1024, bavail: 500 });

		await importCompletedDownload(1);

		expect(mocks.mkdirSync).toHaveBeenCalledWith(
			expect.stringContaining("Unknown Author"),
			{ recursive: true },
		);
	});

	it("proceeds when statfsSync fails during free space check", async () => {
		const td = makeTd();
		queueGets(
			td,
			{ contentType: "ebook" },
			{ name: "Author" },
			{ rootFolderPath: "/library" },
			{ title: "Book", releaseYear: 2024 },
			{ id: 120 },
		);
		queueAlls([]);

		mocks.statSync.mockReturnValue({ size: 2048, isDirectory: () => true });
		mocks.readdirSync.mockReturnValue([
			{ name: "book.epub", isDirectory: () => false },
		]);
		mocks.statfsSync.mockImplementation(() => {
			throw new Error("statfs not available");
		});

		await importCompletedDownload(1);

		expect(mocks.logWarn).toHaveBeenCalledWith(
			"file-import",
			"Could not check free space, proceeding anyway",
		);
		expectMarkedImported();
	});

	it("handles resolveSourceDir with file path (uses dirname)", async () => {
		const td = makeTd({ outputPath: "/downloads/single-book.epub" });
		queueGets(
			td,
			{ contentType: "ebook" },
			{ name: "Author" },
			{ rootFolderPath: "/library" },
			{ title: "Single", releaseYear: 2024 },
			{ id: 130 },
		);
		queueAlls([]);

		mocks.statSync.mockImplementation((p: string) => {
			if (p === "/downloads/single-book.epub") {
				return { size: 2048, isDirectory: () => false };
			}
			return { size: 2048, isDirectory: () => true };
		});
		mocks.readdirSync.mockReturnValue([
			{ name: "single-book.epub", isDirectory: () => false },
		]);
		mocks.statfsSync.mockReturnValue({ bsize: 1024 * 1024, bavail: 500 });

		await importCompletedDownload(1);

		expectMarkedImported();
	});

	it("scans directories recursively for book files", async () => {
		const td = makeTd();
		queueGets(
			td,
			{ contentType: "ebook" },
			{ name: "Author" },
			{ rootFolderPath: "/library" },
			{ title: "Book", releaseYear: 2024 },
			{ id: 110 }, // first file insert
			{ id: 111 }, // second file insert
		);
		queueAlls([]);

		mocks.statSync.mockReturnValue({ size: 2048, isDirectory: () => true });
		mocks.readdirSync
			.mockReturnValueOnce([
				{ name: "subdir", isDirectory: () => true },
				{ name: "root-book.epub", isDirectory: () => false },
			])
			.mockReturnValueOnce([
				{ name: "nested-book.pdf", isDirectory: () => false },
			]);
		mocks.statfsSync.mockReturnValue({ bsize: 1024 * 1024, bavail: 500 });

		await importCompletedDownload(1);

		// useHardLinks defaults to true
		expect(mocks.linkSync).toHaveBeenCalledTimes(2);
	});

	it("records history entry on successful import", async () => {
		const td = makeTd();
		queueGets(
			td,
			{ contentType: "ebook" },
			{ name: "Author" },
			{ rootFolderPath: "/library" },
			{ title: "History Book", releaseYear: 2024 },
			{ id: 140 },
		);
		queueAlls([]);

		mocks.statSync.mockReturnValue({ size: 2048, isDirectory: () => true });
		mocks.readdirSync.mockReturnValue([
			{ name: "book.epub", isDirectory: () => false },
		]);
		mocks.statfsSync.mockReturnValue({ bsize: 1024 * 1024, bavail: 500 });

		await importCompletedDownload(1);

		expect(mocks.dbValues).toHaveBeenCalledWith(
			expect.objectContaining({
				eventType: "bookImported",
				bookId: 100,
				authorId: 200,
			}),
		);
	});

	it("emits importCompleted event on success", async () => {
		const td = makeTd();
		queueGets(
			td,
			{ contentType: "ebook" },
			{ name: "Author" },
			{ rootFolderPath: "/library" },
			{ title: "Event Book", releaseYear: 2024 },
			{ id: 150 },
		);
		queueAlls([]);

		mocks.statSync.mockReturnValue({ size: 2048, isDirectory: () => true });
		mocks.readdirSync.mockReturnValue([
			{ name: "book.epub", isDirectory: () => false },
		]);
		mocks.statfsSync.mockReturnValue({ bsize: 1024 * 1024, bavail: 500 });

		await importCompletedDownload(1);

		expect(mocks.emit).toHaveBeenCalledWith({
			type: "importCompleted",
			bookId: 100,
			bookTitle: "Event Book",
		});
	});
});
