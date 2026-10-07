import * as fs from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import Database from "better-sqlite3";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import {
	executeMappingWithRollback,
	type MappingMoveOperation,
} from "src/server/unmapped-file-mapping-executor";
import { afterEach, describe, expect, it, vi } from "vitest";

const resources: Array<{ directory: string; close: () => void }> = [];

function createFixture() {
	const directory = fs.mkdtempSync(join(tmpdir(), "allstarr-mapping-"));
	const sqlite = new Database(":memory:");
	resources.push({ directory, close: () => sqlite.close() });
	const db = drizzle(sqlite);
	db.run(sql`CREATE TABLE mapped_files (path TEXT PRIMARY KEY)`);

	return {
		directory,
		db,
		file(name: string, content = name): MappingMoveOperation {
			const from = join(directory, "source", name);
			fs.mkdirSync(dirname(from), { recursive: true });
			fs.writeFileSync(from, content);
			return { from, to: join(directory, "managed", name), kind: "file" };
		},
		rows: () => db.all<{ path: string }>(sql`SELECT path FROM mapped_files`),
	};
}

function crossDeviceError(): Error {
	return Object.assign(new Error("cross-device link"), { code: "EXDEV" });
}

afterEach(() => {
	for (const resource of resources.splice(0)) {
		resource.close();
		fs.rmSync(resource.directory, { recursive: true, force: true });
	}
	vi.restoreAllMocks();
});

