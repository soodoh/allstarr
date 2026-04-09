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
	const sql = vi.fn((strings: TemplateStringsArray, ..._values: unknown[]) => ({
		kind: "sql",
		text: strings.join(""),
	}));

	const requireAuth = vi.fn();
	const requireAdmin = vi.fn();
	const existsSync = vi.fn();
	const mkdirSync = vi.fn();
	const renameSync = vi.fn();
	const dirname = vi.fn((p: string) => {
		const lastSlash = p.lastIndexOf("/");
		return lastSlash > 0 ? p.slice(0, lastSlash) : "/";
	});
	const invalidateFormatDefCache = vi.fn();

	const select = vi.fn();
	const insert = vi.fn();
	const update = vi.fn();
	const deleteFn = vi.fn();

	return {
		and,
		deleteFn,
		dirname,
		eq,
		existsSync,
		insert,
		invalidateFormatDefCache,
		like,
		mkdirSync,
		renameSync,
		requireAdmin,
		requireAuth,
		select,
		sql,
		update,
	};
});

const schemaMocks = vi.hoisted(
	() =>
		({
			authorDownloadProfiles: {
				authorId: "authorDownloadProfiles.authorId",
				downloadProfileId: "authorDownloadProfiles.downloadProfileId",
			},
			bookFiles: {
				bookId: "bookFiles.bookId",
				id: "bookFiles.id",
				path: "bookFiles.path",
			},
			books: { id: "books.id" },
			booksAuthors: {
				authorId: "booksAuthors.authorId",
				bookId: "booksAuthors.bookId",
			},
			downloadFormats: { id: "downloadFormats.id" },
			downloadProfiles: {
				id: "downloadProfiles.id",
				items: "downloadProfiles.items",
			},
			episodeFiles: {
				episodeId: "episodeFiles.episodeId",
				id: "episodeFiles.id",
				path: "episodeFiles.path",
			},
			episodes: {
				episodeId: "episodes.episodeId",
				id: "episodes.id",
				showId: "episodes.showId",
			},
			movieDownloadProfiles: {
				downloadProfileId: "movieDownloadProfiles.downloadProfileId",
				movieId: "movieDownloadProfiles.movieId",
			},
			movieFiles: {
				id: "movieFiles.id",
				movieId: "movieFiles.movieId",
				path: "movieFiles.path",
			},
			movies: {
				id: "movies.id",
				path: "movies.path",
			},
			showDownloadProfiles: {
				downloadProfileId: "showDownloadProfiles.downloadProfileId",
				showId: "showDownloadProfiles.showId",
			},
			shows: {
				id: "shows.id",
				path: "shows.path",
			},
		}) as const,
);

// -- module mocks --

vi.mock("@tanstack/react-start", () => ({
	createServerFn: () => ({
		handler: (handler: (...args: unknown[]) => unknown) => handler,
		inputValidator: () => ({
			handler: (handler: (...args: unknown[]) => unknown) => handler,
		}),
	}),
}));

vi.mock("drizzle-orm", () => ({
	and: mocks.and,
	eq: mocks.eq,
	like: mocks.like,
	sql: mocks.sql,
}));

vi.mock("node:fs", () => ({
	default: {
		existsSync: mocks.existsSync,
		mkdirSync: mocks.mkdirSync,
		renameSync: mocks.renameSync,
	},
	existsSync: mocks.existsSync,
	mkdirSync: mocks.mkdirSync,
	renameSync: mocks.renameSync,
}));

vi.mock("node:path", () => ({
	default: { dirname: mocks.dirname },
	dirname: mocks.dirname,
}));

vi.mock("src/lib/validators", () => ({
	createDownloadFormatSchema: { parse: (d: unknown) => d },
	createDownloadProfileSchema: { parse: (d: unknown) => d },
	updateDownloadFormatSchema: { parse: (d: unknown) => d },
	updateDownloadProfileSchema: { parse: (d: unknown) => d },
}));

vi.mock("./indexers/format-parser", () => ({
	invalidateFormatDefCache: mocks.invalidateFormatDefCache,
}));

vi.mock("./middleware", () => ({
	requireAdmin: mocks.requireAdmin,
	requireAuth: mocks.requireAuth,
}));

// -- chainable DB helpers --

