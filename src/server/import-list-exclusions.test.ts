import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	all: vi.fn(),
	countResult: { count: 0 } as { count: number } | undefined,
	deleteRun: vi.fn(),
	requireAdmin: vi.fn(),
	requireAuth: vi.fn(),
}));

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
	eq: vi.fn((left: unknown, right: unknown) => ({ left, right })),
	sql: (...args: unknown[]) => ({ args }),
}));

vi.mock("src/db", () => ({
	db: {
		delete: vi.fn(() => ({
			where: vi.fn(() => ({
				run: mocks.deleteRun,
			})),
		})),
		select: vi.fn(() => ({
			from: vi.fn(() => ({
				get: vi.fn(() => mocks.countResult),
				orderBy: vi.fn(() => ({
					limit: vi.fn(() => ({
						offset: vi.fn(() => ({
							all: mocks.all,
						})),
					})),
				})),
			})),
		})),
	},
}));

vi.mock("src/db/schema", () => ({
	bookImportListExclusions: {
		createdAt: "bookImportListExclusions.createdAt",
		id: "bookImportListExclusions.id",
	},
	movieImportListExclusions: {
		createdAt: "movieImportListExclusions.createdAt",
		id: "movieImportListExclusions.id",
	},
}));

vi.mock("src/lib/validators", () => ({
	removeImportListExclusionSchema: {
		parse: (d: unknown) => d,
	},
	removeMovieImportExclusionSchema: {
		parse: (d: unknown) => d,
	},
}));

vi.mock("./middleware", () => ({
	requireAdmin: () => mocks.requireAdmin(),
	requireAuth: () => mocks.requireAuth(),
}));

import {
	getBookImportExclusionsFn,
	getMovieImportExclusionsFn,
	removeBookImportExclusionFn,
	removeMovieImportExclusionFn,
} from "./import-list-exclusions";