describe("executeMappingWithRollback", () => {
	it("moves files before committing their mappings and returns the transaction result", () => {
		const fixture = createFixture();
		const book = fixture.file("book.epub", "book contents");
		const sidecar = fixture.file("assets/cover.jpg", "cover contents");
		const expected = { mapped: 2 };

		const result = executeMappingWithRollback({
			fs,
			logLabel: "test move",
			move: ({ movePath }) => {
				movePath(book);
				movePath(sidecar);
			},
			runTransaction: () =>
				fixture.db.transaction((tx) => {
					expect(fs.readFileSync(book.to, "utf8")).toBe("book contents");
					expect(fs.readFileSync(sidecar.to, "utf8")).toBe("cover contents");
					expect(fs.existsSync(book.from)).toBe(false);
					expect(fs.existsSync(sidecar.from)).toBe(false);
					tx.run(sql`INSERT INTO mapped_files VALUES (${book.to})`);
					tx.run(sql`INSERT INTO mapped_files VALUES (${sidecar.to})`);
					return expected;
				}),
		});

		expect(result).toBe(expected);
		expect(fixture.rows()).toEqual([{ path: book.to }, { path: sidecar.to }]);
	});

	it("restores files and rolls back SQLite writes when the transaction fails", () => {
		const fixture = createFixture();
		const book = fixture.file("book.epub");
		const sidecar = fixture.file("book.srt");
		const failure = new Error("insert failed");

		expect(() =>
			executeMappingWithRollback({
				fs,
				logLabel: "test move",
				move: ({ movePath }) => {
					movePath(book);
					movePath(sidecar);
				},
				runTransaction: () =>
					fixture.db.transaction((tx) => {
						tx.run(sql`INSERT INTO mapped_files VALUES (${book.to})`);
						tx.run(sql`INSERT INTO mapped_files VALUES (${sidecar.to})`);
						throw failure;
					}),
			}),
		).toThrow(failure);

		expect(fixture.rows()).toEqual([]);
		for (const operation of [book, sidecar]) {
			expect(fs.readFileSync(operation.from, "utf8")).toBe(
				operation === book ? "book.epub" : "book.srt",
			);
			expect(fs.existsSync(operation.to)).toBe(false);
		}
	});

	it("restores dependent file and directory moves in reverse order", () => {
		const fixture = createFixture();
		const cover = fixture.file("extras/cover.jpg", "cover contents");
		const extras: MappingMoveOperation = {
			from: dirname(cover.from),
			to: dirname(cover.to),
			kind: "directory",
		};
		const relocatedCover = join(fixture.directory, "managed", "poster.jpg");
		const logWarn = vi.fn();

		expect(() =>
			executeMappingWithRollback({
				fs,
				logLabel: "asset move",
				logWarn,
				move: ({ movePath }) => {
					movePath(extras);
					movePath({ from: cover.to, to: relocatedCover, kind: "file" });
				},
				runTransaction: () => {
					throw new Error("transaction failed");
				},
			}),
		).toThrow("transaction failed");

		expect(fs.readFileSync(cover.from, "utf8")).toBe("cover contents");
		expect(fs.existsSync(extras.to)).toBe(false);
		expect(fs.existsSync(relocatedCover)).toBe(false);
		expect(logWarn).not.toHaveBeenCalled();
	});

	it("journals only successful moves and restores them when a later move fails", () => {
		const fixture = createFixture();
		const book = fixture.file("book.epub");
		const sidecar = fixture.file("book.srt");
		const failure = new Error("sidecar move failed");
		const filesystem = {
			...fs,
			renameSync(from: string, to: string) {
				if (from === sidecar.from) {
					throw failure;
				}
				fs.renameSync(from, to);
			},
		};
		const runTransaction = vi.fn(() =>
			fixture.db.run(sql`INSERT INTO mapped_files VALUES (${book.to})`),
		);
		const logWarn = vi.fn();

		expect(() =>
			executeMappingWithRollback({
				fs: filesystem,
				logLabel: "test move",
				logWarn,
				move: ({ movePath }) => {
					movePath(book);
					movePath(sidecar);
				},
				runTransaction,
			}),
		).toThrow(failure);

		expect(fs.readFileSync(book.from, "utf8")).toBe("book.epub");
		expect(fs.readFileSync(sidecar.from, "utf8")).toBe("book.srt");
		expect(fs.existsSync(book.to)).toBe(false);
		expect(fs.existsSync(sidecar.to)).toBe(false);
		expect(runTransaction).not.toHaveBeenCalled();
		expect(logWarn).not.toHaveBeenCalled();
		expect(fixture.rows()).toEqual([]);
	});

	it.each(["forward", "rollback"] as const)(
		"uses copy and unlink for cross-device file moves during %s",
		(phase) => {
			const fixture = createFixture();
			const book = fixture.file("book.epub");
			const filesystem = {
				...fs,
				renameSync() {
					throw crossDeviceError();
				},
			};
			const execute = () =>
				executeMappingWithRollback({
					fs: filesystem,
					logLabel: "test move",
					move: ({ movePath }) => movePath(book),
					runTransaction: () => {
						if (phase === "rollback") {
							throw new Error("transaction failed");
						}
						return "mapped";
					},
				});

			if (phase === "rollback") {
				expect(execute).toThrow("transaction failed");
				expect(fs.readFileSync(book.from, "utf8")).toBe("book.epub");
				expect(fs.existsSync(book.to)).toBe(false);
			} else {
				expect(execute()).toBe("mapped");
				expect(fs.readFileSync(book.to, "utf8")).toBe("book.epub");
				expect(fs.existsSync(book.from)).toBe(false);
			}
		},
	);

	it("removes a copied destination and restores earlier moves when source deletion fails", () => {
		const fixture = createFixture();
		const book = fixture.file("book.epub");
		const sidecar = fixture.file("book.srt");
		const failure = new Error("source delete failed");
		const filesystem = {
			...fs,
			renameSync(from: string, to: string) {
				if (from === sidecar.from) {
					throw crossDeviceError();
				}
				fs.renameSync(from, to);
			},
			unlinkSync(target: string) {
				if (target === sidecar.from) {
					throw failure;
				}
				fs.unlinkSync(target);
			},
		};
		const runTransaction = vi.fn();
		const logWarn = vi.fn();

		expect(() =>
			executeMappingWithRollback({
				fs: filesystem,
				logLabel: "test move",
				logWarn,
				move: ({ movePath }) => {
					movePath(book);
					movePath(sidecar);
				},
				runTransaction,
			}),
		).toThrow(failure);

		expect(fs.readFileSync(book.from, "utf8")).toBe("book.epub");
		expect(fs.readFileSync(sidecar.from, "utf8")).toBe("book.srt");
		expect(fs.existsSync(book.to)).toBe(false);
		expect(fs.existsSync(sidecar.to)).toBe(false);
		expect(runTransaction).not.toHaveBeenCalled();
		expect(logWarn).not.toHaveBeenCalled();
	});

	it("preserves the source deletion error if destination cleanup also fails", () => {
		const fixture = createFixture();
		const book = fixture.file("book.epub");
		const failure = new Error("source delete failed");
		const filesystem = {
			...fs,
			renameSync() {
				throw crossDeviceError();
			},
			unlinkSync(target: string) {
				throw target === book.from ? failure : new Error("cleanup failed");
			},
		};

		expect(() =>
			executeMappingWithRollback({
				fs: filesystem,
				logLabel: "test move",
				move: ({ movePath }) => movePath(book),
				runTransaction: vi.fn(),
			}),
		).toThrow(failure);

		expect(fs.readFileSync(book.from, "utf8")).toBe("book.epub");
		expect(fs.readFileSync(book.to, "utf8")).toBe("book.epub");
	});

	it("keeps the managed file if source deletion fails during reverse compensation", () => {
		const fixture = createFixture();
		const book = fixture.file("book.epub");
		const logWarn = vi.fn();
		const filesystem = {
			...fs,
			renameSync(from: string, to: string) {
				if (from === book.to) {
					throw crossDeviceError();
				}
				fs.renameSync(from, to);
			},
			unlinkSync(target: string) {
				if (target === book.to) {
					throw new Error("rollback delete failed");
				}
				fs.unlinkSync(target);
			},
		};

		expect(() =>
			executeMappingWithRollback({
				fs: filesystem,
				logLabel: "test move",
				logWarn,
				move: ({ movePath }) => movePath(book),
				runTransaction: () => {
					throw new Error("transaction failed");
				},
			}),
		).toThrow("transaction failed");

		expect(fs.readFileSync(book.to, "utf8")).toBe("book.epub");
		expect(fs.existsSync(book.from)).toBe(false);
		expect(logWarn).toHaveBeenCalledWith(
			"unmapped-files",
			expect.stringContaining("rollback delete failed"),
		);
	});

	it.each(["forward", "rollback"] as const)(
		"does not use file copy for cross-device directories during %s",
		(phase) => {
			const fixture = createFixture();
			const cover = fixture.file("extras/cover.jpg");
			const extras: MappingMoveOperation = {
				from: dirname(cover.from),
				to: dirname(cover.to),
				kind: "directory",
			};
			const failure = crossDeviceError();
			const copyFileSync = vi.fn(fs.copyFileSync);
			const logWarn = vi.fn();
			const filesystem = {
				...fs,
				copyFileSync,
				renameSync(from: string, to: string) {
					if (phase === "forward" || from === extras.to) {
						throw failure;
					}
					fs.renameSync(from, to);
				},
			};

			expect(() =>
				executeMappingWithRollback({
					fs: filesystem,
					logLabel: "directory move",
					logWarn,
					move: ({ movePath }) => movePath(extras),
					runTransaction: () => {
						throw new Error("transaction failed");
					},
				}),
			).toThrow(phase === "forward" ? failure : "transaction failed");

			expect(copyFileSync).not.toHaveBeenCalled();
			if (phase === "forward") {
				expect(fs.readFileSync(cover.from, "utf8")).toBe("extras/cover.jpg");
				expect(fs.existsSync(extras.to)).toBe(false);
				expect(logWarn).not.toHaveBeenCalled();
			} else {
				expect(fs.readFileSync(cover.to, "utf8")).toBe("extras/cover.jpg");
				expect(fs.existsSync(extras.from)).toBe(false);
				expect(logWarn).toHaveBeenCalledWith(
					"unmapped-files",
					expect.stringContaining(extras.from),
				);
			}
		},
	);

	it.each([
		new Error("permission denied"),
		Object.assign(new Error("not cross-device"), { code: "EACCES" }),
		{ code: "EXDEV" },
		"rename failed",
	])("does not copy after other rename errors: %j", (failure) => {
		const fixture = createFixture();
		const book = fixture.file("book.epub");
		const copyFileSync = vi.fn(fs.copyFileSync);
		const runTransaction = vi.fn();
		let observed: unknown;

		try {
			executeMappingWithRollback({
				fs: {
					...fs,
					copyFileSync,
					renameSync() {
						throw failure;
					},
				},
				logLabel: "test move",
				move: ({ movePath }) => movePath(book),
				runTransaction,
			});
		} catch (error) {
			observed = error;
		}

		expect(observed).toBe(failure);
		expect(fs.readFileSync(book.from, "utf8")).toBe("book.epub");
		expect(fs.existsSync(book.to)).toBe(false);
		expect(copyFileSync).not.toHaveBeenCalled();
		expect(runTransaction).not.toHaveBeenCalled();
	});

	it("does not delete the source or run the transaction if copying fails", () => {
		const fixture = createFixture();
		const book = fixture.file("book.epub");
		const runTransaction = vi.fn();
		const unlinkSync = vi.fn(fs.unlinkSync);

		expect(() =>
			executeMappingWithRollback({
				fs: {
					...fs,
					unlinkSync,
					renameSync() {
						throw crossDeviceError();
					},
					copyFileSync() {
						throw new Error("copy failed");
					},
				},
				logLabel: "test move",
				move: ({ movePath }) => movePath(book),
				runTransaction,
			}),
		).toThrow("copy failed");

		expect(fs.readFileSync(book.from, "utf8")).toBe("book.epub");
		expect(fs.existsSync(book.to)).toBe(false);
		expect(unlinkSync).not.toHaveBeenCalled();
		expect(runTransaction).not.toHaveBeenCalled();
	});

	it("recreates the original parent directory when restoring a move", () => {
		const fixture = createFixture();
		const book = fixture.file("nested/book.epub");

		expect(() =>
			executeMappingWithRollback({
				fs,
				logLabel: "test move",
				move: ({ movePath }) => movePath(book),
				runTransaction: () => {
					fs.rmSync(dirname(book.from), { recursive: true });
					throw new Error("transaction failed");
				},
			}),
		).toThrow("transaction failed");

		expect(fs.readFileSync(book.from, "utf8")).toBe("nested/book.epub");
		expect(fs.existsSync(book.to)).toBe(false);
	});

	it("warns about a missing rollback source and continues restoring other moves", () => {
		const fixture = createFixture();
		const book = fixture.file("book.epub");
		const sidecar = fixture.file("book.srt");
		const logWarn = vi.fn();

		expect(() =>
			executeMappingWithRollback({
				fs,
				logLabel: "test move",
				logWarn,
				move: ({ movePath }) => {
					movePath(book);
					movePath(sidecar);
				},
				runTransaction: () => {
					fs.unlinkSync(sidecar.to);
					throw new Error("transaction failed");
				},
			}),
		).toThrow("transaction failed");

		expect(fs.readFileSync(book.from, "utf8")).toBe("book.epub");
		expect(fs.existsSync(book.to)).toBe(false);
		expect(logWarn).toHaveBeenCalledWith(
			"unmapped-files",
			`Failed to roll back test move for ${sidecar.from}: Rollback source does not exist: ${sidecar.to}`,
		);
	});

	it.each([new Error("rollback failed"), "rollback failed"])(
		"warns about rollback errors without masking the original failure: %j",
		(failure) => {
			const fixture = createFixture();
			const book = fixture.file("book.epub");
			const sidecar = fixture.file("book.srt");
			const logWarn = vi.fn();
			const original = new Error("transaction failed");
			let observed: unknown;

			try {
				executeMappingWithRollback({
					fs: {
						...fs,
						renameSync(from: string, to: string) {
							if (from === sidecar.to) {
								throw failure;
							}
							fs.renameSync(from, to);
						},
					},
					logLabel: "test move",
					logWarn,
					move: ({ movePath }) => {
						movePath(book);
						movePath(sidecar);
					},
					runTransaction: () => {
						throw original;
					},
				});
			} catch (error) {
				observed = error;
			}

			expect(observed).toBe(original);
			expect(fs.readFileSync(book.from, "utf8")).toBe("book.epub");
			expect(fs.readFileSync(sidecar.to, "utf8")).toBe("book.srt");
			expect(logWarn).toHaveBeenCalledWith(
				"unmapped-files",
				`Failed to roll back test move for ${sidecar.from}: rollback failed`,
			);
		},
	);

	it("uses the default warning logger when rollback fails", () => {
		const fixture = createFixture();
		const book = fixture.file("book.epub");
		const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

		expect(() =>
			executeMappingWithRollback({
				fs,
				logLabel: "test move",
				move: ({ movePath }) => movePath(book),
				runTransaction: () => {
					fs.unlinkSync(book.to);
					throw new Error("transaction failed");
				},
			}),
		).toThrow("transaction failed");

		expect(warn).toHaveBeenCalledWith(
			expect.stringContaining(
				`[unmapped-files] Failed to roll back test move for ${book.from}`,
			),
		);
	});

	it.each(["rename", "copy"] as const)(
		"preserves existing destination replacement behavior during %s",
		(method) => {
			const fixture = createFixture();
			const book = fixture.file("book.epub", "new contents");
			fs.mkdirSync(dirname(book.to), { recursive: true });
			fs.writeFileSync(book.to, "old contents");
			const filesystem = {
				...fs,
				renameSync(from: string, to: string) {
					if (method === "copy") {
						throw crossDeviceError();
					}
					fs.renameSync(from, to);
				},
			};

			executeMappingWithRollback({
				fs: filesystem,
				logLabel: "test move",
				move: ({ movePath }) => movePath(book),
				runTransaction: () => "mapped",
			});

			expect(fs.readFileSync(book.to, "utf8")).toBe("new contents");
			expect(fs.existsSync(book.from)).toBe(false);
		},
	);
});
