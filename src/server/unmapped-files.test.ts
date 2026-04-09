import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
	const eq = vi.fn((left: unknown, right: unknown) => ({
		kind: "eq",
		left,
		right,
	}));
	const and = vi.fn((...args: unknown[]) => ({ kind: "and", args }));
	const like = vi.fn((col: unknown, pat: unknown) => ({
		kind: "like",
		col,
		pat,
	}));
	const or = vi.fn((...args: unknown[]) => ({ kind: "or", args }));
	const count = vi.fn(() => "count(*)");

	const requireAuth = vi.fn();
	const requireAdmin = vi.fn();
	const eventBusEmit = vi.fn();
	const logWarn = vi.fn();
	const unlinkSync = vi.fn();

	// Dynamic import mocks
	const probeAudioFile = vi.fn();
	const probeEbookFile = vi.fn();
	const probeVideoFile = vi.fn();
	const getRootFolderPaths = vi.fn();
	const rescanRootFolder = vi.fn();

	const select = vi.fn();
	const insert = vi.fn();
	const update = vi.fn();
	const deleteFn = vi.fn();

	return {
		and,
		count,
		deleteFn,
		eq,
		eventBusEmit,
		getRootFolderPaths,
		insert,
		like,
		logWarn,
		or,
		probeAudioFile,
		probeEbookFile,
		probeVideoFile,
		requireAdmin,
		requireAuth,
		rescanRootFolder,
		select,
		unlinkSync,
		update,
	};
});

const schemaMocks = vi.hoisted(
	() =>
		({
			bookFiles: { bookId: "bookFiles.bookId" },
			books: { id: "books.id", title: "books.title" },
			booksAuthors: {
				authorName: "booksAuthors.authorName",
				bookId: "booksAuthors.bookId",
				isPrimary: "booksAuthors.isPrimary",
			},
			downloadProfiles: {
				id: "downloadProfiles.id",
				name: "downloadProfiles.name",
				rootFolderPath: "downloadProfiles.rootFolderPath",
			},
			episodeFiles: { episodeId: "episodeFiles.episodeId" },
			episodes: {
				episodeNumber: "episodes.episodeNumber",
				id: "episodes.id",
				seasonId: "episodes.seasonId",
				showId: "episodes.showId",
				title: "episodes.title",
			},
			history: { id: "history.id" },
			movieFiles: { movieId: "movieFiles.movieId" },
			movies: {
				id: "movies.id",
				title: "movies.title",
				year: "movies.year",
			},
			seasons: {
				id: "seasons.id",
				seasonNumber: "seasons.seasonNumber",
			},
			shows: { id: "shows.id", title: "shows.title" },
			unmappedFiles: {
				contentType: "unmappedFiles.contentType",
				id: "unmappedFiles.id",
				ignored: "unmappedFiles.ignored",
				path: "unmappedFiles.path",
			},
		}) as const,
);

// -- module mocks --

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
	and: mocks.and,
	count: mocks.count,
	eq: mocks.eq,
	like: mocks.like,
	or: mocks.or,
}));

vi.mock("src/db/schema", () => schemaMocks);

vi.mock("src/server/event-bus", () => ({
	eventBus: { emit: mocks.eventBusEmit },
}));

vi.mock("src/server/logger", () => ({
	logWarn: mocks.logWarn,
}));

vi.mock("src/server/middleware", () => ({
	requireAdmin: mocks.requireAdmin,
	requireAuth: mocks.requireAuth,
}));

vi.mock("node:fs", () => ({
	default: { unlinkSync: mocks.unlinkSync },
	unlinkSync: mocks.unlinkSync,
}));

vi.mock("node:path", () => ({
	default: {
		extname: (p: string) => {
			const dot = p.lastIndexOf(".");
			return dot >= 0 ? p.slice(dot) : "";
		},
	},
	extname: (p: string) => {
		const dot = p.lastIndexOf(".");
		return dot >= 0 ? p.slice(dot) : "";
	},
}));

vi.mock("src/server/media-probe", () => ({
	probeAudioFile: mocks.probeAudioFile,
	probeEbookFile: mocks.probeEbookFile,
	probeVideoFile: mocks.probeVideoFile,
}));