describe("server/import-list-exclusions", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.countResult = { count: 0 };
		mocks.all.mockReturnValue([]);
		mocks.requireAuth.mockResolvedValue({ user: { id: 1 } });
		mocks.requireAdmin.mockResolvedValue({
			user: { id: 1, role: "admin" },
		});
	});

	// ─── Book Exclusions ─────────────────────────────────────────────────

	describe("getBookImportExclusionsFn", () => {
		it("returns paginated items with total count using defaults", async () => {
			const rows = [{ id: 1, title: "Excluded Book" }];
			mocks.all.mockReturnValueOnce(rows);
			mocks.countResult = { count: 75 };

			const result = await getBookImportExclusionsFn({
				data: { page: 1, limit: 50 },
			});

			expect(result).toEqual({ items: rows, total: 75 });
			expect(mocks.requireAuth).toHaveBeenCalledTimes(1);
		});

		it("calculates correct offset for page 3 with limit 10", async () => {
			const { db } = await import("src/db");
			mocks.all.mockReturnValueOnce([]);
			mocks.countResult = { count: 30 };

			await getBookImportExclusionsFn({
				data: { page: 3, limit: 10 },
			});

			// offset = (3 - 1) * 10 = 20
			const fromChain = (db.select as ReturnType<typeof vi.fn>).mock.results[0]
				?.value;
			const orderByChain = fromChain.from.mock.results[0]?.value;
			const limitChain = orderByChain.orderBy.mock.results[0]?.value;
			const offsetChain = limitChain.limit.mock.results[0]?.value;

			expect(limitChain.limit).toHaveBeenCalledWith(10);
			expect(offsetChain.offset).toHaveBeenCalledWith(20);
		});

		it("returns total 0 when count query returns undefined", async () => {
			mocks.all.mockReturnValueOnce([]);
			mocks.countResult = undefined;

			const result = await getBookImportExclusionsFn({
				data: { page: 1, limit: 50 },
			});

			expect(result).toEqual({ items: [], total: 0 });
		});

		it("rejects when auth fails", async () => {
			mocks.requireAuth.mockRejectedValueOnce(new Error("unauthorized"));

			await expect(
				getBookImportExclusionsFn({ data: { page: 1, limit: 50 } }),
			).rejects.toThrow("unauthorized");
		});
	});

	describe("removeBookImportExclusionFn", () => {
		it("deletes the exclusion and returns success", async () => {
			const result = await removeBookImportExclusionFn({
				data: { id: 42 },
			});

			expect(result).toEqual({ success: true });
			expect(mocks.requireAdmin).toHaveBeenCalledTimes(1);
			expect(mocks.deleteRun).toHaveBeenCalledTimes(1);
		});

		it("rejects when admin auth fails", async () => {
			mocks.requireAdmin.mockRejectedValueOnce(new Error("forbidden"));

			await expect(
				removeBookImportExclusionFn({ data: { id: 1 } }),
			).rejects.toThrow("forbidden");

			expect(mocks.deleteRun).not.toHaveBeenCalled();
		});
	});

	// ─── Movie Exclusions ────────────────────────────────────────────────

	describe("getMovieImportExclusionsFn", () => {
		it("returns paginated items with total count", async () => {
			const rows = [{ id: 1, title: "Excluded Movie" }];
			mocks.all.mockReturnValueOnce(rows);
			mocks.countResult = { count: 120 };

			const result = await getMovieImportExclusionsFn({
				data: { page: 1, limit: 50 },
			});

			expect(result).toEqual({ items: rows, total: 120 });
			expect(mocks.requireAuth).toHaveBeenCalledTimes(1);
		});

		it("calculates correct offset for page 2 with limit 25", async () => {
			const { db } = await import("src/db");
			mocks.all.mockReturnValueOnce([]);
			mocks.countResult = { count: 50 };

			// Clear any prior calls from previous tests in this describe
			vi.mocked(db.select).mockClear();

			await getMovieImportExclusionsFn({
				data: { page: 2, limit: 25 },
			});

			// offset = (2 - 1) * 25 = 25
			const fromChain = (db.select as ReturnType<typeof vi.fn>).mock.results[0]
				?.value;
			const orderByChain = fromChain.from.mock.results[0]?.value;
			const limitChain = orderByChain.orderBy.mock.results[0]?.value;
			const offsetChain = limitChain.limit.mock.results[0]?.value;

			expect(limitChain.limit).toHaveBeenCalledWith(25);
			expect(offsetChain.offset).toHaveBeenCalledWith(25);
		});

		it("returns total 0 when count query returns undefined", async () => {
			mocks.all.mockReturnValueOnce([]);
			mocks.countResult = undefined;

			const result = await getMovieImportExclusionsFn({
				data: { page: 1, limit: 50 },
			});

			expect(result).toEqual({ items: [], total: 0 });
		});

		it("rejects when auth fails", async () => {
			mocks.requireAuth.mockRejectedValueOnce(new Error("unauthorized"));

			await expect(
				getMovieImportExclusionsFn({ data: { page: 1, limit: 50 } }),
			).rejects.toThrow("unauthorized");
		});
	});

	describe("removeMovieImportExclusionFn", () => {
		it("deletes the exclusion and returns success", async () => {
			const result = await removeMovieImportExclusionFn({
				data: { id: 99 },
			});

			expect(result).toEqual({ success: true });
			expect(mocks.requireAdmin).toHaveBeenCalledTimes(1);
			expect(mocks.deleteRun).toHaveBeenCalledTimes(1);
		});

		it("rejects when admin auth fails", async () => {
			mocks.requireAdmin.mockRejectedValueOnce(new Error("forbidden"));

			await expect(
				removeMovieImportExclusionFn({ data: { id: 1 } }),
			).rejects.toThrow("forbidden");

			expect(mocks.deleteRun).not.toHaveBeenCalled();
		});
	});
});