type SelectChain = {
	all: ReturnType<typeof vi.fn>;
	from: ReturnType<typeof vi.fn>;
	get: ReturnType<typeof vi.fn>;
	innerJoin: ReturnType<typeof vi.fn>;
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
	chain.where = vi.fn(() => chain);
	return chain;
}

type InsertChain = {
	get: ReturnType<typeof vi.fn>;
	returning: ReturnType<typeof vi.fn>;
	values: ReturnType<typeof vi.fn>;
};

function createInsertChain(result: unknown = { id: 1 }): InsertChain {
	const chain = {} as InsertChain;
	chain.get = vi.fn(() => result);
	chain.returning = vi.fn(() => chain);
	chain.values = vi.fn(() => chain);
	return chain;
}

type UpdateChain = {
	get: ReturnType<typeof vi.fn>;
	returning: ReturnType<typeof vi.fn>;
	run: ReturnType<typeof vi.fn>;
	set: ReturnType<typeof vi.fn>;
	where: ReturnType<typeof vi.fn>;
};

function createUpdateChain(result: unknown = { id: 1 }): UpdateChain {
	const chain = {} as UpdateChain;
	chain.get = vi.fn(() => result);
	chain.returning = vi.fn(() => chain);
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

vi.mock("src/db/schema", () => schemaMocks);

// -- import module under test --

import {
	countProfileFilesFn,
	createDownloadFormatFn,
	createDownloadProfileFn,
	deleteDownloadFormatFn,
	deleteDownloadProfileFn,
	getDownloadFormatsFn,
	getDownloadProfilesFn,
	moveProfileFilesFn,
	updateDownloadFormatFn,
	updateDownloadProfileFn,
} from "./download-profiles";

// -- helpers --

function useDefaultMocks() {
	mocks.requireAuth.mockResolvedValue({ user: { id: 1 } });
	mocks.requireAdmin.mockResolvedValue({ user: { id: 1, role: "admin" } });
	mocks.existsSync.mockReturnValue(true);
}

describe("server/download-profiles", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		useDefaultMocks();
	});

	// ===== Download Profiles CRUD =====

	describe("getDownloadProfilesFn", () => {
		it("returns all download profiles", async () => {
			const profiles = [
				{ id: 1, name: "HD Movies" },
				{ id: 2, name: "SD TV" },
			];
			const chain = createSelectChain(undefined, profiles);
			mocks.select.mockReturnValue(chain);

			const result = await getDownloadProfilesFn();

			expect(mocks.requireAuth).toHaveBeenCalledTimes(1);
			expect(mocks.select).toHaveBeenCalledTimes(1);
			expect(chain.from).toHaveBeenCalledWith(schemaMocks.downloadProfiles);
			expect(chain.all).toHaveBeenCalledTimes(1);
			expect(result).toEqual(profiles);
		});

		it("rejects when auth fails", async () => {
			mocks.requireAuth.mockRejectedValueOnce(new Error("no auth"));

			await expect(getDownloadProfilesFn()).rejects.toThrow("no auth");
			expect(mocks.select).not.toHaveBeenCalled();
		});
	});

	describe("createDownloadProfileFn", () => {
		const profileData = {
			name: "HD Movies",
			rootFolderPath: "/movies/hd",
			cutoff: 0,
			items: [[1, 2]],
			upgradeAllowed: false,
			icon: "film",
			categories: [],
			contentType: "movie",
			language: "en",
			minCustomFormatScore: 0,
			upgradeUntilCustomFormatScore: 0,
		};

		it("creates a profile after admin and root folder validation", async () => {
			const created = { id: 1, ...profileData };
			const chain = createInsertChain(created);
			mocks.insert.mockReturnValue(chain);

			const result = await createDownloadProfileFn({ data: profileData });

			expect(mocks.requireAdmin).toHaveBeenCalledTimes(1);
			expect(mocks.existsSync).toHaveBeenCalledWith("/movies/hd");
			expect(mocks.insert).toHaveBeenCalledWith(schemaMocks.downloadProfiles);
			expect(chain.values).toHaveBeenCalledWith(profileData);
			expect(chain.returning).toHaveBeenCalledTimes(1);
			expect(chain.get).toHaveBeenCalledTimes(1);
			expect(result).toEqual(created);
		});

		it("throws when root folder does not exist", async () => {
			mocks.existsSync.mockReturnValue(false);

			await expect(
				createDownloadProfileFn({ data: profileData }),
			).rejects.toThrow("Root folder does not exist: /movies/hd");
			expect(mocks.insert).not.toHaveBeenCalled();
		});

		it("rejects when not admin", async () => {
			mocks.requireAdmin.mockRejectedValueOnce(new Error("not admin"));

			await expect(
				createDownloadProfileFn({ data: profileData }),
			).rejects.toThrow("not admin");
			expect(mocks.insert).not.toHaveBeenCalled();
		});

		it("skips root folder validation when rootFolderPath is empty", async () => {
			const data = { ...profileData, rootFolderPath: "" };
			const chain = createInsertChain({ id: 1, ...data });
			mocks.insert.mockReturnValue(chain);

			await createDownloadProfileFn({ data });

			expect(mocks.existsSync).not.toHaveBeenCalled();
		});
	});

	describe("updateDownloadProfileFn", () => {
		const updateData = {
			id: 5,
			name: "Updated Profile",
			rootFolderPath: "/tv/hd",
			cutoff: 1,
			items: [[3]],
			upgradeAllowed: true,
			icon: "tv",
			categories: [],
			contentType: "tv",
			language: "en",
			minCustomFormatScore: 0,
			upgradeUntilCustomFormatScore: 0,
		};

		it("updates a profile with root folder validation", async () => {
			const updated = { ...updateData };
			const chain = createUpdateChain(updated);
			mocks.update.mockReturnValue(chain);

			const result = await updateDownloadProfileFn({ data: updateData });

			expect(mocks.requireAdmin).toHaveBeenCalledTimes(1);
			expect(mocks.existsSync).toHaveBeenCalledWith("/tv/hd");
			expect(mocks.update).toHaveBeenCalledWith(schemaMocks.downloadProfiles);

			const { id: _id, ...values } = updateData;
			expect(chain.set).toHaveBeenCalledWith(values);
			expect(chain.where).toHaveBeenCalledWith(
				expect.objectContaining({
					kind: "eq",
					left: schemaMocks.downloadProfiles.id,
					right: 5,
				}),
			);
			expect(result).toEqual(updated);
		});

		it("throws when root folder does not exist", async () => {
			mocks.existsSync.mockReturnValue(false);

			await expect(
				updateDownloadProfileFn({ data: updateData }),
			).rejects.toThrow("Root folder does not exist: /tv/hd");
			expect(mocks.update).not.toHaveBeenCalled();
		});

		it("rejects when not admin", async () => {
			mocks.requireAdmin.mockRejectedValueOnce(new Error("not admin"));

			await expect(
				updateDownloadProfileFn({ data: updateData }),
			).rejects.toThrow("not admin");
		});
	});

	describe("deleteDownloadProfileFn", () => {
		it("deletes a profile by id", async () => {
			const chain = createDeleteChain();
			mocks.deleteFn.mockReturnValue(chain);

			const result = await deleteDownloadProfileFn({ data: { id: 10 } });

			expect(mocks.requireAdmin).toHaveBeenCalledTimes(1);
			expect(mocks.deleteFn).toHaveBeenCalledWith(schemaMocks.downloadProfiles);
			expect(chain.where).toHaveBeenCalledWith(
				expect.objectContaining({
					kind: "eq",
					left: schemaMocks.downloadProfiles.id,
					right: 10,
				}),
			);
			expect(chain.run).toHaveBeenCalledTimes(1);
			expect(result).toEqual({ success: true });
		});

		it("rejects when not admin", async () => {
			mocks.requireAdmin.mockRejectedValueOnce(new Error("not admin"));

			await expect(
				deleteDownloadProfileFn({ data: { id: 1 } }),
			).rejects.toThrow("not admin");
			expect(mocks.deleteFn).not.toHaveBeenCalled();
		});
	});

	// ===== countProfileFilesFn =====

	describe("countProfileFilesFn", () => {
		function setupCountProfile(contentType: string) {
			const profileChain = createSelectChain({
				id: 1,
				contentType,
			});
			const countChain = createSelectChain({ count: 42 });
			let callIndex = 0;
			mocks.select.mockImplementation(() => {
				callIndex++;
				return callIndex === 1 ? profileChain : countChain;
			});
			return { profileChain, countChain };
		}

		it("throws when profile not found", async () => {
			const chain = createSelectChain(undefined);
			mocks.select.mockReturnValue(chain);

			await expect(
				countProfileFilesFn({ data: { profileId: 999 } }),
			).rejects.toThrow("Download profile not found");
		});

		it("counts ebook files", async () => {
			const { countChain } = setupCountProfile("ebook");

			const result = await countProfileFilesFn({ data: { profileId: 1 } });

			expect(mocks.requireAuth).toHaveBeenCalledTimes(1);
			expect(result).toEqual({ count: 42 });
			expect(countChain.from).toHaveBeenCalledWith(schemaMocks.bookFiles);
			expect(countChain.innerJoin).toHaveBeenCalledTimes(3);
			expect(countChain.get).toHaveBeenCalledTimes(1);
		});

		it("counts audiobook files", async () => {
			const { countChain } = setupCountProfile("audiobook");

			const result = await countProfileFilesFn({ data: { profileId: 1 } });

			expect(result).toEqual({ count: 42 });
			expect(countChain.from).toHaveBeenCalledWith(schemaMocks.bookFiles);
		});

		it("counts tv files", async () => {
			const { countChain } = setupCountProfile("tv");

			const result = await countProfileFilesFn({ data: { profileId: 1 } });

			expect(result).toEqual({ count: 42 });
			expect(countChain.from).toHaveBeenCalledWith(schemaMocks.episodeFiles);
			expect(countChain.innerJoin).toHaveBeenCalledTimes(3);
		});

		it("counts movie files", async () => {
			const { countChain } = setupCountProfile("movie");

			const result = await countProfileFilesFn({ data: { profileId: 1 } });

			expect(result).toEqual({ count: 42 });
			expect(countChain.from).toHaveBeenCalledWith(schemaMocks.movieFiles);
			expect(countChain.innerJoin).toHaveBeenCalledTimes(2);
		});

		it("returns 0 for unknown content type", async () => {
			setupCountProfile("other");

			const result = await countProfileFilesFn({ data: { profileId: 1 } });

			expect(result).toEqual({ count: 0 });
		});

		it("returns 0 when count result is undefined", async () => {
			const profileChain = createSelectChain({ id: 1, contentType: "movie" });
			const countChain = createSelectChain(undefined);
			let callIndex = 0;
			mocks.select.mockImplementation(() => {
				callIndex++;
				return callIndex === 1 ? profileChain : countChain;
			});

			const result = await countProfileFilesFn({ data: { profileId: 1 } });

			expect(result).toEqual({ count: 0 });
		});
	});

	// ===== moveProfileFilesFn =====

	describe("moveProfileFilesFn", () => {
		const moveData = {
			profileId: 1,
			oldRootFolder: "/old/path",
			newRootFolder: "/new/path",
		};

		function setupMoveProfile(
			contentType: string,
			files: Array<{ id: number; path: string }>,
		) {
			const profileChain = createSelectChain({ id: 1, contentType });
			const filesChain = createSelectChain(undefined, files);
			const updateChain = createUpdateChain();
			// For tv/movie: additional query for affected shows/movies paths
			const affectedChain = createSelectChain(undefined, []);

			let selectCall = 0;
			mocks.select.mockImplementation(() => {
				selectCall++;
				if (selectCall === 1) return profileChain;
				if (selectCall === 2) return filesChain;
				return affectedChain;
			});
			mocks.update.mockReturnValue(updateChain);

			return { profileChain, filesChain, updateChain, affectedChain };
		}

		it("throws when profile not found", async () => {
			const chain = createSelectChain(undefined);
			mocks.select.mockReturnValue(chain);

			await expect(moveProfileFilesFn({ data: moveData })).rejects.toThrow(
				"Download profile not found",
			);
			expect(mocks.requireAdmin).toHaveBeenCalledTimes(1);
		});

		it("moves ebook files and updates DB paths", async () => {
			const files = [
				{ id: 1, path: "/old/path/books/file1.epub" },
				{ id: 2, path: "/old/path/books/file2.epub" },
			];
			const { updateChain } = setupMoveProfile("ebook", files);

			const result = await moveProfileFilesFn({ data: moveData });

			expect(mocks.requireAdmin).toHaveBeenCalledTimes(1);
			expect(result).toEqual({ movedCount: 2, errors: [] });

			// Verify fs operations for each file
			expect(mocks.mkdirSync).toHaveBeenCalledTimes(2);
			expect(mocks.mkdirSync).toHaveBeenCalledWith("/new/path/books", {
				recursive: true,
			});
			expect(mocks.renameSync).toHaveBeenCalledTimes(2);
			expect(mocks.renameSync).toHaveBeenCalledWith(
				"/old/path/books/file1.epub",
				"/new/path/books/file1.epub",
			);
			expect(mocks.renameSync).toHaveBeenCalledWith(
				"/old/path/books/file2.epub",
				"/new/path/books/file2.epub",
			);

			// Verify DB updates
			expect(mocks.update).toHaveBeenCalledTimes(2);
			expect(mocks.update).toHaveBeenCalledWith(schemaMocks.bookFiles);
			expect(updateChain.set).toHaveBeenCalledWith({
				path: "/new/path/books/file1.epub",
			});
			expect(updateChain.set).toHaveBeenCalledWith({
				path: "/new/path/books/file2.epub",
			});
		});

		it("deduplicates ebook files by id", async () => {
			const files = [
				{ id: 1, path: "/old/path/books/dup.epub" },
				{ id: 1, path: "/old/path/books/dup.epub" },
				{ id: 2, path: "/old/path/books/other.epub" },
			];
			setupMoveProfile("ebook", files);

			const result = await moveProfileFilesFn({ data: moveData });

			expect(result.movedCount).toBe(2);
			expect(mocks.renameSync).toHaveBeenCalledTimes(2);
		});

		it("captures errors when fs.renameSync fails", async () => {
			const files = [
				{ id: 1, path: "/old/path/books/fail.epub" },
				{ id: 2, path: "/old/path/books/ok.epub" },
			];
			setupMoveProfile("ebook", files);
			mocks.renameSync
				.mockImplementationOnce(() => {
					throw new Error("permission denied");
				})
				.mockImplementationOnce(() => {});

			const result = await moveProfileFilesFn({ data: moveData });

			expect(result.movedCount).toBe(1);
			expect(result.errors).toHaveLength(1);
			expect(result.errors[0]).toContain("permission denied");
			expect(result.errors[0]).toContain("/old/path/books/fail.epub");
		});

		it("moves tv episode files and updates show paths", async () => {
			const files = [{ id: 10, path: "/old/path/shows/ep1.mkv" }];
			const affectedShows = [{ id: 5, path: "/old/path/shows/myshow" }];
			const profileChain = createSelectChain({ id: 1, contentType: "tv" });
			const filesChain = createSelectChain(undefined, files);
			const affectedShowsChain = createSelectChain(undefined, affectedShows);
			const updateChain = createUpdateChain();

			let selectCall = 0;
			mocks.select.mockImplementation(() => {
				selectCall++;
				if (selectCall === 1) return profileChain;
				if (selectCall === 2) return filesChain;
				return affectedShowsChain;
			});
			mocks.update.mockReturnValue(updateChain);

			const result = await moveProfileFilesFn({ data: moveData });

			expect(result).toEqual({ movedCount: 1, errors: [] });
			expect(mocks.renameSync).toHaveBeenCalledWith(
				"/old/path/shows/ep1.mkv",
				"/new/path/shows/ep1.mkv",
			);

			// Should update episode file path + show path
			expect(mocks.update).toHaveBeenCalledWith(schemaMocks.episodeFiles);
			expect(mocks.update).toHaveBeenCalledWith(schemaMocks.shows);
			expect(updateChain.set).toHaveBeenCalledWith({
				path: "/new/path/shows/myshow",
			});
		});

		it("moves movie files and updates movie paths", async () => {
			const files = [{ id: 20, path: "/old/path/movies/film.mkv" }];
			const affectedMovies = [{ id: 8, path: "/old/path/movies/film" }];
			const profileChain = createSelectChain({ id: 1, contentType: "movie" });
			const filesChain = createSelectChain(undefined, files);
			const affectedMoviesChain = createSelectChain(undefined, affectedMovies);
			const updateChain = createUpdateChain();

			let selectCall = 0;
			mocks.select.mockImplementation(() => {
				selectCall++;
				if (selectCall === 1) return profileChain;
				if (selectCall === 2) return filesChain;
				return affectedMoviesChain;
			});
			mocks.update.mockReturnValue(updateChain);

			const result = await moveProfileFilesFn({ data: moveData });

			expect(result).toEqual({ movedCount: 1, errors: [] });
			expect(mocks.renameSync).toHaveBeenCalledWith(
				"/old/path/movies/film.mkv",
				"/new/path/movies/film.mkv",
			);

			expect(mocks.update).toHaveBeenCalledWith(schemaMocks.movieFiles);
			expect(mocks.update).toHaveBeenCalledWith(schemaMocks.movies);
			expect(updateChain.set).toHaveBeenCalledWith({
				path: "/new/path/movies/film",
			});
		});

		it("returns zero movedCount for unknown content type", async () => {
			setupMoveProfile("other", []);

			const result = await moveProfileFilesFn({ data: moveData });

			expect(result).toEqual({ movedCount: 0, errors: [] });
		});

		it("rejects when not admin", async () => {
			mocks.requireAdmin.mockRejectedValueOnce(new Error("not admin"));

			await expect(moveProfileFilesFn({ data: moveData })).rejects.toThrow(
				"not admin",
			);
			expect(mocks.select).not.toHaveBeenCalled();
		});
	});

	// ===== Download Formats CRUD =====

	describe("getDownloadFormatsFn", () => {
		it("returns all download formats", async () => {
			const formats = [
				{ id: 1, title: "720p" },
				{ id: 2, title: "1080p" },
			];
			const chain = createSelectChain(undefined, formats);
			mocks.select.mockReturnValue(chain);

			const result = await getDownloadFormatsFn();

			expect(mocks.requireAuth).toHaveBeenCalledTimes(1);
			expect(chain.from).toHaveBeenCalledWith(schemaMocks.downloadFormats);
			expect(chain.all).toHaveBeenCalledTimes(1);
			expect(result).toEqual(formats);
		});

		it("rejects when auth fails", async () => {
			mocks.requireAuth.mockRejectedValueOnce(new Error("no auth"));

			await expect(getDownloadFormatsFn()).rejects.toThrow("no auth");
			expect(mocks.select).not.toHaveBeenCalled();
		});
	});

	describe("createDownloadFormatFn", () => {
		const formatData = { title: "720p", weight: 1, color: "blue" };

		it("creates a format and invalidates cache", async () => {
			const created = { id: 1, ...formatData };
			const chain = createInsertChain(created);
			mocks.insert.mockReturnValue(chain);

			const result = await createDownloadFormatFn({ data: formatData });

			expect(mocks.requireAdmin).toHaveBeenCalledTimes(1);
			expect(mocks.insert).toHaveBeenCalledWith(schemaMocks.downloadFormats);
			expect(chain.values).toHaveBeenCalledWith(formatData);
			expect(chain.returning).toHaveBeenCalledTimes(1);
			expect(chain.get).toHaveBeenCalledTimes(1);
			expect(mocks.invalidateFormatDefCache).toHaveBeenCalledTimes(1);
			expect(result).toEqual(created);
		});

		it("rejects when not admin", async () => {
			mocks.requireAdmin.mockRejectedValueOnce(new Error("not admin"));

			await expect(
				createDownloadFormatFn({ data: formatData }),
			).rejects.toThrow("not admin");
			expect(mocks.insert).not.toHaveBeenCalled();
		});
	});

	describe("updateDownloadFormatFn", () => {
		const updateData = { id: 3, title: "1080p", weight: 2, color: "green" };

		it("updates a format and invalidates cache", async () => {
			const updated = { ...updateData };
			const chain = createUpdateChain(updated);
			mocks.update.mockReturnValue(chain);

			const result = await updateDownloadFormatFn({ data: updateData });

			expect(mocks.requireAdmin).toHaveBeenCalledTimes(1);
			expect(mocks.update).toHaveBeenCalledWith(schemaMocks.downloadFormats);

			const { id: _id, ...values } = updateData;
			expect(chain.set).toHaveBeenCalledWith(values);
			expect(chain.where).toHaveBeenCalledWith(
				expect.objectContaining({
					kind: "eq",
					left: schemaMocks.downloadFormats.id,
					right: 3,
				}),
			);
			expect(mocks.invalidateFormatDefCache).toHaveBeenCalledTimes(1);
			expect(result).toEqual(updated);
		});

		it("rejects when not admin", async () => {
			mocks.requireAdmin.mockRejectedValueOnce(new Error("not admin"));

			await expect(
				updateDownloadFormatFn({ data: updateData }),
			).rejects.toThrow("not admin");
		});
	});

	describe("deleteDownloadFormatFn", () => {
		it("removes format id from profile items and deletes the format", async () => {
			const profiles = [
				{
					id: 1,
					items: [
						[1, 5, 3],
						[5, 2],
					],
				},
				{ id: 2, items: [[4, 5]] },
				{ id: 3, items: [[7, 8]] },
			];

			// First select returns all profiles; then we need update + delete chains
			const profilesChain = createSelectChain(undefined, profiles);
			mocks.select.mockReturnValue(profilesChain);

			const updateChain = createUpdateChain();
			mocks.update.mockReturnValue(updateChain);

			const deleteChain = createDeleteChain();
			mocks.deleteFn.mockReturnValue(deleteChain);

			const result = await deleteDownloadFormatFn({ data: { id: 5 } });

			expect(mocks.requireAdmin).toHaveBeenCalledTimes(1);

			// Profile 1: items [[1,5,3],[5,2]] -> [[1,3],[2]] (format 5 removed)
			// Profile 2: items [[4,5]] -> [[4]] (format 5 removed)
			// Profile 3: items [[7,8]] -> unchanged (no format 5)
			expect(mocks.update).toHaveBeenCalledTimes(2);
			expect(mocks.update).toHaveBeenCalledWith(schemaMocks.downloadProfiles);

			// Verify the items were cleaned correctly
			expect(updateChain.set).toHaveBeenCalledWith({
				items: [[1, 3], [2]],
			});
			expect(updateChain.set).toHaveBeenCalledWith({
				items: [[4]],
			});

			// Verify the format itself is deleted
			expect(mocks.deleteFn).toHaveBeenCalledWith(schemaMocks.downloadFormats);
			expect(deleteChain.where).toHaveBeenCalledWith(
				expect.objectContaining({
					kind: "eq",
					left: schemaMocks.downloadFormats.id,
					right: 5,
				}),
			);
			expect(deleteChain.run).toHaveBeenCalledTimes(1);
			expect(mocks.invalidateFormatDefCache).toHaveBeenCalledTimes(1);
			expect(result).toEqual({ success: true });
		});

		it("removes groups that become empty after format removal", async () => {
			const profiles = [{ id: 1, items: [[5], [1, 2]] }];
			const profilesChain = createSelectChain(undefined, profiles);
			mocks.select.mockReturnValue(profilesChain);

			const updateChain = createUpdateChain();
			mocks.update.mockReturnValue(updateChain);

			const deleteChain = createDeleteChain();
			mocks.deleteFn.mockReturnValue(deleteChain);

			await deleteDownloadFormatFn({ data: { id: 5 } });

			// Group [5] becomes [] and is filtered out, leaving [[1,2]]
			expect(updateChain.set).toHaveBeenCalledWith({
				items: [[1, 2]],
			});
		});

		it("skips profile update when items are unchanged", async () => {
			const profiles = [{ id: 1, items: [[1, 2]] }];
			const profilesChain = createSelectChain(undefined, profiles);
			mocks.select.mockReturnValue(profilesChain);

			const deleteChain = createDeleteChain();
			mocks.deleteFn.mockReturnValue(deleteChain);

			await deleteDownloadFormatFn({ data: { id: 99 } });

			// No profiles needed updating since format 99 wasn't in any items
			expect(mocks.update).not.toHaveBeenCalled();
			expect(deleteChain.run).toHaveBeenCalledTimes(1);
		});

		it("rejects when not admin", async () => {
			mocks.requireAdmin.mockRejectedValueOnce(new Error("not admin"));

			await expect(deleteDownloadFormatFn({ data: { id: 1 } })).rejects.toThrow(
				"not admin",
			);
			expect(mocks.select).not.toHaveBeenCalled();
			expect(mocks.deleteFn).not.toHaveBeenCalled();
		});
	});
});