vi.mock("src/server/disk-scan", () => ({
	getRootFolderPaths: mocks.getRootFolderPaths,
	rescanRootFolder: mocks.rescanRootFolder,
}));

// -- chainable DB helpers --

type SelectChain = {
	all: ReturnType<typeof vi.fn>;
	from: ReturnType<typeof vi.fn>;
	get: ReturnType<typeof vi.fn>;
	innerJoin: ReturnType<typeof vi.fn>;
	leftJoin: ReturnType<typeof vi.fn>;
	limit: ReturnType<typeof vi.fn>;
	where: ReturnType<typeof vi.fn>;
};

function createSelectChain(
	result: unknown = undefined,
	allResult: unknown[] = [],
): SelectChain {
	const chain = {} as SelectChain;
	chain.all = vi.fn(() => allResult);
	chain.from = vi.fn(() => chain);
	chain.get = vi.fn(() => result);
	chain.innerJoin = vi.fn(() => chain);
	chain.leftJoin = vi.fn(() => chain);
	chain.limit = vi.fn(() => chain);
	chain.where = vi.fn(() => chain);
	return chain;
}

type InsertChain = {
	run: ReturnType<typeof vi.fn>;
	values: ReturnType<typeof vi.fn>;
};

function createInsertChain(): InsertChain {
	const chain = {} as InsertChain;
	chain.run = vi.fn();
	chain.values = vi.fn(() => chain);
	return chain;
}

type UpdateChain = {
	run: ReturnType<typeof vi.fn>;
	set: ReturnType<typeof vi.fn>;
	where: ReturnType<typeof vi.fn>;
};

function createUpdateChain(): UpdateChain {
	const chain = {} as UpdateChain;
	chain.run = vi.fn();
	chain.set = vi.fn(() => chain);
	chain.where = vi.fn(() => chain);
	return chain;
}

type DeleteChain = {
	run: ReturnType<typeof vi.fn>;
	where: ReturnType<typeof vi.fn>;
};

function createDeleteChain(): DeleteChain {
	const chain = {} as DeleteChain;
	chain.run = vi.fn();
	chain.where = vi.fn(() => chain);
	return chain;
}

vi.mock("src/db", () => ({
	db: {
		delete: mocks.deleteFn,
		insert: mocks.insert,
		select: mocks.select,
		update: mocks.update,
	},
}));

// -- import module under test --

import {
	deleteUnmappedFilesFn,
	getUnmappedFileCountFn,
	getUnmappedFilesFn,
	ignoreUnmappedFilesFn,
	mapUnmappedFileFn,
	rescanAllRootFoldersFn,
	rescanRootFolderFn,
	searchLibraryFn,
} from "./unmapped-files";

// -- helpers --

function useDefaultMocks() {
	mocks.requireAuth.mockResolvedValue({ user: { id: 1 } });
	mocks.requireAdmin.mockResolvedValue({ user: { id: 1, role: "admin" } });
}

describe("server/unmapped-files", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		useDefaultMocks();
	});

	// ─── getUnmappedFilesFn ────────────────────────────────────────────────

	describe("getUnmappedFilesFn", () => {
		it("returns files grouped by root folder with profile names", async () => {
			const rows = [
				{
					id: 1,
					path: "/media/movies/file.mkv",
					rootFolderPath: "/media/movies",
					contentType: "movie",
					ignored: false,
				},
				{
					id: 2,
					path: "/media/movies/file2.mkv",
					rootFolderPath: "/media/movies",
					contentType: "movie",
					ignored: false,
				},
			];

			const filesChain = createSelectChain(undefined, rows);
			const profileChain = createSelectChain({ name: "HD Movies" });

			let callIndex = 0;
			mocks.select.mockImplementation(() => {
				callIndex++;
				if (callIndex === 1) return filesChain;
				return profileChain;
			});

			const result = await getUnmappedFilesFn({
				data: { showIgnored: false },
			});

			expect(mocks.requireAuth).toHaveBeenCalledTimes(1);
			expect(result).toHaveLength(1);
			expect(result[0].rootFolderPath).toBe("/media/movies");
			expect(result[0].profileName).toBe("HD Movies");
			expect(result[0].files).toHaveLength(2);
		});

		it("applies content type filter when provided", async () => {
			const filesChain = createSelectChain(undefined, []);
			mocks.select.mockReturnValue(filesChain);

			await getUnmappedFilesFn({
				data: { showIgnored: false, contentType: "movie" },
			});

			expect(mocks.eq).toHaveBeenCalledWith(
				schemaMocks.unmappedFiles.ignored,
				false,
			);
			expect(mocks.eq).toHaveBeenCalledWith(
				schemaMocks.unmappedFiles.contentType,
				"movie",
			);
			expect(mocks.and).toHaveBeenCalled();
		});

		it("applies search filter when provided", async () => {
			const filesChain = createSelectChain(undefined, []);
			mocks.select.mockReturnValue(filesChain);

			await getUnmappedFilesFn({
				data: { showIgnored: false, search: "test" },
			});

			expect(mocks.like).toHaveBeenCalledWith(
				schemaMocks.unmappedFiles.path,
				"%test%",
			);
		});

		it("skips ignored filter when showIgnored is true", async () => {
			const filesChain = createSelectChain(undefined, []);
			mocks.select.mockReturnValue(filesChain);

			await getUnmappedFilesFn({ data: { showIgnored: true } });

			// eq should not be called for the ignored column
			expect(mocks.eq).not.toHaveBeenCalledWith(
				schemaMocks.unmappedFiles.ignored,
				false,
			);
		});

		it("returns null profileName when no profile matches root folder", async () => {
			const rows = [
				{
					id: 1,
					path: "/unknown/file.mkv",
					rootFolderPath: "/unknown",
					contentType: "movie",
					ignored: false,
				},
			];

			const filesChain = createSelectChain(undefined, rows);
			const profileChain = createSelectChain(undefined); // no match

			let callIndex = 0;
			mocks.select.mockImplementation(() => {
				callIndex++;
				if (callIndex === 1) return filesChain;
				return profileChain;
			});

			const result = await getUnmappedFilesFn({
				data: { showIgnored: false },
			});

			expect(result[0].profileName).toBeNull();
		});

		it("returns empty array when no files exist", async () => {
			mocks.select.mockReturnValue(createSelectChain(undefined, []));

			const result = await getUnmappedFilesFn({
				data: { showIgnored: false },
			});

			expect(result).toEqual([]);
		});

		it("rejects when auth fails", async () => {
			mocks.requireAuth.mockRejectedValueOnce(new Error("unauthorized"));

			await expect(
				getUnmappedFilesFn({ data: { showIgnored: false } }),
			).rejects.toThrow("unauthorized");
		});
	});

	// ─── getUnmappedFileCountFn ────────────────────────────────────────────

	describe("getUnmappedFileCountFn", () => {
		it("returns count of non-ignored unmapped files", async () => {
			const chain = createSelectChain({ count: 42 });
			mocks.select.mockReturnValue(chain);

			const result = await getUnmappedFileCountFn();

			expect(mocks.requireAuth).toHaveBeenCalledTimes(1);
			expect(result).toBe(42);
		});

		it("returns 0 when count query returns undefined", async () => {
			const chain = createSelectChain(undefined);
			mocks.select.mockReturnValue(chain);

			const result = await getUnmappedFileCountFn();

			expect(result).toBe(0);
		});

		it("rejects when auth fails", async () => {
			mocks.requireAuth.mockRejectedValueOnce(new Error("unauthorized"));

			await expect(getUnmappedFileCountFn()).rejects.toThrow("unauthorized");
		});
	});

	// ─── ignoreUnmappedFilesFn ─────────────────────────────────────────────

	describe("ignoreUnmappedFilesFn", () => {
		it("sets ignored flag on all specified file ids", async () => {
			const updateChain = createUpdateChain();
			mocks.update.mockReturnValue(updateChain);

			const result = await ignoreUnmappedFilesFn({
				data: { ids: [1, 2, 3], ignored: true },
			});

			expect(mocks.requireAdmin).toHaveBeenCalledTimes(1);
			expect(mocks.update).toHaveBeenCalledTimes(3);
			expect(updateChain.set).toHaveBeenCalledWith({ ignored: true });
			expect(mocks.eventBusEmit).toHaveBeenCalledWith({
				type: "unmappedFilesUpdated",
			});
			expect(result).toEqual({ success: true });
		});

		it("can unignore files", async () => {
			const updateChain = createUpdateChain();
			mocks.update.mockReturnValue(updateChain);

			await ignoreUnmappedFilesFn({
				data: { ids: [5], ignored: false },
			});

			expect(updateChain.set).toHaveBeenCalledWith({ ignored: false });
		});

		it("rejects when admin auth fails", async () => {
			mocks.requireAdmin.mockRejectedValueOnce(new Error("forbidden"));

			await expect(
				ignoreUnmappedFilesFn({ data: { ids: [1], ignored: true } }),
			).rejects.toThrow("forbidden");
			expect(mocks.update).not.toHaveBeenCalled();
		});
	});

	// ─── deleteUnmappedFilesFn ─────────────────────────────────────────────

	describe("deleteUnmappedFilesFn", () => {
		it("deletes files from disk and database", async () => {
			const file = { id: 1, path: "/media/movies/old.mkv" };

			const selectChain = createSelectChain(file);
			mocks.select.mockReturnValue(selectChain);

			const deleteChain = createDeleteChain();
			mocks.deleteFn.mockReturnValue(deleteChain);

			const result = await deleteUnmappedFilesFn({
				data: { ids: [1] },
			});

			expect(mocks.requireAdmin).toHaveBeenCalledTimes(1);
			expect(mocks.unlinkSync).toHaveBeenCalledWith("/media/movies/old.mkv");
			expect(mocks.deleteFn).toHaveBeenCalledWith(schemaMocks.unmappedFiles);
			expect(deleteChain.run).toHaveBeenCalledTimes(1);
			expect(mocks.eventBusEmit).toHaveBeenCalledWith({
				type: "unmappedFilesUpdated",
			});
			expect(result).toEqual({ success: true });
		});

		it("skips file when not found in database", async () => {
			const selectChain = createSelectChain(undefined); // not found
			mocks.select.mockReturnValue(selectChain);

			const result = await deleteUnmappedFilesFn({
				data: { ids: [999] },
			});

			expect(mocks.unlinkSync).not.toHaveBeenCalled();
			expect(mocks.deleteFn).not.toHaveBeenCalled();
			expect(result).toEqual({ success: true });
		});

		it("logs warning when disk delete fails and continues", async () => {
			const file = { id: 1, path: "/media/movies/locked.mkv" };

			const selectChain = createSelectChain(file);
			mocks.select.mockReturnValue(selectChain);

			const deleteChain = createDeleteChain();
			mocks.deleteFn.mockReturnValue(deleteChain);

			mocks.unlinkSync.mockImplementation(() => {
				throw new Error("permission denied");
			});

			const result = await deleteUnmappedFilesFn({
				data: { ids: [1] },
			});

			expect(mocks.logWarn).toHaveBeenCalledWith(
				"unmapped-files",
				expect.stringContaining("permission denied"),
			);
			// DB row should still be deleted
			expect(deleteChain.run).toHaveBeenCalledTimes(1);
			expect(result).toEqual({ success: true });
		});

		it("rejects when admin auth fails", async () => {
			mocks.requireAdmin.mockRejectedValueOnce(new Error("forbidden"));

			await expect(
				deleteUnmappedFilesFn({ data: { ids: [1] } }),
			).rejects.toThrow("forbidden");
			expect(mocks.unlinkSync).not.toHaveBeenCalled();
		});
	});

	// ─── mapUnmappedFileFn ─────────────────────────────────────────────────

	describe("mapUnmappedFileFn", () => {
		const baseData = {
			unmappedFileIds: [1],
			entityType: "book" as const,
			entityId: 10,
			downloadProfileId: 5,
		};

		it("throws when download profile not found", async () => {
			// First select returns profile (undefined)
			const profileChain = createSelectChain(undefined);
			mocks.select.mockReturnValue(profileChain);

			await expect(mapUnmappedFileFn({ data: baseData })).rejects.toThrow(
				"Download profile 5 not found",
			);
		});

		it("maps an audio book file with probe metadata", async () => {
			const profile = { id: 5, name: "Audiobooks" };
			const file = {
				id: 1,
				path: "/media/books/story.m4b",
				size: 50000,
				quality: { quality: { name: "Lossless" } },
			};

			const profileChain = createSelectChain(profile);
			const fileChain = createSelectChain(file);

			let selectIndex = 0;
			mocks.select.mockImplementation(() => {
				selectIndex++;
				if (selectIndex === 1) return profileChain;
				return fileChain;
			});

			const insertChain = createInsertChain();
			mocks.insert.mockReturnValue(insertChain);

			const deleteChain = createDeleteChain();
			mocks.deleteFn.mockReturnValue(deleteChain);

			mocks.probeAudioFile.mockResolvedValue({
				duration: 3600,
				bitrate: 128000,
				sampleRate: 44100,
				channels: 2,
				codec: "aac",
			});

			const result = await mapUnmappedFileFn({ data: baseData });

			expect(mocks.requireAdmin).toHaveBeenCalledTimes(1);
			expect(mocks.probeAudioFile).toHaveBeenCalledWith(
				"/media/books/story.m4b",
			);
			expect(mocks.insert).toHaveBeenCalledWith(schemaMocks.bookFiles);
			expect(insertChain.values).toHaveBeenCalledWith(
				expect.objectContaining({
					bookId: 10,
					path: "/media/books/story.m4b",
					duration: 3600,
					bitrate: 128000,
					codec: "aac",
				}),
			);
			// History entry
			expect(mocks.insert).toHaveBeenCalledWith(schemaMocks.history);
			// Removed from unmapped
			expect(mocks.deleteFn).toHaveBeenCalledWith(schemaMocks.unmappedFiles);
			expect(mocks.eventBusEmit).toHaveBeenCalledWith({
				type: "unmappedFilesUpdated",
			});
			expect(result).toEqual({ success: true, mappedCount: 1 });
		});

		it("maps an ebook file with ebook probe", async () => {
			const profile = { id: 5, name: "Ebooks" };
			const file = {
				id: 1,
				path: "/media/books/novel.epub",
				size: 5000,
				quality: null,
			};

			const profileChain = createSelectChain(profile);
			const fileChain = createSelectChain(file);

			let selectIndex = 0;
			mocks.select.mockImplementation(() => {
				selectIndex++;
				if (selectIndex === 1) return profileChain;
				return fileChain;
			});

			const insertChain = createInsertChain();
			mocks.insert.mockReturnValue(insertChain);

			const deleteChain = createDeleteChain();
			mocks.deleteFn.mockReturnValue(deleteChain);

			mocks.probeEbookFile.mockReturnValue({
				pageCount: 350,
				language: "en",
			});

			const result = await mapUnmappedFileFn({ data: baseData });

			expect(mocks.probeEbookFile).toHaveBeenCalledWith(
				"/media/books/novel.epub",
			);
			expect(insertChain.values).toHaveBeenCalledWith(
				expect.objectContaining({
					bookId: 10,
					pageCount: 350,
					language: "en",
					duration: null,
				}),
			);
			expect(result).toEqual({ success: true, mappedCount: 1 });
		});

		it("maps a movie file with video probe", async () => {
			const profile = { id: 5, name: "Movies" };
			const file = {
				id: 1,
				path: "/media/movies/film.mkv",
				size: 8000000,
				quality: { quality: { name: "1080p" } },
			};

			const profileChain = createSelectChain(profile);
			const fileChain = createSelectChain(file);

			let selectIndex = 0;
			mocks.select.mockImplementation(() => {
				selectIndex++;
				if (selectIndex === 1) return profileChain;
				return fileChain;
			});

			const insertChain = createInsertChain();
			mocks.insert.mockReturnValue(insertChain);

			const deleteChain = createDeleteChain();
			mocks.deleteFn.mockReturnValue(deleteChain);

			mocks.probeVideoFile.mockResolvedValue({
				duration: 7200,
				codec: "h264",
				container: "matroska",
			});

			const result = await mapUnmappedFileFn({
				data: { ...baseData, entityType: "movie" },
			});

			expect(mocks.probeVideoFile).toHaveBeenCalledWith(
				"/media/movies/film.mkv",
			);
			expect(mocks.insert).toHaveBeenCalledWith(schemaMocks.movieFiles);
			expect(insertChain.values).toHaveBeenCalledWith(
				expect.objectContaining({
					movieId: 10,
					duration: 7200,
					codec: "h264",
					container: "matroska",
				}),
			);
			expect(result).toEqual({ success: true, mappedCount: 1 });
		});

		it("maps an episode file with video probe", async () => {
			const profile = { id: 5, name: "TV" };
			const file = {
				id: 1,
				path: "/media/tv/ep01.mkv",
				size: 4000000,
				quality: { quality: { name: "720p" } },
			};

			const profileChain = createSelectChain(profile);
			const fileChain = createSelectChain(file);

			let selectIndex = 0;
			mocks.select.mockImplementation(() => {
				selectIndex++;
				if (selectIndex === 1) return profileChain;
				return fileChain;
			});

			const insertChain = createInsertChain();
			mocks.insert.mockReturnValue(insertChain);

			const deleteChain = createDeleteChain();
			mocks.deleteFn.mockReturnValue(deleteChain);

			mocks.probeVideoFile.mockResolvedValue({
				duration: 2400,
				codec: "hevc",
				container: "matroska",
			});

			const result = await mapUnmappedFileFn({
				data: { ...baseData, entityType: "episode" },
			});

			expect(mocks.insert).toHaveBeenCalledWith(schemaMocks.episodeFiles);
			expect(insertChain.values).toHaveBeenCalledWith(
				expect.objectContaining({
					episodeId: 10,
					duration: 2400,
					codec: "hevc",
				}),
			);
			expect(result).toEqual({ success: true, mappedCount: 1 });
		});

		it("sets part/partCount for multi-part audiobooks", async () => {
			const profile = { id: 5, name: "Audiobooks" };
			const file1 = {
				id: 1,
				path: "/media/books/part1.mp3",
				size: 50000,
				quality: null,
			};
			const file2 = {
				id: 2,
				path: "/media/books/part2.mp3",
				size: 50000,
				quality: null,
			};

			const profileChain = createSelectChain(profile);

			let selectIndex = 0;
			mocks.select.mockImplementation(() => {
				selectIndex++;
				if (selectIndex === 1) return profileChain;
				if (selectIndex === 2) return createSelectChain(file1);
				return createSelectChain(file2);
			});

			const insertChain = createInsertChain();
			mocks.insert.mockReturnValue(insertChain);

			const deleteChain = createDeleteChain();
			mocks.deleteFn.mockReturnValue(deleteChain);

			mocks.probeAudioFile.mockResolvedValue({
				duration: 1800,
				bitrate: 128000,
				sampleRate: 44100,
				channels: 2,
				codec: "mp3",
			});

			await mapUnmappedFileFn({
				data: { ...baseData, unmappedFileIds: [1, 2] },
			});

			// First audio file: part=1, partCount=2
			expect(insertChain.values).toHaveBeenCalledWith(
				expect.objectContaining({
					part: 1,
					partCount: 2,
				}),
			);
			// Second audio file: part=2, partCount=2
			expect(insertChain.values).toHaveBeenCalledWith(
				expect.objectContaining({
					part: 2,
					partCount: 2,
				}),
			);
		});

		it("skips unmapped files not found in database", async () => {
			const profile = { id: 5, name: "Movies" };
			const profileChain = createSelectChain(profile);

			// File lookup returns undefined (not found)
			const fileChain = createSelectChain(undefined);

			let selectIndex = 0;
			mocks.select.mockImplementation(() => {
				selectIndex++;
				if (selectIndex === 1) return profileChain;
				return fileChain;
			});

			const result = await mapUnmappedFileFn({
				data: { ...baseData, entityType: "movie" },
			});

			expect(mocks.insert).not.toHaveBeenCalled();
			expect(result).toEqual({ success: true, mappedCount: 0 });
		});

		it("handles null probe result for video files", async () => {
			const profile = { id: 5, name: "Movies" };
			const file = {
				id: 1,
				path: "/media/movies/film.mkv",
				size: 8000000,
				quality: null,
			};

			const profileChain = createSelectChain(profile);
			const fileChain = createSelectChain(file);

			let selectIndex = 0;
			mocks.select.mockImplementation(() => {
				selectIndex++;
				if (selectIndex === 1) return profileChain;
				return fileChain;
			});

			const insertChain = createInsertChain();
			mocks.insert.mockReturnValue(insertChain);

			const deleteChain = createDeleteChain();
			mocks.deleteFn.mockReturnValue(deleteChain);

			mocks.probeVideoFile.mockResolvedValue(null);

			await mapUnmappedFileFn({
				data: { ...baseData, entityType: "movie" },
			});

			expect(insertChain.values).toHaveBeenCalledWith(
				expect.objectContaining({
					duration: null,
					codec: null,
					container: null,
				}),
			);
		});

		it("rejects when admin auth fails", async () => {
			mocks.requireAdmin.mockRejectedValueOnce(new Error("forbidden"));

			await expect(mapUnmappedFileFn({ data: baseData })).rejects.toThrow(
				"forbidden",
			);
			expect(mocks.select).not.toHaveBeenCalled();
		});
	});

	// ─── rescanAllRootFoldersFn ────────────────────────────────────────────

	describe("rescanAllRootFoldersFn", () => {
		it("rescans all root folders and returns results", async () => {
			mocks.getRootFolderPaths.mockReturnValue(["/media/movies", "/media/tv"]);
			mocks.rescanRootFolder
				.mockResolvedValueOnce({ added: 5, removed: 2 })
				.mockResolvedValueOnce({ added: 3, removed: 0 });

			const result = await rescanAllRootFoldersFn();

			expect(mocks.requireAdmin).toHaveBeenCalledTimes(1);
			expect(mocks.rescanRootFolder).toHaveBeenCalledWith("/media/movies");
			expect(mocks.rescanRootFolder).toHaveBeenCalledWith("/media/tv");
			expect(mocks.eventBusEmit).toHaveBeenCalledWith({
				type: "unmappedFilesUpdated",
			});
			expect(result).toEqual([
				{
					rootFolderPath: "/media/movies",
					stats: { added: 5, removed: 2 },
				},
				{
					rootFolderPath: "/media/tv",
					stats: { added: 3, removed: 0 },
				},
			]);
		});

		it("returns empty results when no root folders exist", async () => {
			mocks.getRootFolderPaths.mockReturnValue([]);

			const result = await rescanAllRootFoldersFn();

			expect(result).toEqual([]);
			expect(mocks.rescanRootFolder).not.toHaveBeenCalled();
			expect(mocks.eventBusEmit).toHaveBeenCalledWith({
				type: "unmappedFilesUpdated",
			});
		});

		it("rejects when admin auth fails", async () => {
			mocks.requireAdmin.mockRejectedValueOnce(new Error("forbidden"));

			await expect(rescanAllRootFoldersFn()).rejects.toThrow("forbidden");
			expect(mocks.getRootFolderPaths).not.toHaveBeenCalled();
		});
	});

	// ─── rescanRootFolderFn ────────────────────────────────────────────────

	describe("rescanRootFolderFn", () => {
		it("rescans a single root folder and emits event", async () => {
			mocks.rescanRootFolder.mockResolvedValue({ added: 10, removed: 1 });

			const result = await rescanRootFolderFn({
				data: { rootFolderPath: "/media/movies" },
			});

			expect(mocks.requireAdmin).toHaveBeenCalledTimes(1);
			expect(mocks.rescanRootFolder).toHaveBeenCalledWith("/media/movies");
			expect(mocks.eventBusEmit).toHaveBeenCalledWith({
				type: "unmappedFilesUpdated",
			});
			expect(result).toEqual({ added: 10, removed: 1 });
		});

		it("rejects when admin auth fails", async () => {
			mocks.requireAdmin.mockRejectedValueOnce(new Error("forbidden"));

			await expect(
				rescanRootFolderFn({ data: { rootFolderPath: "/media" } }),
			).rejects.toThrow("forbidden");
			expect(mocks.rescanRootFolder).not.toHaveBeenCalled();
		});
	});

	// ─── searchLibraryFn ──────────────────────────────────────────────────

	describe("searchLibraryFn", () => {
		it("searches ebook content type and returns book results", async () => {
			const bookResults = [
				{
					id: 1,
					title: "Test Book",
					releaseYear: 2024,
					authorName: "Author One",
				},
			];
			const chain = createSelectChain(undefined, bookResults);
			mocks.select.mockReturnValue(chain);

			const result = await searchLibraryFn({
				data: { query: "Test", contentType: "ebook" },
			});

			expect(mocks.requireAuth).toHaveBeenCalledTimes(1);
			expect(result.library).toHaveLength(1);
			expect(result.library[0]).toEqual({
				id: 1,
				title: "Test Book",
				subtitle: "Author One · 2024",
				entityType: "book",
			});
			expect(result.external).toEqual([]);
		});

		it("searches audiobook content type (same as ebook)", async () => {
			const bookResults = [
				{
					id: 2,
					title: "Audio Book",
					releaseYear: null,
					authorName: null,
				},
			];
			const chain = createSelectChain(undefined, bookResults);
			mocks.select.mockReturnValue(chain);

			const result = await searchLibraryFn({
				data: { query: "Audio", contentType: "audiobook" },
			});

			expect(result.library).toHaveLength(1);
			expect(result.library[0].subtitle).toBe("");
		});

		it("searches movie content type", async () => {
			const movieResults = [{ id: 5, title: "Action Movie", year: 2023 }];
			const chain = createSelectChain(undefined, movieResults);
			mocks.select.mockReturnValue(chain);

			const result = await searchLibraryFn({
				data: { query: "Action", contentType: "movie" },
			});

			expect(result.library).toHaveLength(1);
			expect(result.library[0]).toEqual({
				id: 5,
				title: "Action Movie",
				subtitle: "2023",
				entityType: "movie",
			});
		});

		it("searches movie with year 0 returns empty subtitle", async () => {
			const movieResults = [{ id: 6, title: "Unknown Year", year: 0 }];
			const chain = createSelectChain(undefined, movieResults);
			mocks.select.mockReturnValue(chain);

			const result = await searchLibraryFn({
				data: { query: "Unknown", contentType: "movie" },
			});

			expect(result.library[0].subtitle).toBe("");
		});

		it("searches tv content type", async () => {
			const episodeResults = [
				{
					id: 10,
					title: "Pilot",
					seasonNumber: 1,
					episodeNumber: 1,
					showTitle: "Great Show",
				},
			];
			const chain = createSelectChain(undefined, episodeResults);
			mocks.select.mockReturnValue(chain);

			const result = await searchLibraryFn({
				data: { query: "Great", contentType: "tv" },
			});

			expect(result.library).toHaveLength(1);
			expect(result.library[0]).toEqual({
				id: 10,
				title: "Great Show",
				subtitle: "S01E01 - Pilot",
				entityType: "episode",
			});
		});

		it("returns empty library for unknown content type", async () => {
			const result = await searchLibraryFn({
				data: { query: "anything", contentType: "unknown" },
			});

			expect(result.library).toEqual([]);
			expect(result.external).toEqual([]);
		});

		it("rejects when auth fails", async () => {
			mocks.requireAuth.mockRejectedValueOnce(new Error("unauthorized"));

			await expect(
				searchLibraryFn({
					data: { query: "test", contentType: "movie" },
				}),
			).rejects.toThrow("unauthorized");
		});
	});
});
